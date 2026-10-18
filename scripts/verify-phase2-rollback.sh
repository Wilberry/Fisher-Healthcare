#!/usr/bin/env bash
set -Eeuo pipefail
[[ -n "${DATABASE_URL:-}" && "${FISHER_DISPOSABLE_DB_ACK:-}" == disposable-test-only ]] || exit 2
if ! DB_NAME="$(PGCONNECT_TIMEOUT=5 psql "$DATABASE_URL" -X -w -v ON_ERROR_STOP=1 -A -t -q -c 'SELECT current_database()')"; then
 echo "ERROR: Disposable PostgreSQL connection lost before rollback probe" >&2
 exit 2
fi
if [[ "$DB_NAME" != "fisher_test" ]]; then
 echo "ERROR: Refusing rollback probe outside fisher_test (connected database: $DB_NAME)" >&2
 exit 2
fi
result="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -t -A <<'SQL'
BEGIN;
CREATE SCHEMA fisher_phase2_rollback_probe;
SET LOCAL search_path TO fisher_phase2_rollback_probe, public;
\i packages/database/drizzle/0000_foundation.sql
\i packages/database/drizzle/0001_integrity.sql
\i packages/database/drizzle/0002_outbox_and_integrity.sql
\i packages/database/drizzle/0003_migration_registry.sql
\i packages/database/drizzle/0004_patient_booking.sql
\i packages/database/drizzle/0005_booking_idempotency.sql
\i packages/database/drizzle/0006_schedule_changes.sql
\i packages/database/drizzle/0007_notifications.sql
\i packages/database/drizzle/0008_checkout_recovery.sql
\i packages/database/drizzle/0009_collection_addresses.sql
\i packages/database/drizzle/0010_support_cases.sql
\i packages/database/drizzle/0011_payment_status_extension.sql
\i packages/database/drizzle/0012_catalog_approval_workflow.sql
\i packages/database/drizzle/0013_notification_delivery.sql
\i packages/database/drizzle/0014_guest_assisted_intake.sql
\i packages/database/drizzle/0015_booking_consent.sql
\i packages/database/drizzle/0016_public_request_throttle.sql
ROLLBACK;
SELECT CASE WHEN to_regnamespace('fisher_phase2_rollback_probe') IS NULL
 THEN 'ROLLBACK_OK' ELSE 'ROLLBACK_FAILED' END;
SQL
)"
printf '%s\n' "$result" | tail -n1 | grep -qx ROLLBACK_OK
printf 'PASS: Phase 2 transactional schema rollback\n'
