#!/usr/bin/env bash
# Fast, isolated PostgreSQL readiness diagnostic. No pnpm install or builds.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "${FISHER_PHASE1_LOCAL_ACK:-}" == "synthetic-only" ]] || {
  echo "Refusing test database creation without FISHER_PHASE1_LOCAL_ACK=synthetic-only" >&2; exit 2;
}
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 2; }
command -v psql >/dev/null || { echo 'PostgreSQL client psql is required' >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo 'Docker daemon not accessible' >&2; exit 2; }
LOG_DIR="${FISHER_PG_DIAGNOSTICS_DIR:-$ROOT/.verification/postgres-preflight-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$LOG_DIR"
CONTAINER="fisher-pg-preflight-${UID:-0}-$$"
CREATED=no
capture() {
  if [[ "$CREATED" == yes ]]; then
    docker logs --timestamps --tail 160 "$CONTAINER" > "$LOG_DIR/postgres.log" 2>&1 || true
    docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom_killed={{.State.OOMKilled}} error={{.State.Error}}' "$CONTAINER" > "$LOG_DIR/state.txt" 2>&1 || true
  fi
  {
    echo "Docker system capacity (aggregate; no other containers touched):"
    docker system df 2>&1 || true
    echo "Disk for project directory:"
    df -Pk "$ROOT" 2>&1 || true
    echo "Host memory:"
    free -h 2>&1 || true
  } > "$LOG_DIR/host-resources.txt"
}
cleanup() {
  local status=$?
  trap - EXIT
  capture
  if [[ "$CREATED" == yes ]]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  printf '\nPostgreSQL diagnostic result: %s\n' "$([[ "$status" -eq 0 ]] && echo PASS || echo FAIL)"
  printf 'Evidence: %s\n' "$LOG_DIR"
  exit "$status"
}
trap cleanup EXIT

echo 'Starting one disposable synthetic PostgreSQL 16 container; no existing containers or volumes will be changed.'
if docker run -d --name "$CONTAINER" --memory 768m --cpus 1.5 \
     -e POSTGRES_DB=fisher_test -e POSTGRES_USER=fisher \
     -e POSTGRES_PASSWORD=fisher_local_verify_only \
     -p 127.0.0.1::5432 postgres:16-alpine > "$LOG_DIR/container-id.txt" 2> "$LOG_DIR/docker-run-error.txt"; then
  CREATED=yes
else
  echo 'Docker could not start the disposable container; inspect docker-run-error.txt' >&2
  exit 1
fi

READY=no
for attempt in $(seq 1 45); do
  STATE="$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null || true)"
  case "$STATE" in
    exited|dead|removing|'')
      echo "PostgreSQL container exited before readiness (state=$STATE)." >&2
      exit 1 ;;
  esac
  if docker exec "$CONTAINER" pg_isready -U fisher -d fisher_test >/dev/null 2>&1; then
    READY=yes
    break
  fi
  sleep 1
done
if [[ "$READY" != yes ]]; then
  echo 'PostgreSQL failed to accept connections within 45 seconds.' >&2
  exit 1
fi

BINDING="$(docker port "$CONTAINER" 5432/tcp | grep '^127.0.0.1:' | head -n1)"
PORT="${BINDING##*:}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo 'No loopback PostgreSQL port found' >&2; exit 1; }
DATABASE="$(PGPASSWORD=fisher_local_verify_only psql -X -At -h 127.0.0.1 -p "$PORT" -U fisher -d fisher_test -v ON_ERROR_STOP=1 -c 'SELECT current_database()' 2>"$LOG_DIR/psql-error.txt")"
[[ "$DATABASE" == fisher_test ]] || { echo 'Host psql failed to connect to the disposable fisher_test database' >&2; exit 1; }

echo 'PostgreSQL container and loopback client connection: PASS.'
echo 'Only synthetic test resources were used; the single container will be removed.'
