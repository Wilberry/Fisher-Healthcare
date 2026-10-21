#!/usr/bin/env bash
# Acceptance is limited to synthetic-only infrastructure and exact committed source.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH="feat/phase4-lab-results-finance"
LOG="$ROOT/.verification/phase4-$(date +%Y%m%d-%H%M%S)"
SOURCE=""
CORE="NOT_RUN"
SMOKE="NOT_RUN"
API_PID=""
WEB_PID=""
fail(){ echo "ERROR: $*" >&2; exit 2; }
cleanup(){
  code=$?
  trap - EXIT
  if [[ -n "$WEB_PID" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  if [[ -d "$LOG" ]]; then
    {
      echo "Result: $([[ "$code" -eq 0 ]] && echo PASS || echo FAIL)"
      echo "Source: $SOURCE"
      echo "Core: $CORE"
      echo "Phase 4 smoke: $SMOKE"
      echo "Branch push: NO"
      git status --short
    } > "$LOG/summary.txt"
    echo "Phase 4 acceptance evidence: $LOG/summary.txt"
  fi
  exit "$code"
}
trap cleanup EXIT
[[ "${FISHER_PHASE4_LOCAL_ACK:-}" == "synthetic-only" ]] || fail "Synthetic-only acknowledgment required"
[[ "$(basename "$ROOT")" == Fisher-Healthcare-phase4-verification* ]] ||
  fail "A separate Phase 4 verification worktree is required"
[[ -z "$(git symbolic-ref --short -q HEAD || true)" ]] || fail "Detached worktree required"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Uncommitted changes"
for tool in git node pnpm corepack docker psql curl; do
  command -v "$tool" >/dev/null || fail "Missing prerequisite: $tool"
done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || fail "Node 22 required"
[[ "$(pnpm --version)" == 9.15.9 ]] || fail "pnpm 9.15.9 required"
SOURCE="$(git rev-parse HEAD)"
[[ "${FISHER_EXPECTED_COMMIT:-}" == "$SOURCE" ]] || fail "Expected commit mismatch"
git merge-base --is-ancestor 909971ac8ec482d23a714d64d8050d6aeea8a8bb HEAD ||
  fail "Merged Phase 3 baseline missing"
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
[[ "$(git rev-parse "refs/remotes/origin/$BRANCH")" == "$SOURCE" ]] ||
  fail "Remote branch changed"
for migration in 0026_phase4_result_intake_release.sql 0027_phase4_finance_reconciliation.sql \
  0028_phase4_result_email_delivery.sql 0029_phase4_refund_approval.sql \
  0030_phase4_lab_payables_settlements.sql \
  0031_phase4_result_email_preferences.sql \
  0032_phase4_finance_immutable_fields.sql; do
  [[ -f "packages/database/drizzle/$migration" ]] || fail "Missing $migration"
done
mkdir -p "$LOG"
node scripts/verify-phase3-openapi.mjs > "$LOG/01-phase3-contract.log" 2>&1 ||
  fail "Phase 3 OpenAPI regression"
node scripts/verify-phase4-openapi.mjs > "$LOG/02-phase4-contract.log" 2>&1 ||
  fail "Phase 4 committed OpenAPI mismatch"
# All dependency, build, unit, integration, migration, audit, and baseline
# smoke gates run under the accepted Phase 2/3 exact-commit verifier.
if FISHER_VERIFY_LOG_DIR="$LOG/core" \
 FISHER_PHASE2_LOCAL_ACK=synthetic-only \
 FISHER_PHASE2_ACCEPTANCE_ACK=exact-commit \
 FISHER_EXPECTED_COMMIT="$SOURCE" \
 FISHER_PHASE4_OPERATION_MODE=synthetic-only \
 bash scripts/verify-phase2-local.sh >"$LOG/03-core-output.log" 2>&1; then
 CORE="PASS"
else
 fail "Core acceptance failed; inspect $LOG/core/summary.txt"
fi
for entry in "Result: PASS" "Final acceptance: PASS" \
 "Production dependency audit: PASS" "Full dependency audit: PASS"; do
 grep -Fxq "$entry" "$LOG/core/summary.txt" || fail "Missing acceptance evidence: $entry"
done
node scripts/verify-phase4-openapi.mjs >"$LOG/04-contract-after-build.log" 2>&1 ||
  fail "Generated Phase 4 OpenAPI mismatch"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
  fail "The pinned worktree changed during verification"
# Without an identity token every patient and staff result/finance route
# must refuse access before exposing any metadata.
PORT="$((42000+RANDOM%3000))"
FISHER_API_BIND_HOST=127.0.0.1 PORT="$PORT" \
  node apps/api/dist/main.js >"$LOG/05-api.log" 2>&1 &
API_PID=$!
status(){
  curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true
}
health="http://127.0.0.1:$PORT/api/v1/health"
for i in $(seq 1 30); do
  [[ "$(status "$health")" == 200 ]] && break
  sleep 1
done
[[ "$(status "$health")" == 200 ]] || fail "API health smoke failed"
for path in /api/v1/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/results \
 /api/v1/results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa \
 /api/v1/results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/document \
 /api/v1/ops/results/pending \
  /api/v1/ops/results/intake-readiness \
  /api/v1/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/result-email-preference \
  /api/v1/finance/transactions /api/v1/finance/reconciliation \
  /api/v1/finance/refunds /api/v1/finance/lab-payables \
  /api/v1/finance/lab-settlements; do
  [[ "$(status "http://127.0.0.1:$PORT$path")" == 401 ]] ||
    fail "Unauthenticated route not denied: $path"
done
for path in /api/v1/ops/results/intake \
 /api/v1/ops/results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/release \
 /api/v1/finance/reconciliation/runs \
  /api/v1/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/result-email-preference \
  /api/v1/finance/refunds /api/v1/finance/refunds/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/review \
  /api/v1/finance/lab-payables /api/v1/finance/lab-settlements \
  /api/v1/finance/lab-settlements/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/review; do
  [[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' \
    -H 'content-type: application/json' -d '{}' \
    "http://127.0.0.1:$PORT$path" 2>/dev/null || true)" == 401 ]] ||
      fail "Unauthenticated mutation not denied: $path"
done
SMOKE="PASS"
kill "$API_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
API_PID=""
# Smoke newly built patient/operations pages in signed-out mode with no
# clinical data, staff bearer token, or live upstream connection.
WEB_PORT="$((47000+RANDOM%2000))"
for app in patient-web operations-web; do
  pnpm --filter "@fisher/$app" exec next start -p "$WEB_PORT" -H 127.0.0.1 \
    >"$LOG/06-$app-phase4.log" 2>&1 &
  WEB_PID=$!
  root="http://127.0.0.1:$WEB_PORT"
  ready="no"
  for i in $(seq 1 35); do
    if [[ "$(status "$root/")" == 200 ]]; then ready="yes"; break; fi
    sleep 1
  done
  [[ "$ready" == "yes" ]] || fail "Phase 4 $app startup failed"
  if [[ "$app" == patient-web ]]; then
    for path in /account/results \
      /account/results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa; do
      [[ "$(status "$root$path")" == 200 ]] ||
        fail "Signed-out patient results page failed: $path"
    done
    [[ "$(status "$root/api/phase4/results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/download")" == 401 ]] ||
      fail "Unauthenticated patient PDF proxy did not reject"
    deny="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' \
      -H 'content-type: application/json' \
      -d '{"enabled":true}' \
      "$root/api/phase4/patients/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/result-email-preference" 2>/dev/null || true)"
    [[ "$deny" == 403 ]] || fail "Patient result email proxy accepted originless mutation"
  else
    for path in /results /finance; do
      [[ "$(status "$root$path")" == 200 ]] ||
        fail "Signed-out staff page failed: $path"
    done
    for path in /api/phase4/ops/results/intake \
      /api/phase4/finance/refunds \
      /api/phase4/finance/reconciliation/runs \
      /api/phase4/finance/lab-settlements; do
      deny="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' \
        -H 'content-type: application/json' -d '{}' "$root$path" 2>/dev/null || true)"
      [[ "$deny" == 403 ]] || fail "Staff BFF accepted originless mutation: $path"
    done
  fi
  kill "$WEB_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  WEB_PID=""
  WEB_PORT="$((WEB_PORT+1))"
done
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
[[ "$(git rev-parse "refs/remotes/origin/$BRANCH")" == "$SOURCE" ]] ||
  fail "Source branch moved during acceptance"
[[ "$(git rev-parse HEAD)" == "$SOURCE" ]] || fail "Verification commit changed"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "Worktree not clean"
echo "PHASE4_LOCAL_ACCEPTED_SHA=$SOURCE"
echo "PHASE4_PUSHED=NO"
echo "Phase 4 is still synthetic-only and requires separate clinical release gates."
