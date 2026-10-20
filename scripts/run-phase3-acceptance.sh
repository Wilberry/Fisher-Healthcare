#!/usr/bin/env bash
# Opt-in exact-commit Fisher Phase 3 acceptance orchestrator.
# Never run before source engineering is ready for a full local acceptance pass.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BRANCH="feat/phase3-dispatch-collection-custody"

die(){ printf 'ERROR: %s\n' "$*" >&2; exit 2; }

[[ "${FISHER_PHASE3_LOCAL_ACK:-}" == synthetic-only ]] ||
  die "Set FISHER_PHASE3_LOCAL_ACK=synthetic-only after approving disposable acceptance"
for tool in git node pnpm docker psql; do
  command -v "$tool" >/dev/null || die "Missing prerequisite: $tool"
done
[[ -f package.json && -d apps/field-pwa ]] || die "Not the Fisher source repository"
[[ "$(git rev-parse --show-toplevel)" == "$ROOT" ]] ||
  die "Run this script from its checkout; unrelated repositories are not touched"

# Fetch without checking out, resetting, stashing or modifying the source branch.
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
SHA="$(git rev-parse "refs/remotes/origin/$BRANCH")"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || die "Could not pin Phase 3 remote HEAD"

# A unique sibling detached worktree preserves both code and acceptance evidence.
VERIFY="$(dirname "$ROOT")/Fisher-Healthcare-phase3-verification-${SHA:0:12}"
[[ ! -e "$VERIFY" ]] || die "Verification directory already exists: $VERIFY"
git worktree add --detach "$VERIFY" "$SHA"
[[ "$(git -C "$VERIFY" rev-parse HEAD)" == "$SHA" ]] ||
  die "Isolated worktree did not match pinned SHA"
[[ -z "$(git -C "$VERIFY" status --porcelain --untracked-files=all)" ]] ||
  die "Verification worktree is not clean"

printf 'Fisher Phase 3 pinned SHA: %s\n' "$SHA"
printf 'Isolated verification worktree: %s\n' "$VERIFY"
printf 'Only synthetic data and disposable PostgreSQL are permitted.\n'
printf 'The feature branch and main will not be changed or pushed by this script.\n'

cd "$VERIFY"
export FISHER_EXPECTED_COMMIT="$SHA"
export FISHER_PHASE3_LOCAL_ACK=synthetic-only
export FISHER_PHASE3_PUSH_ON_PASS=0
exec bash scripts/verify-phase3-local.sh
