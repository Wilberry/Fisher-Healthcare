#!/usr/bin/env bash
# Fisher Healthcare Phase 2: one-pass local verification; GitHub Actions is not required.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${FISHER_VERIFY_LOG_DIR:-$ROOT/.verification/phase2-$STAMP}"
POSTGRES_CONTAINER=""
POSTGRES_CREATED=no
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
  if [[ "$POSTGRES_CREATED" == yes ]]; then
    # Capture evidence BEFORE removing the one scoped disposable container.
    docker logs --timestamps --tail 180 "$POSTGRES_CONTAINER" > "$LOG_DIR/postgres.log" 2>&1 || true
    docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom_killed={{.State.OOMKilled}} error={{.State.Error}}' "$POSTGRES_CONTAINER" > "$LOG_DIR/postgres-state.txt" 2>&1 || true
    if [[ "${FISHER_KEEP_VERIFY_DB:-0}" == "1" ]]; then
      printf 'Retaining this one disposable container for investigation: %s\n' "$POSTGRES_CONTAINER"
    else
      docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
    fi
  fi
  if [[ "$result" -ne 0 && -d "$LOG_DIR" ]]; then
    {
      docker system df 2>&1 || true
      df -Pk "$ROOT" 2>&1 || true
      free -h 2>&1 || true
    } > "$LOG_DIR/local-resources.txt"
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
      printf 'Untracked lockfile refreshed for manifests: %s\n' "${LOCKFILE_REFRESHED:-no}"
      printf 'Production dependency audit: %s\n' "${PROD_AUDIT_STATUS:-NOT_RUN}"
      printf 'Full dependency audit: %s\n' "${FULL_AUDIT_STATUS:-NOT_RUN}"
      printf 'Previously generated Next.js tracked differences: %s\n' "${NEXT_GENERATED_DIRTY:-no}"
      printf 'Final acceptance: %s\n' "${FINAL_ACCEPTANCE_STATUS:-NOT_REQUESTED}"
      printf 'Pending working-tree changes:\n'
      git status --short
    } > "$LOG_DIR/summary.txt"
    printf '\nVerification summary: %s\n' "$LOG_DIR/summary.txt"
  fi
  exit "$result"
}
trap cleanup EXIT

[[ "${FISHER_PHASE2_LOCAL_ACK:-}" == "synthetic-only" ]] ||
  die "Set FISHER_PHASE2_LOCAL_ACK=synthetic-only; never use patient or production data"
require git
require node
require corepack
require docker
require psql
require curl
require sha256sum
require timeout
[[ -f package.json && -f pnpm-workspace.yaml && -d apps/api ]] || die "Not the Fisher monorepo root"
# Failed Next builds can write type references and tsconfig defaults.
# Allow ONLY known generated paths and validate their content against Git HEAD.
# No files are removed, reverted, stashed, or silently accepted as a clean run.
STATUS_LINES="$(git status --porcelain --untracked-files=all)"
NEXT_GENERATED_DIRTY=no
if [[ -n "$STATUS_LINES" ]]; then
  while IFS= read -r changed; do
    case "$changed" in
      '?? pnpm-lock.yaml'|'?? docs/api/openapi.json') ;;
      ' M apps/patient-web/next-env.d.ts'|' M apps/patient-web/tsconfig.json'|\
      ' M apps/operations-web/next-env.d.ts'|' M apps/operations-web/tsconfig.json'|\
      ' M apps/field-pwa/next-env.d.ts'|' M apps/field-pwa/tsconfig.json')
        NEXT_GENERATED_DIRTY=yes ;;
      *) die "Unexpected worktree change: $changed. Do not reset or stash changes automatically" ;;
    esac
  done <<< "$STATUS_LINES"
fi
if [[ "$NEXT_GENERATED_DIRTY" == yes ]]; then
  node scripts/validate-next-generated.mjs || die "Next-generated worktree changes are not validated"
  printf 'WARN: Verified Next.js generated files differ from the pinned commit. This is diagnostic verification only.\n'
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
FINAL_ACCEPTANCE_STATUS=NOT_REQUESTED
if [[ "${FISHER_PHASE2_ACCEPTANCE_ACK:-}" == "exact-commit" ]]; then
  FINAL_ACCEPTANCE_STATUS=FAIL
  [[ -n "${FISHER_EXPECTED_COMMIT:-}" ]] || die "Exact-commit acceptance requires a pinned commit"
  [[ "$NEXT_GENERATED_DIRTY" == no && -z "$STATUS_LINES" ]] ||
    die "Exact-commit acceptance requires initially clean committed artifacts"
  git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1 ||
    die "Exact-commit acceptance requires a committed pnpm lockfile"
  git ls-files --error-unmatch docs/api/openapi.json >/dev/null 2>&1 ||
    die "Exact-commit acceptance requires a committed generated OpenAPI contract"
