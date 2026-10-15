import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

async function main(): Promise<void> {
  if (process.env.FISHER_SYNTHETIC_SEED_ACK !== 'isolated-disposable-only') {
    throw new Error('Synthetic seed requires explicit disposable database acknowledgment');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required');
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (databaseName !== 'fisher_dev' && databaseName !== 'fisher_test') {
    throw new Error('Synthetic seeds permitted only in fisher_dev or fisher_test');
  }
  const sql = await readFile(resolve(__dirname, '../seed/0000_synthetic.sql'), 'utf8');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.info('Inactive synthetic fixtures seeded in disposable database');
}
if (require.main === module) {
  void main().catch(() => {
    console.error('Synthetic seed refused or failed; no raw database details logged');
    process.exitCode = 1;
  });
}
