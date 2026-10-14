#!/usr/bin/env bash
set -Eeuo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a disposable PostgreSQL database URL}"
case "${FISHER_DISPOSABLE_DB_ACK:-}" in
  disposable-test-only) ;;
  *) echo "Refusing migration without FISHER_DISPOSABLE_DB_ACK=disposable-test-only" >&2; exit 2;;
esac
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -1 -f packages/database/drizzle/0000_foundation.sql
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -1 -f packages/database/drizzle/0001_integrity.sql
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | grep -qx '15'
echo "Verified 15 application tables and applied integrity migration."
