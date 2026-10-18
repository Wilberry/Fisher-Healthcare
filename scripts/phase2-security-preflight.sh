#!/usr/bin/env bash
# Phase 2 dependency audit preflight: synthetic worktree only, no Docker or deployment.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "${FISHER_PHASE2_LOCAL_ACK:-}" == "synthetic-only" ]] || { echo "ERROR: Synthetic-only acknowledgment required" >&2; exit 2; }
[[ -f pnpm-workspace.yaml && -f package.json ]] || { echo "ERROR: Not the Fisher monorepo" >&2; exit 2; }
command -v pnpm >/dev/null || { echo "ERROR: pnpm is unavailable" >&2; exit 2; }
[[ "$(pnpm --version)" == "9.15.9" ]] || { echo "ERROR: Expected pnpm 9.15.9" >&2; exit 2; }
[[ -z "${FISHER_EXPECTED_COMMIT:-}" || "$(git rev-parse HEAD)" == "$FISHER_EXPECTED_COMMIT" ]] || { echo "ERROR: Pinned commit mismatch" >&2; exit 2; }

node - <<'NODE'
const fs = require('node:fs');
const root = require('./package.json');
const required = { multer:'2.4.0', lodash:'4.18.1', 'js-yaml':'4.3.2', postcss:'8.5.18' };
for(const [name,version] of Object.entries(required)){
 if(root.pnpm?.overrides?.[name] !== version){
  console.error('ERROR: Missing pnpm 9 root security override for '+name+'@'+version);
  process.exitCode=2;
 }
}
if(/^overrides:/m.test(fs.readFileSync('pnpm-workspace.yaml','utf8'))){
 console.error('ERROR: Duplicate workspace override configuration requires review');
 process.exitCode=2;
}
NODE

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="${FISHER_SECURITY_LOG_DIR:-$ROOT/.verification/phase2-security-$STAMP}"
mkdir -p "$LOG_DIR"
echo "Evidence directory: $LOG_DIR"
printf "Commit: %s\n" "$(git rev-parse HEAD)" > "$LOG_DIR/commit.txt"

# Preserve a prior generated lockfile before refreshing dependency resolution.
if git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1; then
 pnpm install --lockfile-only --frozen-lockfile --ignore-scripts 2>&1 | tee "$LOG_DIR/01-lockfile.log"
else
 if [[ -f pnpm-lock.yaml ]]; then cp -p -- pnpm-lock.yaml "$LOG_DIR/pnpm-lock.previous.yaml"; fi
 pnpm install --lockfile-only --ignore-scripts 2>&1 | tee "$LOG_DIR/01-lockfile.log"
fi

PRODUCTION=PASS
COMPLETE=PASS
if pnpm audit --prod --audit-level high > "$LOG_DIR/02-production-audit.log" 2>&1; then
 echo "PASS: production dependency audit (high threshold)"
else
 PRODUCTION=FAIL
 echo "FAIL: production dependency audit — inspect 02-production-audit.log"
fi
if pnpm audit --audit-level high > "$LOG_DIR/03-full-audit.log" 2>&1; then
 echo "PASS: full dependency audit (high threshold)"
else
 COMPLETE=FAIL
 echo "FAIL: full dependency audit — inspect 03-full-audit.log"
fi
{
 printf "Commit: %s\n" "$(git rev-parse HEAD)"
 printf "Production audit: %s\n" "$PRODUCTION"
 printf "Full audit: %s\n" "$COMPLETE"
 printf "Lockfile tracked: %s\n" "$(git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1 && echo yes || echo no)"
 printf "Pending working-tree changes:\n"
 git status --short
} | tee "$LOG_DIR/summary.txt"
echo "Audit details: $LOG_DIR"
[[ "$PRODUCTION" == PASS && "$COMPLETE" == PASS ]] || exit 1
echo "Audits passed; full verification and committed-lockfile acceptance are still required."
