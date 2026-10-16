#!/usr/bin/env bash
# Fisher Healthcare Phase 1: one-pass local verification; GitHub Actions is not required.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${FISHER_VERIFY_LOG_DIR:-$ROOT/.verification/phase1-$STAMP}"
POSTGRES_CONTAINER=""
API_PID=""
WEB_PID=""

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '\n==> %s\n' "$*"; }
require() { command -v "$1" >/dev/null 2>&1 || die "Missing prerequisite: $1"; }
cleanup() {
  local result=$?
  trap - EXIT
  if [[ -n "$WEB_PID" ]]; then kill "$WEB_PID" 2>/dev/null || true; wait "$WEB_PID" 2>/dev/null || true; fi
  if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi
  if [[ -n "$POSTGRES_CONTAINER" ]]; then
    if [[ "${FISHER_KEEP_VERIFY_DB:-0}" == "1" ]]; then
      printf 'Retaining only this disposable database for inspection: %s\n' "$POSTGRES_CONTAINER"
    else
      docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
    fi
  fi
  if [[ -d "$LOG_DIR" ]]; then
    {
      printf 'Result: %s\n' "$([[ "$result" -eq 0 ]] && echo PASS || echo FAIL)"
      printf 'Commit: %s\n' "$(git rev-parse HEAD)"
      printf 'Branch: %s\n' "$(git branch --show-current)"
      printf 'Timestamp: %s\n' "$STAMP"
      printf 'Lockfile: %s\n' "$([[ -f pnpm-lock.yaml ]] && sha256sum pnpm-lock.yaml | cut -d' ' -f1 || echo MISSING)"
      printf 'Generated lockfile during verification: %s\n' "${LOCKFILE_GENERATED:-no}"
      printf 'Lockfile committed at tested revision: %s\n' "${LOCKFILE_COMMITTED:-no}"
      printf 'Pending working-tree changes:\n'
      git status --short
    } > "$LOG_DIR/summary.txt"
    printf '\nVerification summary: %s\n' "$LOG_DIR/summary.txt"
  fi
  exit "$result"
}
trap cleanup EXIT

[[ "${FISHER_PHASE1_LOCAL_ACK:-}" == "synthetic-only" ]] ||
  die "Set FISHER_PHASE1_LOCAL_ACK=synthetic-only; never use patient or production data"
require git
require node
require corepack
require docker
require psql
require curl
require sha256sum
require timeout
[[ -f package.json && -f pnpm-workspace.yaml && -d apps/api ]] || die "Not the Fisher monorepo root"
# A failed first run may leave generated artifacts untracked; these do not count as acceptance.
STATUS_LINES="$(git status --porcelain --untracked-files=all)"
if [[ -n "$STATUS_LINES" ]]; then
  UNEXPECTED_CHANGES="$(printf '%s\n' "$STATUS_LINES" | grep -vE '^\\?\\? (pnpm-lock\\.yaml|docs/api/openapi\\.json)$' || true)"
  [[ -z "$UNEXPECTED_CHANGES" ]] || die "Unexpected worktree changes; do not reset or stash them automatically"
fi
[[ "$(git rev-parse --is-inside-work-tree)" == "true" ]] || die "No Git worktree"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" == "22" ]] || die "Node.js 22 is required (found $(node -v))"
docker info >/dev/null 2>&1 || die "Docker daemon unavailable; check permissions/service"
mkdir -p "$LOG_DIR"
printf 'Exact commit: %s\n' "$(git rev-parse HEAD)" | tee "$LOG_DIR/commit.txt"
printf 'Branch: %s\n' "$(git branch --show-current)" | tee -a "$LOG_DIR/commit.txt"
[[ -z "${FISHER_EXPECTED_COMMIT:-}" || "$(git rev-parse HEAD)" == "$FISHER_EXPECTED_COMMIT" ]] ||
  die "Current HEAD does not match FISHER_EXPECTED_COMMIT"

run_step() {
  local name="$1"; shift
  log "$name"
  printf '+ '; printf '%q ' "$@"; printf '\n'
  "$@" 2>&1 | tee "$LOG_DIR/$name.log"
}
log "Enable pnpm via Corepack"
corepack enable
[[ "$(pnpm --version)" == "9.15.9" ]] || die "Expected pnpm 9.15.9"
LOCKFILE_GENERATED=no
LOCKFILE_COMMITTED=no
if [[ ! -f pnpm-lock.yaml ]]; then
  LOCKFILE_GENERATED=yes
  run_step 01-lockfile pnpm install --lockfile-only --ignore-scripts
