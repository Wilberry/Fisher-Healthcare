import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimNext, completeClaim, failClaim, processOne } from './outbox';

const dbUrl = process.env.DATABASE_URL;
const suite = dbUrl && process.env.FISHER_DISPOSABLE_DB_ACK === 'disposable-test-only' ? describe : describe.skip;

suite.sequential('PostgreSQL outbox fencing', () => {
  let pool: Pool;
  const created: string[] = [];
  const schema = 'outbox_test_' + randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    if (!dbUrl || process.env.FISHER_DISPOSABLE_DB_ACK !== 'disposable-test-only') {
      throw new Error('Disposable outbox test environment is required');
    }
    pool = new Pool({ connectionString: dbUrl, max: 5,
      options: '-c search_path=' + schema + ',public' });
    const identity = await pool.query('SELECT current_database() AS db');
    if (identity.rows[0]?.db !== 'fisher_test') {
      throw new Error('Refusing outbox mutation outside fisher_test');
    }
    // API suites leave legitimate queued events in public.outbox. Isolate the
    // queue while retaining the actual migrated columns, indexes and checks.
    await pool.query('CREATE SCHEMA ' + schema);
    await pool.query('CREATE TABLE ' + schema + '.outbox (LIKE public.outbox INCLUDING ALL)');
  });
  afterAll(async () => {
    if (pool) {
      for (const id of created) await pool.query('DELETE FROM outbox WHERE id=$1::uuid', [id]);
      await pool.query('DROP SCHEMA ' + schema + ' CASCADE');
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

  it('reclaims an expired lease while rejecting the old worker acknowledgment', async () => {
    const id = await enqueue();
    const first = await claimNext(pool, 5);
    expect(first?.id).toBe(id);
    await pool.query(
      `UPDATE outbox SET lease_expires_at=now()-interval '1 second' WHERE id=$1`,
      [id]
    );
    const replacement = await claimNext(pool, 5);
    expect(replacement?.id).toBe(id);
    expect(replacement?.lease_token).not.toBe(first?.lease_token);
    expect(await completeClaim(pool, first!)).toBe(false);
    expect(await completeClaim(pool, replacement!)).toBe(true);
  });

  it('dead-letters handler failures after the configured attempt limit', async () => {
    const id = await enqueue();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      if (attempt > 1) {
        await pool.query('UPDATE outbox SET available_at=now() WHERE id=$1', [id]);
      }
      const claim = await claimNext(pool, 5);
      expect(claim?.id).toBe(id);
      expect(claim?.attempts).toBe(attempt);
      expect(await failClaim(pool, claim!, 'HANDLER_FAILED', 5)).toBe(true);
    }
    const row = await pool.query(
      'SELECT dead_lettered_at, attempts, last_error FROM outbox WHERE id=$1',
      [id]
    );
    expect(row.rows[0]?.attempts).toBe(5);
    expect(row.rows[0]?.dead_lettered_at).toBeTruthy();
    expect(row.rows[0]?.last_error).toBe('HANDLER_FAILED');
    expect(await claimNext(pool)).toBeUndefined();
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
