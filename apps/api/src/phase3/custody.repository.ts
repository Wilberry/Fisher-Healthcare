import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transitionCustody, CustodyConflict, type CustodyCommand, type CustodySnapshot } from './custody';

export interface CustodyReceipt { eventId: string; specimenId: string; state: string; version: number; }
export function commandFingerprint(command: CustodyCommand): string {
  const canonical = [command.specimenId, command.eventId, command.actorId, command.role, command.action,
    command.expectedVersion, command.recipientId ?? null, command.recipientAcknowledged ?? false];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
/**
 * Caller MUST supply an authenticated, authorization-checked actor and an active
 * transaction-scoped pg client. This repository does not authenticate requests.
 * All commands for one specimen serialize on its row lock.
 */
export async function recordCustodyEvent(client: PoolClient, command: CustodyCommand): Promise<CustodyReceipt> {
  const fingerprint = commandFingerprint(command);
  const existing = await client.query<{ fingerprint: string; receipt: CustodyReceipt }>(
    'SELECT fingerprint, receipt FROM phase3_custody_receipts WHERE event_id = $1', [command.eventId]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].fingerprint !== fingerprint) throw new CustodyConflict('EVENT_ID_REUSED');
    return existing.rows[0].receipt;
  }
  const locked = await client.query<{ id: string; status: CustodySnapshot['state']; custody_version: number }>(
    'SELECT id, status, custody_version FROM specimens WHERE id = $1 FOR UPDATE', [command.specimenId]
  );
  if (!locked.rows[0]) throw new CustodyConflict('SPECIMEN_NOT_FOUND');
  // Check again after acquiring the specimen lock: a concurrent retry may have committed.
  const retry = await client.query<{ fingerprint: string; receipt: CustodyReceipt }>(
    'SELECT fingerprint, receipt FROM phase3_custody_receipts WHERE event_id = $1', [command.eventId]
  );
  if (retry.rows[0]) {
    if (retry.rows[0].fingerprint !== fingerprint) throw new CustodyConflict('EVENT_ID_REUSED');
    return retry.rows[0].receipt;
  }
  const next = transitionCustody(
    { state: locked.rows[0].status, version: locked.rows[0].custody_version }, command
  );
  const receipt: CustodyReceipt = { eventId: command.eventId, specimenId: command.specimenId, state: next.state, version: next.version };
  await client.query('UPDATE specimens SET status = $2, custody_version = $3, updated_at = now() WHERE id = $1',
    [command.specimenId, next.state, next.version]);
  await client.query(
    'INSERT INTO custody_events(specimen_id, actor_id, event_type, payload, occurred_at) VALUES($1,$2,$3,$4::jsonb,now())',
    [command.specimenId, command.actorId, command.action,
      JSON.stringify({ eventId: command.eventId, version: next.version, recipientId: command.recipientId ?? null })]
  );
  await client.query('INSERT INTO phase3_custody_receipts(event_id, specimen_id, fingerprint, receipt) VALUES($1,$2,$3,$4::jsonb)',
    [command.eventId, command.specimenId, fingerprint, JSON.stringify(receipt)]);
  return receipt;
}