fi
if git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1; then
  LOCKFILE_COMMITTED=yes
fi
run_step 02-install pnpm install --frozen-lockfile
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
export NEXT_TELEMETRY_DISABLED=1
run_step 03-lint pnpm exec turbo run lint --concurrency=1
run_step 04-typecheck pnpm exec turbo run typecheck --concurrency=1
run_step 05-build pnpm exec turbo run build --concurrency=1

log "Start ONE disposable PostgreSQL container (no Supabase changes, no host port assumption)"
POSTGRES_CONTAINER="fisher-phase1-verify-${UID:-0}-$STAMP-$$"
docker run --detach --rm --name "$POSTGRES_CONTAINER" \
  --memory 768m --cpus 1.5 \
  -e POSTGRES_DB=fisher_test -e POSTGRES_USER=fisher -e POSTGRES_PASSWORD=fisher_local_verify_only \
  -p 127.0.0.1::5432 postgres:16-alpine > "$LOG_DIR/postgres-container-id.txt"
for attempt in $(seq 1 75); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)" == "healthy" ]]; then break; fi
  # The upstream image does not declare an image healthcheck: use pg_isready.
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U fisher -d fisher_test >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$POSTGRES_CONTAINER" pg_isready -U fisher -d fisher_test >/dev/null ||
  die "Disposable PostgreSQL did not become ready"
PORT_OUTPUT="$(docker port "$POSTGRES_CONTAINER" 5432/tcp | grep '^127.0.0.1:' | head -n1)"
DB_PORT="${PORT_OUTPUT##*:}"
[[ "$DB_PORT" =~ ^[0-9]+$ ]] || die "Cannot resolve disposable PostgreSQL port"
export DATABASE_URL="postgresql://fisher:fisher_local_verify_only@127.0.0.1:$DB_PORT/fisher_test"
export FISHER_DISPOSABLE_DB_ACK=disposable-test-only
run_step 06-migrations bash scripts/verify-database.sh
run_step 07-tests pnpm exec turbo run test --concurrency=1
run_step 08-openapi pnpm --filter @fisher/api openapi:generate
run_step 09-dependency-audit pnpm audit --audit-level high

check_http() {
  local url="$1" expected="$2"
  local actual
  actual="$(curl --max-time 8 --silent --output /dev/null --write-out '%{http_code}' "$url")"
  [[ "$actual" == "$expected" ]] || die "HTTP smoke expected $expected, got $actual for $url"
}
wait_for_http() {
  local url="$1" expected="$2"
  for attempt in $(seq 1 30); do
    if [[ "$(curl --max-time 2 --silent --output /dev/null --write-out '%{http_code}' "$url" || true)" == "$expected" ]]; then return 0; fi
    sleep 1
  done
  die "Service did not return $expected at $url. Consult smoke logs"
}

log "Smoke-test built API on loopback only"
API_PORT="$(( 41000 + RANDOM % 5000 ))"
PORT="$API_PORT" node apps/api/dist/main.js > "$LOG_DIR/10-api-smoke.log" 2>&1 &
API_PID=$!
wait_for_http "http://127.0.0.1:$API_PORT/api/v1/health" 200
check_http "http://127.0.0.1:$API_PORT/api/v1/identity/session" 401
kill "$API_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
API_PID=""

log "Smoke-test built Next.js interfaces sequentially"
WEB_PORT="$(( 46000 + RANDOM % 2000 ))"
for app in patient-web operations-web field-pwa; do
  pnpm --filter "@fisher/$app" exec next start -p "$WEB_PORT" -H 127.0.0.1 > "$LOG_DIR/11-$app-smoke.log" 2>&1 &
  WEB_PID=$!
  wait_for_http "http://127.0.0.1:$WEB_PORT/" 200
  check_http "http://127.0.0.1:$WEB_PORT/" 200
  kill "$WEB_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  WEB_PID=""
  WEB_PORT="$((WEB_PORT + 1))"
done

log "Source verification finished"
if [[ "$LOCKFILE_COMMITTED" != "yes" ]]; then
  printf 'IMPORTANT: pnpm-lock.yaml is not committed. Diagnostic run only; no Phase 1 acceptance yet.\n'
  printf 'Preserve and review the generated lockfile before committing.\n'
fi
[[ -f docs/api/openapi.json ]] || die "OpenAPI artifact missing after generation"
printf 'Do not merge, deploy or approve Phase 1 until all logs pass and the exact commit is reviewed.\n'
