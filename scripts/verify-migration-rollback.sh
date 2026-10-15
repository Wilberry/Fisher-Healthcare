#!/usr/bin/env bash
set -Eeuo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
test "${FISHER_DISPOSABLE_DB_ACK:-}" = "disposable-test-only" || {
  echo 'Refusing rollback validation outside explicit disposable test scope' >&2; exit 2;
}
# Execute all DDL in a fresh transaction-scoped schema, then prove it disappears on ROLLBACK.
# Do not use generic DROP DATABASE/DROP SCHEMA cleanup.
result="$(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -t -A <<'SQL'
BEGIN;
CREATE SCHEMA fisher_phase1_rollback_probe;
SET LOCAL search_path TO fisher_phase1_rollback_probe, public;
\i packages/database/drizzle/0000_foundation.sql
\i packages/database/drizzle/0001_integrity.sql
\i packages/database/drizzle/0002_outbox_and_integrity.sql
\i packages/database/drizzle/0003_migration_registry.sql
ROLLBACK;
SELECT CASE WHEN to_regnamespace('fisher_phase1_rollback_probe') IS NULL
  THEN 'ROLLBACK_OK' ELSE 'ROLLBACK_FAILED' END;
SQL
)"
printf '%s\n' "$result" | tail -n 1 | grep -qx ROLLBACK_OK
echo 'Disposable SQL transactional rollback verified.'
