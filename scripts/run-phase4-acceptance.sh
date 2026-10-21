#!/usr/bin/env bash
# One opt-in local acceptance invocation; this script never pushes or merges.
set -Eeuo pipefail
umask 077
[[ "${FISHER_PHASE4_LOCAL_ACK:-}" == "synthetic-only" ]] ||
  { echo "Set FISHER_PHASE4_LOCAL_ACK=synthetic-only" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="feat/phase4-lab-results-finance"
git -C "$ROOT" fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
SHA="$(git -C "$ROOT" rev-parse "refs/remotes/origin/$BRANCH")"
ROOT_PARENT="$(dirname "$ROOT")"
VERIFY="$ROOT_PARENT/Fisher-Healthcare-phase4-verification-${SHA:0:12}"
[[ ! -e "$VERIFY" ]] || { echo "Verification worktree already exists: $VERIFY" >&2; exit 2; }
git -C "$ROOT" worktree add --detach "$VERIFY" "$SHA"
cd "$VERIFY"
FISHER_PHASE4_LOCAL_ACK=synthetic-only FISHER_EXPECTED_COMMIT="$SHA" \
  bash scripts/verify-phase4-local.sh
