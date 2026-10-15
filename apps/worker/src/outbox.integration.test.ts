import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimNext, completeClaim, failClaim, processOne } from './outbox';

const dbUrl = process.env.DATABASE_URL;
const suite = dbUrl ? describe : describe.skip;

suite.sequential('PostgreSQL outbox fencing', () => {
  let pool: Pool;
  const created: string[] = [];
  beforeAll(() => { pool = new Pool({ connectionString: dbUrl, max: 5 }); });
  afterAll(async () => {
    if (pool) {
      for (const id of created) await pool.query('DELETE FROM outbox WHERE id=$1::uuid', [id]);
      await pool.end();
    }
  });
  async function enqueue(type = 'foundation.ping'): Promise<string> {
    const id = randomUUID();
    await pool.query('INSERT INTO outbox(id,event_type,payload) VALUES($1,$2,$3::jsonb)', [id, type, '{}']);
    created.push(id);
    return id;
  }

  it('claims a queued event once and fences a wrong lease token', async () => {
    const id = await enqueue();
    const claims = await Promise.all([claimNext(pool), claimNext(pool)]);
    const valid = claims.filter(Boolean);
    expect(valid).toHaveLength(1);
    const claim = valid[0]!;
    expect(claim.id).toBe(id);
    expect(claim.attempts).toBe(1);
    expect(await completeClaim(pool, { id, lease_token: randomUUID() })).toBe(false);
    expect(await completeClaim(pool, claim)).toBe(true);
    expect(await completeClaim(pool, claim)).toBe(false);
    const row = await pool.query('SELECT processed_at FROM outbox WHERE id=$1', [id]);
    expect(row.rows[0]?.processed_at).toBeTruthy();
  });

  it('dead-letters an unknown event without executing external side effects', async () => {
    const id = await enqueue('not.registered');
    expect(await processOne(pool)).toBe(true);
    const row = await pool.query('SELECT dead_lettered_at, last_error FROM outbox WHERE id=$1', [id]);
    expect(row.rows[0]?.dead_lettered_at).toBeTruthy();
    expect(row.rows[0]?.last_error).toBe('UNSUPPORTED_EVENT');
  });

  it('requeues a handler failure with bounded retry delay', async () => {
    const id = await enqueue();
    const claim = await claimNext(pool);
    expect(claim?.id).toBe(id);
    expect(await failClaim(pool, claim!, 'HANDLER_FAILED')).toBe(true);
    const row = await pool.query('SELECT lease_token, available_at, dead_lettered_at FROM outbox WHERE id=$1', [id]);
    expect(row.rows[0]?.lease_token).toBeNull();
    expect(new Date(row.rows[0]!.available_at).getTime()).toBeGreaterThan(Date.now());
    expect(row.rows[0]?.dead_lettered_at).toBeNull();
  });
});
