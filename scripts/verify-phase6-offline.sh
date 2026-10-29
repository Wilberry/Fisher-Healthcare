#!/usr/bin/env bash
# Exact-commit, offline-only Phase 6 verification. No deployment or provider access.
set -Eeuo pipefail
umask 077
[[ "${FISHER_PHASE6_LOCAL_ACK:-}" == offline-synthetic-only ]] || {
 echo "Set FISHER_PHASE6_LOCAL_ACK=offline-synthetic-only" >&2; exit 2;
}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
EXPECTED="${FISHER_PHASE6_EXPECTED_SHA:-}"
[[ "$EXPECTED" =~ ^[a-f0-9]{40}$ ]] || { echo "Pin full commit SHA" >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]] || { echo "Commit mismatch" >&2; exit 2; }
[[ -z "$(git symbolic-ref -q --short HEAD || true)" ]] || {
 echo "Require detached acceptance checkout" >&2; exit 2;
}
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || {
 echo "Source must be clean" >&2; exit 2;
}
[[ "$(git rev-parse origin/feat/phase6-launch-readiness)" == "$EXPECTED" ]] || {
 echo "Remote-tracking Phase 6 branch does not match" >&2; exit 2;
}
command -v node >/dev/null
command -v git >/dev/null
command -v sha256sum >/dev/null
LOG="$ROOT/.verification/phase6-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$LOG"
STATUS=FAIL
cleanup(){
 local code=$?
 trap - EXIT
 [[ "$code" -eq 0 ]] && STATUS=PASS
 printf 'Result: %s\nCommit: %s\nDeployment authorized: NO\n' "$STATUS" "$EXPECTED" >"$LOG/summary.txt"
 echo "Phase 6 offline evidence: $LOG/summary.txt"
 exit "$code"
}
trap cleanup EXIT
node --test scripts/phase6-readiness-inventory.test.mjs \
 scripts/phase6-staging-preflight.test.mjs \
 scripts/phase6-rollback-preflight.test.mjs \
 scripts/phase6-operations-preflight.test.mjs >"$LOG/01-tests.log" 2>&1
node scripts/phase6-staging-preflight.mjs docs/operations/phase-6-staging-example.json >"$LOG/02-staging.json"
node scripts/phase6-rollback-preflight.mjs docs/operations/phase-6-rollback-example.json >"$LOG/03-rollback.json"
node scripts/phase6-operations-preflight.mjs docs/operations/phase-6-operations-example.json >"$LOG/04-operations.json"
# Readiness inventory must report blockers and terminate unsuccessfully.
if node scripts/phase6-readiness-inventory.mjs \
 docs/operations/phase-6-readiness-inventory.json >"$LOG/05-readiness.json" 2>"$LOG/05-readiness.stderr"; then
 echo "Readiness inventory unexpectedly clear" >&2; exit 2
fi
node scripts/phase6-offline-evidence.mjs "$EXPECTED" "$LOG" \
 >"$LOG/06-acceptance.json.tmp"
mv "$LOG/06-acceptance.json.tmp" "$LOG/06-acceptance.json"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || {
 echo "Verification modified tracked source" >&2; exit 2;
}
echo "PHASE6_OFFLINE_ACCEPTED_SHA=$EXPECTED"
echo "This result never permits production deployment or pilot activation."