fi

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
LOCKFILE_REFRESHED=no
if git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1; then
  LOCKFILE_COMMITTED=yes
  # A reviewed and committed lockfile must match every manifest exactly.
  # Do not rewrite tracked lockfiles automatically.
else
  if [[ -f pnpm-lock.yaml ]]; then
    # Preserve the prior generated lockfile byte-for-byte before refreshing it.
    cp -p -- pnpm-lock.yaml "$LOG_DIR/pnpm-lock.previous.yaml"
  else
    LOCKFILE_GENERATED=yes
  fi
  LOCKFILE_REFRESHED=yes
  run_step 01-lockfile pnpm install --lockfile-only --ignore-scripts
fi
run_step 02-install pnpm install --frozen-lockfile
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
export NEXT_TELEMETRY_DISABLED=1
run_step 02b-next-lint-guards node scripts/eslint-next-guards.test.cjs
run_step 03-lint pnpm exec turbo run lint --concurrency=1
run_step 04-typecheck pnpm exec turbo run typecheck --concurrency=1
run_step 05-build pnpm exec turbo run build --concurrency=1

log "Start ONE disposable PostgreSQL container (no other services touched)"
POSTGRES_CONTAINER="fisher-phase2-verify-${UID:-0}-$STAMP-$$"
if docker run --detach --name "$POSTGRES_CONTAINER" \
  --memory 768m --cpus 1.5 \
  -e POSTGRES_DB=fisher_test -e POSTGRES_USER=fisher -e POSTGRES_PASSWORD=fisher_local_verify_only \
  -p 127.0.0.1::5432 postgres:16-alpine \
  > "$LOG_DIR/postgres-container-id.txt" 2> "$LOG_DIR/postgres-start-error.txt"; then
  POSTGRES_CREATED=yes
else
  # Do not touch any existing container; only inspect a container with our unique name.
  if docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then POSTGRES_CREATED=yes; fi
  die "Disposable PostgreSQL startup failed; inspect postgres-start-error.txt and postgres-state.txt"
fi

POSTGRES_READY=no
for attempt in $(seq 1 60); do
  state="$(docker inspect --format '{{.State.Status}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)"
  case "$state" in
    exited|dead|removing|'') die "PostgreSQL exited before readiness; inspect postgres.log and postgres-state.txt" ;;
  esac
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U fisher -d fisher_test >/dev/null 2>&1; then
    POSTGRES_READY=yes
    break
  fi
  sleep 1
done
[[ "$POSTGRES_READY" == yes ]] ||
  die "Disposable PostgreSQL did not become ready within 60 seconds; inspect postgres.log, postgres-state.txt and local-resources.txt"

PORT_OUTPUT="$(docker port "$POSTGRES_CONTAINER" 5432/tcp | grep '^127.0.0.1:' | head -n1)"
DB_PORT="${PORT_OUTPUT##*:}"
[[ "$DB_PORT" =~ ^[0-9]+$ ]] || die "Cannot resolve disposable PostgreSQL loopback port"
export DATABASE_URL="postgresql://fisher:fisher_local_verify_only@127.0.0.1:$DB_PORT/fisher_test"
export FISHER_DISPOSABLE_DB_ACK=disposable-test-only
# In-container pg_isready checks only its Unix socket. Confirm the exact
# loopback host connection too before running even disposable migrations.
POSTGRES_TCP_READY=no
for attempt in $(seq 1 20); do
  if PGCONNECT_TIMEOUT=3 psql "$DATABASE_URL" -X -w -v ON_ERROR_STOP=1 -A -t -q -c 'SELECT current_database()' \
     > "$LOG_DIR/postgres-tcp-probe.log" 2>&1; then
    [[ "$(cat "$LOG_DIR/postgres-tcp-probe.log")" == "fisher_test" ]] ||
      die "Unexpected database identity from disposable TCP connection"
    POSTGRES_TCP_READY=yes
    break
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)"
  case "$state" in
    exited|dead|removing|'') die "Disposable PostgreSQL stopped before TCP readiness; inspect postgres-state.txt and postgres.log" ;;
  esac
  sleep 1
done
[[ "$POSTGRES_TCP_READY" == yes ]] ||
  die "Disposable PostgreSQL TCP unavailable; inspect postgres-tcp-probe.log, postgres-state.txt and local-resources.txt"
if run_step 06-migrations bash scripts/verify-phase2-database.sh; then
  :
else
  printf 'ERROR: Migration verification failed; retained evidence: %s/06-migrations.log\n' "$LOG_DIR" >&2
  docker inspect --format 'postgres_status={{.State.Status}} exit={{.State.ExitCode}} oom_killed={{.State.OOMKilled}} error={{.State.Error}}' \
    "$POSTGRES_CONTAINER" >&2 || true
  die "Migrations failed; inspect 06-migrations.log, postgres-state.txt, postgres.log and local-resources.txt"
