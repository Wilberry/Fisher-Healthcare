#!/usr/bin/env bash
# Exact-commit, synthetic-only Phase 5 source and isolated recovery acceptance.
set -Eeuo pipefail
umask 077
[[ "${FISHER_PHASE5_LOCAL_ACK:-}" == "synthetic-only" ]] ||
  { echo "Set FISHER_PHASE5_LOCAL_ACK=synthetic-only" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH=feat/phase5-production-readiness
SHA="$(git rev-parse HEAD)"
[[ "$(basename "$ROOT")" == Fisher-Healthcare-phase5-verification* ]] ||
 { echo "Require an isolated phase5 verification worktree" >&2; exit 2; }
[[ -z "$(git symbolic-ref --short -q HEAD || true)" ]] ||
 { echo "Require a detached commit" >&2; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
 { echo "Source worktree must be clean" >&2; exit 2; }
[[ "$SHA" == "${FISHER_EXPECTED_COMMIT:-}" ]] ||
 { echo "Pinned commit mismatch" >&2; exit 2; }
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
[[ "$(git rev-parse "origin/$BRANCH")" == "$SHA" ]] ||
 { echo "Remote Phase 5 branch does not match tested commit" >&2; exit 2; }
git merge-base --is-ancestor 0db35a3ea9150fec14157b2b5998270d42941b19 HEAD ||
 { echo "Merged Phase 4 baseline missing" >&2; exit 2; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$ROOT/.verification/phase5-$STAMP-$$"
mkdir -p "$LOG"
CORE=NOT_RUN; RESTORE=NOT_RUN; SMOKE=NOT_RUN
API_PID=""; WEB_PID=""
cleanup(){
 local code=$?
 trap - EXIT
 if [[ -n "$WEB_PID" ]]; then kill "$WEB_PID" 2>/dev/null || true; wait "$WEB_PID" 2>/dev/null || true; fi
 if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi
 {
   echo "Result: $([[ "$code" -eq 0 ]] && echo PASS || echo FAIL)"
   echo "Commit: $SHA"
   echo "Core checks: $CORE"
   echo "Disposable restore: $RESTORE"
   echo "Readiness smoke: $SMOKE"
   echo "Pilot authorized: NO"
   echo "Merge/push: NO"
 } >"$LOG/summary.txt"
 echo "Phase 5 acceptance evidence: $LOG/summary.txt"
 exit "$code"
}
trap cleanup EXIT
node scripts/verify-phase5-contract.mjs >"$LOG/01-contract.log" 2>&1
node --test scripts/phase5-local-probe.test.mjs >"$LOG/01b-probe-tests.log" 2>&1
node --test scripts/phase5-archive-crypto.test.mjs >"$LOG/01c-crypto-tests.log" 2>&1
node --test scripts/phase5-acceptance-evidence.test.mjs >"$LOG/01d-evidence-tests.log" 2>&1
if FISHER_VERIFY_LOG_DIR="$LOG/core" \
 FISHER_PHASE2_LOCAL_ACK=synthetic-only \
 FISHER_PHASE2_ACCEPTANCE_ACK=exact-commit \
 FISHER_EXPECTED_COMMIT="$SHA" \
 FISHER_PHASE4_OPERATION_MODE=synthetic-only \
 FISHER_PHASE5_OPERATION_MODE=synthetic-only \
 bash scripts/verify-phase2-local.sh >"$LOG/02-core.log" 2>&1; then
 CORE=PASS
else
 echo "Core verification failed: $LOG/core/summary.txt" >&2; exit 2
fi
for entry in "Result: PASS" "Final acceptance: PASS" \
 "Production dependency audit: PASS" "Full dependency audit: PASS"; do
 grep -Fxq "$entry" "$LOG/core/summary.txt" ||
  { echo "Core evidence missing: $entry" >&2; exit 2; }
done
node scripts/verify-phase5-contract.mjs >"$LOG/03-contract-after-generation.log" 2>&1
FISHER_PHASE5_RESTORE_ACK=new-disposable-only \
 bash scripts/phase5-disposable-restore-drill.sh >"$LOG/04-recovery.log" 2>&1
RESTORE=PASS
status(){ curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true; }
PORT="$((42000+RANDOM%3000))"
FISHER_API_BIND_HOST=127.0.0.1 PORT="$PORT" \
 node apps/api/dist/main.js >"$LOG/05-api.log" 2>&1 &
API_PID=$!
for _i in $(seq 1 30); do
 [[ "$(status "http://127.0.0.1:$PORT/api/v1/health")" == 200 ]] && break
 sleep 1
done
[[ "$(status "http://127.0.0.1:$PORT/api/v1/health")" == 200 ]] ||
 { echo "Phase 5 API health check failed" >&2; exit 2; }
[[ "$(status "http://127.0.0.1:$PORT/api/v1/ops/pilot-readiness/snapshot")" == 401 ]] ||
 { echo "Unauthenticated readiness endpoint exposed" >&2; exit 2; }
for path in /api/v1/ops/pilot-readiness/alerts; do
 [[ "$(status "http://127.0.0.1:$PORT$path")" == 401 ]] ||
  { echo "Unauthenticated alert list exposed" >&2; exit 2; }
done
for path in /api/v1/ops/pilot-readiness/evaluate \
 /api/v1/ops/pilot-readiness/alerts/outbox_dead_letters/acknowledge; do
 value="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' \
  -X POST -H 'content-type: application/json' -d '{}' \
  "http://127.0.0.1:$PORT$path" 2>/dev/null || true)"
 [[ "$value" == 401 ]] ||
  { echo "Unauthenticated synthetic alert mutation exposed: $path" >&2; exit 2; }
done
FISHER_PHASE5_LOAD_ACK=synthetic-loopback \
 node scripts/phase5-local-probe.mjs "http://127.0.0.1:$PORT/" \
 >"$LOG/05b-loopback-probe.json" 2>&1
kill "$API_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true; API_PID=""
WEB_PORT="$((46000+RANDOM%1500))"
pnpm --filter @fisher/operations-web exec next start -p "$WEB_PORT" -H 127.0.0.1 \
 >"$LOG/06-web.log" 2>&1 &
WEB_PID=$!
for _i in $(seq 1 35); do
 [[ "$(status "http://127.0.0.1:$WEB_PORT/")" == 200 ]] && break
 sleep 1
done
[[ "$(status "http://127.0.0.1:$WEB_PORT/")" == 200 ]] ||
 { echo "Phase 5 operations web failed startup" >&2; exit 2; }
[[ "$(status "http://127.0.0.1:$WEB_PORT/pilot-readiness")" == 200 ]] ||
 { echo "Synthetic readiness page failed" >&2; exit 2; }
for path in /api/phase5/evaluate \
  /api/phase5/alerts/outbox_dead_letters/acknowledge; do
 deny="$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' \
  -X POST -H 'content-type: application/json' -d '{}' \
  "http://127.0.0.1:$WEB_PORT$path" 2>/dev/null || true)"
 [[ "$deny" == 403 ]] ||
  { echo "Originless synthetic alert mutation accepted: $path" >&2; exit 2; }
done
kill "$WEB_PID" 2>/dev/null || true
wait "$WEB_PID" 2>/dev/null || true; WEB_PID=""
SMOKE=PASS
{
 echo "Result: PASS"
 echo "Commit: $SHA"
 echo "API denied-access checks: PASS"
 echo "Web origin checks: PASS"
} >"$LOG/06-smoke-summary.txt"
# Retain the independent restore's exact evidence path, not a guessed
# summary from a previous run.
RESTORE_SUMMARY="$(sed -n 's/^Phase 5 recovery drill evidence: //p' "$LOG/04-recovery.log" | tail -n 1)"
case "$RESTORE_SUMMARY" in
 "$ROOT"/.verification/phase5-restore-*/summary.txt) ;;
 *) echo "Recovery evidence path not produced by this worktree" >&2; exit 2 ;;
esac
[[ -f "$RESTORE_SUMMARY" ]] || { echo "Recovery summary missing" >&2; exit 2; }
RESTORE_EVIDENCE="${RESTORE_SUMMARY%/summary.txt}/evidence.txt"
[[ -f "$RESTORE_EVIDENCE" ]] || { echo "Recovery proof missing" >&2; exit 2; }
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
[[ "$(git rev-parse "origin/$BRANCH")" == "$SHA" ]] ||
 { echo "Phase 5 remote changed during acceptance" >&2; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=all)" ]] ||
 { echo "Verification produced uncommitted changes" >&2; exit 2; }
FISHER_PHASE5_LOCAL_ACK=synthetic-only \
 node scripts/phase5-acceptance-evidence.mjs \
 "$SHA" "$LOG/core/summary.txt" "$RESTORE_SUMMARY" \
 "$RESTORE_EVIDENCE" "$LOG/05b-loopback-probe.json" "$LOG/06-smoke-summary.txt" \
 "$(sha256sum pnpm-lock.yaml | cut -d ' ' -f 1)" \
 >"$LOG/07-synthetic-acceptance.json.tmp"
mv "$LOG/07-synthetic-acceptance.json.tmp" "$LOG/07-synthetic-acceptance.json"
echo "Acceptance report: $LOG/07-synthetic-acceptance.json"
echo "PHASE5_SYNTHETIC_ACCEPTED_SHA=$SHA"
echo "Pilot authorization remains BLOCKED pending independent approvals."
