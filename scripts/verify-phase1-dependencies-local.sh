#!/usr/bin/env bash
# Fisher Healthcare Phase 1 focused dependency-security verification.
# Resolves the pinned pnpm 9 graph, checks patched minimums, and records audits.
# Does NOT build, start containers, reset files, or waive vulnerabilities.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$ROOT/.verification/security-$STAMP"
mkdir -p "$LOG_DIR"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
command -v git >/dev/null || die "git is required"
command -v node >/dev/null || die "Node.js is required"
command -v corepack >/dev/null || die "Corepack is required"
[[ "$(node -p 'process.versions.node.split(".")[0]')" == "22" ]] || die "Node 22 is required"
[[ "$(git branch --show-current)" == "feat/phase1-local-verification-hardening" ]] || die "Wrong branch"
COMMIT="$(git rev-parse HEAD)"
[[ -z "${FISHER_EXPECTED_COMMIT:-}" || "$COMMIT" == "$FISHER_EXPECTED_COMMIT" ]] || die "Wrong commit"
printf '%s\n' "$COMMIT" > "$LOG_DIR/commit.txt"

corepack enable
[[ "$(pnpm --version)" == "9.15.9" ]] || die "Expected pnpm 9.15.9"

if git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1; then
  echo "Using committed lockfile; will not regenerate tracked lockfile."
else
  if [[ -f pnpm-lock.yaml ]]; then
    cp -p -- pnpm-lock.yaml "$LOG_DIR/pnpm-lock.before.yaml"
    echo "Saved previous untracked lockfile to $LOG_DIR"
  fi
  pnpm install --lockfile-only --ignore-scripts 2>&1 | tee "$LOG_DIR/01-lockfile.log"
fi

node scripts/check-dependency-resolution.mjs 2>&1 | tee "$LOG_DIR/02-resolution.log"
P_STATUS=PASS
F_STATUS=PASS

if pnpm audit --prod --audit-level high > "$LOG_DIR/03-production-audit.log" 2>&1; then
  echo "Production audit: PASS"
else
  P_STATUS=FAIL
  echo "Production audit: FAIL"
fi

if pnpm audit --audit-level high > "$LOG_DIR/04-full-audit.log" 2>&1; then
  echo "Full dependency audit: PASS"
else
  F_STATUS=FAIL
  echo "Full dependency audit: FAIL"
fi

{
  printf 'Commit: %s\n' "$COMMIT"
  printf 'Lockfile SHA256: %s\n' "$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)"
  printf 'Production audit: %s\n' "$P_STATUS"
  printf 'Full audit: %s\n' "$F_STATUS"
  printf 'Generated lockfile tracked: %s\n' "$(git ls-files --error-unmatch pnpm-lock.yaml >/dev/null 2>&1 && echo yes || echo no)"
  printf '\nAudit summaries:\n'
  grep -hE 'vulnerabilities found|Severity:' "$LOG_DIR/03-production-audit.log" "$LOG_DIR/04-full-audit.log" || true
  printf '\nWorking-tree changes:\n'
  git status --short
} | tee "$LOG_DIR/summary.txt"

echo "Evidence: $LOG_DIR"
if [[ "$P_STATUS" != PASS || "$F_STATUS" != PASS ]]; then
  die "Security audit gate remains open. Review exact remaining packages; no advisory was waived."
fi
