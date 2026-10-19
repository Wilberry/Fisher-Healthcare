#!/usr/bin/env bash
# Checksummed Phase 2 migrations against one disposable local PostgreSQL database.
set -Eeuo pipefail
[[ -n "${DATABASE_URL:-}" ]] || { echo "ERROR: DATABASE_URL missing" >&2; exit 2; }
[[ "${FISHER_DISPOSABLE_DB_ACK:-}" == disposable-test-only ]] || {
 echo "ERROR: Dedicated disposable verification acknowledgment missing" >&2; exit 2;
}
# Never conflate an unavailable PostgreSQL connection with a wrong database.
if ! DB_NAME="$(PGCONNECT_TIMEOUT=5 psql "$DATABASE_URL" -X -w -v ON_ERROR_STOP=1 -A -t -q -c 'SELECT current_database()')"; then
 echo "ERROR: Disposable PostgreSQL connection lost or unavailable before migrations; no database identity was verified" >&2
 exit 2
fi
if [[ "$DB_NAME" != "fisher_test" ]]; then
 echo "ERROR: Refusing verification outside fisher_test (connected database: $DB_NAME)" >&2
 exit 2
fi
FISHER_MIGRATE_ACK=apply-reviewed-migrations pnpm --filter @fisher/database migrate
pnpm --filter @fisher/database migrate:check
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f scripts/verify-phase2-postgres.sql
bash scripts/verify-phase2-rollback.sh
printf 'PASS: Phase 2 migrations, SQL constraints and rollback checks\n'
