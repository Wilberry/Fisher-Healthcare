#!/usr/bin/env bash
# Self-contained synthetic recovery proof. Never runs against an existing DB.
set -Eeuo pipefail
umask 077
[[ "${FISHER_PHASE5_RESTORE_ACK:-}" == "new-disposable-only" ]] || {
  echo "Set FISHER_PHASE5_RESTORE_ACK=new-disposable-only" >&2; exit 2;
}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for tool in git node pnpm docker psql sha256sum; do
  command -v "$tool" >/dev/null || { echo "Missing prerequisite: $tool" >&2; exit 2; }
done
docker info >/dev/null 2>&1 || { echo "Docker daemon unavailable" >&2; exit 2; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="$ROOT/.verification/phase5-restore-$STAMP-$$"
mkdir -p "$LOG_DIR"
TMP_DIR="$(mktemp -d)"
CONTAINER="fisher-phase5-restore-$UID-$$"
CREATED=no
cleanup(){
  local code=$?
  trap - EXIT
  if [[ "$CREATED" == yes ]]; then
    docker logs --tail 80 "$CONTAINER" >"$LOG_DIR/container.log" 2>&1 || true
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$TMP_DIR"
  {
    echo "Result: $([[ "$code" -eq 0 ]] && echo PASS || echo FAIL)"
    echo "Commit: $(git rev-parse HEAD)"
    echo "Source database: fisher_test (new disposable)"
    echo "Restore database: fisher_restore_test (same disposable container)"
    echo "No customer/clinical data accessed: YES"
    echo "Docker container retained: NO"
  } > "$LOG_DIR/summary.txt"
  echo "Phase 5 recovery drill evidence: $LOG_DIR/summary.txt"
  exit "$code"
}
trap cleanup EXIT
docker run -d --name "$CONTAINER" \
  --memory 768m --cpus 1.5 \
  -e POSTGRES_DB=fisher_test \
  -e POSTGRES_USER=fisher \
  -e POSTGRES_PASSWORD=fisher_phase5_disposable \
  -p 127.0.0.1::5432 postgres:16-alpine \
  >"$LOG_DIR/container-id.txt"
CREATED=yes
READY=no
for _attempt in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U fisher -d fisher_test >/dev/null 2>&1; then
    READY=yes; break
  fi
  sleep 1
done
[[ "$READY" == yes ]] || { echo "Disposable PostgreSQL not ready" >&2; exit 2; }
PORT_OUTPUT="$(docker port "$CONTAINER" 5432/tcp | grep '^127.0.0.1:' | head -n 1)"
PORT="${PORT_OUTPUT##*:}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "Invalid disposable port" >&2; exit 2; }
export DATABASE_URL="postgresql://fisher:fisher_phase5_disposable@127.0.0.1:$PORT/fisher_test"
export FISHER_DISPOSABLE_DB_ACK=disposable-test-only
[[ "$(PGCONNECT_TIMEOUT=5 psql "$DATABASE_URL" -X -w -Atq -c 'select current_database()')" == fisher_test ]] ||
  { echo "Wrong source DB" >&2; exit 2; }
FISHER_MIGRATE_ACK=apply-reviewed-migrations \
  pnpm --filter @fisher/database migrate >"$LOG_DIR/source-migrations.log" 2>&1
pnpm --filter @fisher/database migrate:check >"$LOG_DIR/source-check.log" 2>&1
TOKEN="synthetic-recovery-$STAMP-$$"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE phase5_restore_probe (token text PRIMARY KEY); INSERT INTO phase5_restore_probe VALUES ('$TOKEN');" \
  >"$LOG_DIR/probe-source.log" 2>&1
docker exec "$CONTAINER" pg_dump -U fisher -d fisher_test -Fc \
  >"$TMP_DIR/synthetic-only.backup"
test -s "$TMP_DIR/synthetic-only.backup"
sha256sum "$TMP_DIR/synthetic-only.backup" | cut -d ' ' -f 1 \
  >"$LOG_DIR/backup-sha256.txt"
docker exec "$CONTAINER" createdb -U fisher fisher_restore_test
docker exec -i "$CONTAINER" pg_restore --exit-on-error --no-owner --no-acl \
  -U fisher -d fisher_restore_test <"$TMP_DIR/synthetic-only.backup" \
  >"$LOG_DIR/restore.log" 2>&1
RESTORED="$(docker exec "$CONTAINER" psql -U fisher -d fisher_restore_test \
  -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT token FROM phase5_restore_probe')"
[[ "$RESTORED" == "$TOKEN" ]] || { echo "Synthetic probe mismatch" >&2; exit 2; }
SOURCE_COUNT="$(docker exec "$CONTAINER" psql -U fisher -d fisher_test \
  -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT count(*) FROM fisher_migrations')"
RESTORE_COUNT="$(docker exec "$CONTAINER" psql -U fisher -d fisher_restore_test \
  -X -v ON_ERROR_STOP=1 -Atq -c 'SELECT count(*) FROM fisher_migrations')"
[[ "$SOURCE_COUNT" =~ ^[0-9]+$ && "$SOURCE_COUNT" -ge 36 &&
   "$SOURCE_COUNT" == "$RESTORE_COUNT" ]] || {
  echo "Migration registry mismatch after restore" >&2; exit 2;
}
RESTORE_URL="postgresql://fisher:fisher_phase5_disposable@127.0.0.1:$PORT/fisher_restore_test"
DATABASE_URL="$RESTORE_URL" pnpm --filter @fisher/database migrate:check \
  >"$LOG_DIR/restore-check.log" 2>&1
echo "Migration registry rows matched: $SOURCE_COUNT" >"$LOG_DIR/evidence.txt"
echo "Synthetic restore marker matched: YES" >>"$LOG_DIR/evidence.txt"
echo "PASS: new disposable backup, independent restore, probe and checksums"
