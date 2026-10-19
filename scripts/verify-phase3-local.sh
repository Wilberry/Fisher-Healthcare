#!/usr/bin/env bash
# Synthetic-only Phase 3 exact-commit acceptance. Run in a NEW detached worktree.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH="feat/phase3-dispatch-collection-custody"
LOG="$ROOT/.verification/phase3-$(date +%Y%m%d-%H%M%S)"
API_PID=""
WEB_PID=""
PHASE3_SHA=""
RESULT=FAIL
CORE=NOT_RUN
SMOKE=NOT_RUN
PUSH=NOT_REQUESTED
fail() { echo "ERROR: $*" >&2; exit 2; }
cleanup() {
  local code=$?
  trap - EXIT
  [[ -z "$API_PID" ]] || { kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; }
  [[ -z "$WEB_PID" ]] || { kill "$WEB_PID" 2>/dev/null || true; wait "$WEB_PID" 2>/dev/null || true; }
  if [[ -d "$LOG" ]]; then
    {
      echo "Result: $([[ "$code" -eq 0 ]] && echo PASS || echo FAIL)"
      echo "Source commit: $SOURCE_SHA"
      echo "Verified commit: $PHASE3_SHA"
      echo "Core exact-commit verification: $CORE"
      echo "Phase 3 smoke: $SMOKE"
      echo "Pushed: $PUSH"
      echo "Pending working-tree changes:"
      git status --short
    } > "$LOG/summary.txt"
    echo "Phase 3 verification summary: $LOG/summary.txt"
  fi
  exit "$code"
}
trap cleanup EXIT
[[ "${FISHER_PHASE3_LOCAL_ACK:-}" == "synthetic-only" ]] || fail "Synthetic-only acknowledgment required"
[[ "$(basename "$ROOT")" == Fisher-Healthcare-phase3-verification* ]] || fail "Use a separate Phase 3 verification worktree"
[[ -z "$(git symbolic-ref -q --short HEAD || true)" ]] || fail "Detached worktree required"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Dirty worktree; no automatic cleanup"
for tool in git node corepack pnpm docker psql curl sha256sum; do
  command -v "$tool" >/dev/null || fail "Missing prerequisite $tool"
done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || fail "Node 22 required"
[[ "$(pnpm --version)" == 9.15.9 ]] || fail "pnpm 9.15.9 required"
SOURCE_SHA="$(git rev-parse HEAD)"
[[ "${FISHER_EXPECTED_COMMIT:-}" == "$SOURCE_SHA" ]] || fail "Exact source SHA required"
git merge-base --is-ancestor a4ee07a95532a7be4252191d56dc8a9fbf906d0b HEAD ||
  fail "Merged Phase 2 main baseline is missing"
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
[[ "$(git rev-parse "refs/remotes/origin/$BRANCH")" == "$SOURCE_SHA" ]] ||
  fail "Remote Phase 3 has changed; reconcile before verification"
for version in 0017 0018 0019 0020 0021 0022 0023 0024; do
  compgen -G "packages/database/drizzle/${version}_phase3_*.sql" >/dev/null ||
    fail "Missing Phase 3 migration $version"
done
mkdir -p "$LOG"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
export NEXT_TELEMETRY_DISABLED=1

# Prepare a generated OpenAPI contract locally from the integrated source.
pnpm install --frozen-lockfile > "$LOG/01-install.log" 2>&1 || fail "Frozen install failed"
pnpm exec turbo run build --filter=@fisher/api... --concurrency=1 \
  > "$LOG/02-api-build.log" 2>&1 || fail "API build failed"
pnpm --filter @fisher/api openapi:generate \
  > "$LOG/03-openapi-generate.log" 2>&1 || fail "OpenAPI generation failed"
node scripts/verify-phase3-openapi.mjs > "$LOG/04-openapi-parity.log" 2>&1 ||
  fail "OpenAPI contract mismatch"
while IFS= read -r changed; do
  case "$changed" in
    " M docs/api/openapi.json"|"") ;;
    *) fail "Unexpected generated modification: $changed" ;;
  esac
done < <(git status --porcelain --untracked-files=all)
if ! git diff --quiet -- docs/api/openapi.json; then
  git add -- docs/api/openapi.json
  git diff --cached --check
  git commit -m "build(phase3): pin reviewed Phase 3 generated OpenAPI" > "$LOG/05-artifact-commit.log"