fi
run_step 07-tests env FISHER_PHASE2_BOOKING_MODE=synthetic FISHER_PHASE2_PAYMENT_MODE=staging PAYSTACK_SECRET_KEY=sk_test_synthetic_fisher_phase2 pnpm exec turbo run test --concurrency=1
run_step 08-openapi pnpm --filter @fisher/api openapi:generate

# Collect both production and full graph audit results, then ALWAYS exercise
# smoke tests; security findings still fail the overall acceptance afterward.
PROD_AUDIT_STATUS=PASS
FULL_AUDIT_STATUS=PASS
if run_step 09-production-audit pnpm audit --prod --audit-level high; then
  :
else
  PROD_AUDIT_STATUS=FAIL
  printf 'Production dependency audit found high/critical advisories.\n' >&2
fi
if run_step 10-dependency-audit pnpm audit --audit-level high; then
  :
else
  FULL_AUDIT_STATUS=FAIL
  printf 'Full dependency audit found high/critical advisories. Smoke tests will still run.\n' >&2
fi

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
check_http "http://127.0.0.1:$API_PORT/api/v1/catalog/tests" 200
check_http "http://127.0.0.1:$API_PORT/api/v1/service-zones" 200
check_http "http://127.0.0.1:$API_PORT/api/v1/patients" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/me/bookings" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/me/support-cases" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/ops/catalog/reviews" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/ops/guest-booking/requests" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/ops/work-queue/support" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/ops/work-queue/payment-exceptions" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/patients/00000000-0000-4000-8000-000000000001/addresses" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/me/bootstrap" 404
check_http "http://127.0.0.1:$API_PORT/api/v1/patients" 401
check_http "http://127.0.0.1:$API_PORT/api/v1/ops/patient-relationships/00000000-0000-4000-8000-000000000001/approve-booking" 404
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
  if [[ "$app" == "patient-web" ]]; then
    check_http "http://127.0.0.1:$WEB_PORT/tests" 200
    check_http "http://127.0.0.1:$WEB_PORT/book" 200
    check_http "http://127.0.0.1:$WEB_PORT/account" 200
    check_http "http://127.0.0.1:$WEB_PORT/support" 200
    check_http "http://127.0.0.1:$WEB_PORT/staff" 200
    check_http "http://127.0.0.1:$WEB_PORT/book/guest" 200
    check_http "http://127.0.0.1:$WEB_PORT/account/patients/new" 200
    check_http "http://127.0.0.1:$WEB_PORT/book/confirm" 200
    check_http "http://127.0.0.1:$WEB_PORT/account/bookings/00000000-0000-4000-8000-000000000001" 200
    check_http "http://127.0.0.1:$WEB_PORT/account/bookings/00000000-0000-4000-8000-000000000001/receipt" 200
    check_http "http://127.0.0.1:$WEB_PORT/account/patients/00000000-0000-4000-8000-000000000001/addresses/new" 200
    originless="$(curl --max-time 8 --silent --output /dev/null --write-out '%{http_code}' -X POST "http://127.0.0.1:$WEB_PORT/api/phase2/private/revoke" -H 'Content-Type: application/json' --data '{}')"
    [[ "$originless" == "403" ]] || die "Private BFF accepted an originless state change"
    guest_originless="$(curl --max-time 8 --silent --output /dev/null --write-out '%{http_code}' -X POST "http://127.0.0.1:$WEB_PORT/api/phase2/guest/start" -H 'Content-Type: application/json' --data '{}')"
    [[ "$guest_originless" == "403" ]] || die "Guest BFF accepted an originless state change"
  fi
  kill "$WEB_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  WEB_PID=""
  WEB_PORT="$((WEB_PORT + 1))"
done

log "Source verification finished"
if [[ "$LOCKFILE_COMMITTED" != "yes" || "$NEXT_GENERATED_DIRTY" == "yes" ]]; then
  printf 'IMPORTANT: Generated lockfile or Next.js tracked changes remain uncommitted.\n'
  printf 'Treat this as diagnostic verification; review and commit generated artifacts before final acceptance.\n'
fi
[[ -f docs/api/openapi.json ]] || die "OpenAPI artifact missing after generation"
if [[ "$PROD_AUDIT_STATUS" != PASS || "$FULL_AUDIT_STATUS" != PASS ]]; then
  die "Dependency security gate remains OPEN: production=$PROD_AUDIT_STATUS full=$FULL_AUDIT_STATUS. Review both audit logs. No waiver is applied."
fi
if [[ "${FISHER_PHASE2_ACCEPTANCE_ACK:-}" == "exact-commit" ]]; then
  [[ "$LOCKFILE_COMMITTED" == yes ]] || die "Final acceptance requires the committed dependency lockfile"
  [[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
    die "Final acceptance requires no generated or other uncommitted changes"
  FINAL_ACCEPTANCE_STATUS=PASS
  printf 'PASS: Phase 2 exact-commit local verification. Deployment and merge remain separate decisions.\n'
else
  printf 'Phase 2 diagnostic verification finished; exact-commit acceptance not requested.\n'
fi
