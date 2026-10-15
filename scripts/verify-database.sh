#!/usr/bin/env bash
set -Eeuo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a disposable PostgreSQL database URL}"
test "${FISHER_DISPOSABLE_DB_ACK:-}" = "disposable-test-only" || {
  echo 'Refusing verification without FISHER_DISPOSABLE_DB_ACK=disposable-test-only' >&2; exit 2;
}
# Apply reviewed migrations through the same checksummed runner used for staging.
FISHER_MIGRATE_ACK=apply-reviewed-migrations pnpm --filter @fisher/database migrate
pnpm --filter @fisher/database migrate:check
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -f scripts/verify-postgres.sql
bash scripts/verify-migration-rollback.sh
echo 'PostgreSQL migrations, authorization constraints, immutability and rollback checks completed.'