fi
PHASE3_SHA="$(git rev-parse HEAD)"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Uncommitted artifacts"

# One Phase 2 baseline verifier also runs ALL added Phase 3 migrations and
# synthetic integration tests. The new worktree SHA is pinned after OpenAPI.
unset FISHER_PHASE3_OPERATION_MODE
if FISHER_VERIFY_LOG_DIR="$LOG/core" \
  FISHER_PHASE2_LOCAL_ACK=synthetic-only \
  FISHER_PHASE2_ACCEPTANCE_ACK=exact-commit \
  FISHER_EXPECTED_COMMIT="$PHASE3_SHA" \
  bash scripts/verify-phase2-local.sh > "$LOG/06-core-output.log" 2>&1; then
  :
else
  fail "Core verifier failed, inspect $LOG/core/summary.txt"
fi
for entry in "Result: PASS" "Final acceptance: PASS" \
  "Production dependency audit: PASS" "Full dependency audit: PASS"; do
  grep -Fxq "$entry" "$LOG/core/summary.txt" || fail "Missing acceptance: $entry"
done
node scripts/verify-phase3-openapi.mjs > "$LOG/07-openapi-after-build.log" 2>&1 ||
  fail "OpenAPI parity regression"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
  fail "Verifier changed tracked files"
CORE=PASS

http_status() {
  curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true
}
await_http() {
  for count in $(seq 1 30); do
    [[ "$(http_status "$1")" == "$2" ]] && return 0
    sleep 1
  done
  fail "Expected $2 from $1"
}
API_PORT="$((41000+RANDOM%4000))"
FISHER_API_BIND_HOST=127.0.0.1 PORT="$API_PORT" \
  node apps/api/dist/main.js > "$LOG/08-api-smoke.log" 2>&1 &
API_PID=$!
await_http "http://127.0.0.1:$API_PORT/api/v1/health" 200
for route in /api/v1/ops/assignments/queue /api/v1/field/assignments \
 /api/v1/field/handoff-offers /api/v1/ops/exceptions; do
  [[ "$(http_status "http://127.0.0.1:$API_PORT$route")" == 401 ]] ||
    fail "Unauthenticated Phase 3 API route not denied: $route"
done
kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; API_PID=""

WEB_PORT="$((47000+RANDOM%3000))"
for app in operations-web field-pwa; do
  route=dispatch
  [[ "$app" != field-pwa ]] || route=visits
  pnpm --filter "@fisher/$app" exec next start -p "$WEB_PORT" -H 127.0.0.1 \
    > "$LOG/09-$app-smoke.log" 2>&1 &
  WEB_PID=$!
  await_http "http://127.0.0.1:$WEB_PORT/$route" 200
  curl -sS --max-time 15 "http://127.0.0.1:$WEB_PORT/$route" > "$LOG/$app-locked.html"
  if [[ "$app" == operations-web ]]; then
    grep -q "Staff identity verification required" "$LOG/$app-locked.html" ||
      fail "Dispatch authentication boundary missing"
    ! grep -q "SYN-DSP-001" "$LOG/$app-locked.html" ||
      fail "Synthetic work items leaked into locked dispatch page"
  else
    grep -q "Assigned staff sign-in required" "$LOG/$app-locked.html" ||
      fail "Field authentication boundary missing"
  fi
  kill "$WEB_PID" 2>/dev/null || true; wait "$WEB_PID" 2>/dev/null || true; WEB_PID=""
  WEB_PORT="$((WEB_PORT+1))"
done
SMOKE=PASS
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Dirty final tree"

if [[ "${FISHER_PHASE3_PUSH_ON_PASS:-0}" == 1 ]]; then
  git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  [[ "$(git rev-parse "refs/remotes/origin/$BRANCH")" == "$SOURCE_SHA" ]] ||
    fail "Phase 3 branch moved during verification; push refused"
  [[ "$PHASE3_SHA" == "$SOURCE_SHA" ]] ||
    git push origin "HEAD:refs/heads/$BRANCH" || fail "Non-force Phase 3 push rejected"
  PUSH=YES
fi
RESULT=PASS
echo "PHASE3_LOCAL_ACCEPTED_SHA=$PHASE3_SHA"
echo "PHASE3_PUSHED=$PUSH"
echo "Phase 3 remains subject to final PR review and separate live-service gates."
