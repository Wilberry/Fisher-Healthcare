#!/usr/bin/env bash
# Checksummed Phase 2 migrations against one disposable local PostgreSQL database.
set -Eeuo pipefail
[[ -n "$DATABASE_URL" ]] || exit 2
[[ "$FISHER_DISPOSABLE_DB_ACK" == disposable-test-only ]] || exit 2
[[ "$(psql "$DATABASE_URL" -X -A -t -q -c 'SELECT current_database()')" == fisher_test ]] || {
 echo "Refusing verification outside fisher_test" >&2; exit 2;
}
FISHER_MIGRATE_ACK=apply-reviewed-migrations pnpm --filter @fisher/database migrate
pnpm --filter @fisher/database migrate:check
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f scripts/verify-phase2-postgres.sql
bash scripts/verify-phase2-rollback.sh
printf 'PASS: Phase 2 migrations, SQL constraints and rollback checks\n'
