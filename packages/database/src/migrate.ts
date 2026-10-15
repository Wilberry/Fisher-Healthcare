import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';

type Migration = { version: string; sha256: string; sql: string };
const DIRECTORY = resolve(__dirname, '../drizzle');

async function getMigrations(): Promise<Migration[]> {
  const names = (await readdir(DIRECTORY))
    .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (names.length === 0) throw new Error('No versioned SQL migrations found');
  const migrations: Migration[] = [];
  for (const version of names) {
    const sql = await readFile(join(DIRECTORY, version), 'utf8');
    migrations.push({
      version,
      sql,
      sha256: createHash('sha256').update(sql, 'utf8').digest('hex')
    });
  }
  return migrations;
}

export async function migrate(connectionString: string, mode: 'apply' | 'check'): Promise<number> {
  const migrations = await getMigrations();
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let applied = 0;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fisher-healthcare-migrations'))");
    if (mode === 'apply') {
      await client.query(`
        CREATE TABLE IF NOT EXISTS fisher_migrations (
          version varchar(120) PRIMARY KEY,
          sha256 char(64) NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`
      );
    }
    const existingTable = await client.query(
      "SELECT to_regclass('public.fisher_migrations') AS registry"
    );
    if (!existingTable.rows[0]?.registry) {
      throw new Error('No migration registry; apply reviewed migrations before checking');
    }
    const appliedRows = await client.query('SELECT version,sha256 FROM fisher_migrations');
    const onDisk = new Map(migrations.map(m => [m.version, m.sha256]));
    const onDatabase = new Map<string, string>(
      appliedRows.rows.map((row: { version: string; sha256: string }) => [row.version, row.sha256.trim()])
    );
    for (const [version, checksum] of onDatabase) {
      if (onDisk.get(version) !== checksum) throw new Error(`Migration checksum mismatch or missing file: ${version}`);
    }
    let pendingBeforeApplied = false;
    let observedApplied = false;
    for (const migration of migrations) {
      if (onDatabase.has(migration.version)) {
        if (pendingBeforeApplied) throw new Error('Out-of-order migration history');
        observedApplied = true;
        continue;
      }
      if (observedApplied && onDatabase.size > 0) {
        // A newly appended migration is acceptable; insertion between applied scripts is not.
        const newestApplied = [...onDatabase.keys()].sort().at(-1)!;
        if (migration.version < newestApplied) throw new Error('Out-of-order migration file');
      }
      pendingBeforeApplied = true;
      if (mode === 'check') throw new Error(`Migration pending: ${migration.version}`);
      await client.query(migration.sql);
      await client.query('INSERT INTO fisher_migrations(version,sha256) VALUES($1,$2)',
        [migration.version, migration.sha256]);
      applied += 1;
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(): Promise<void> {
  const requested = process.argv[2];
  if (requested !== 'apply' && requested !== 'check') throw new Error('Usage: migrate.ts apply|check');
  if (requested === 'apply' && process.env.FISHER_MIGRATE_ACK !== 'apply-reviewed-migrations') {
    throw new Error('Applying migrations requires explicit FISHER_MIGRATE_ACK=apply-reviewed-migrations');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const count = await migrate(url, requested);
  console.info(requested === 'apply' ? `Applied ${count} reviewed migrations` : 'All migration checksums verified');
}
if (require.main === module) {
  void main().catch(() => {
    // Keep database connection information and raw errors out of CI logs.
    console.error('Database migration validation failed; review the migration history and SQL locally');
    process.exitCode = 1;
  });
}
