import type { Pool } from 'pg';

export type OutboxClaim = {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
  lease_token: string;
};
export interface OutboxHandler {
  (payload: unknown): Promise<void>;
}
export const INITIAL_HANDLERS: Readonly<Record<string, OutboxHandler>> = {
  'foundation.ping': async () => { /* Safe synthetic readiness event; no external side effect. */ }
};

export async function claimNext(pool: Pool, leaseSeconds = 60): Promise<OutboxClaim | undefined> {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 3600) {
    throw new Error('Invalid lease interval');
  }
  const query = `
    WITH due AS (
      SELECT id FROM outbox
      WHERE processed_at IS NULL AND dead_lettered_at IS NULL
        AND available_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at < now())
      ORDER BY available_at, created_at, id
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE outbox AS o
    SET attempts = o.attempts + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + $1::integer * interval '1 second'
    FROM due
    WHERE o.id = due.id
    RETURNING o.id, o.event_type, o.payload, o.attempts, o.lease_token
  `;
  const result = await pool.query(query, [leaseSeconds]);
  return result.rows[0] as OutboxClaim | undefined;
}

export async function completeClaim(pool: Pool, claim: Pick<OutboxClaim, 'id' | 'lease_token'>): Promise<boolean> {
  const result = await pool.query(
    `UPDATE outbox SET processed_at=now(), lease_token=NULL, lease_expires_at=NULL, last_error=NULL
     WHERE id=$1::uuid AND lease_token=$2::uuid AND lease_expires_at>now()
       AND processed_at IS NULL AND dead_lettered_at IS NULL
     RETURNING id`, [claim.id, claim.lease_token]
  );
  return result.rowCount === 1;
}

export async function failClaim(
  pool: Pool, claim: OutboxClaim, errorCode: 'UNSUPPORTED_EVENT' | 'HANDLER_FAILED',
  maxAttempts = 5
): Promise<boolean> {
  const terminal = errorCode === 'UNSUPPORTED_EVENT' || claim.attempts >= maxAttempts;
  const retrySeconds = Math.min(3600, 5 * 2 ** Math.min(claim.attempts - 1, 9));
  const result = await pool.query(
    `UPDATE outbox SET lease_token=NULL, lease_expires_at=NULL,
       last_error=$3, available_at=now() + $4::integer * interval '1 second',
       dead_lettered_at=CASE WHEN $5::boolean THEN now() ELSE NULL END
     WHERE id=$1::uuid AND lease_token=$2::uuid AND lease_expires_at>now()
       AND processed_at IS NULL AND dead_lettered_at IS NULL RETURNING id`,
    [claim.id, claim.lease_token, errorCode, retrySeconds, terminal]
  );
  return result.rowCount === 1;
}

export async function processOne(pool: Pool, handlers: Readonly<Record<string, OutboxHandler>> = INITIAL_HANDLERS): Promise<boolean> {
  const job = await claimNext(pool);
  if (!job) return false;
  const handler = Object.prototype.hasOwnProperty.call(handlers, job.event_type)
    ? handlers[job.event_type]
    : undefined;
  if (!handler) {
    await failClaim(pool, job, 'UNSUPPORTED_EVENT');
    return true;
  }
  try {
    await handler(job.payload);
    if (!await completeClaim(pool, job)) throw new Error('Job lease expired before acknowledgment');
  } catch {
    await failClaim(pool, job, 'HANDLER_FAILED');
  }
  return true;
}
