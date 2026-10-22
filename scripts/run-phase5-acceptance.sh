#!/usr/bin/env bash
# One consolidated Phase 5 acceptance run, no push or merge.
set -Eeuo pipefail
umask 077
[[ "${FISHER_PHASE5_LOCAL_ACK:-}" == synthetic-only ]] ||
 { echo "Set FISHER_PHASE5_LOCAL_ACK=synthetic-only" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH=feat/phase5-production-readiness
git -C "$ROOT" fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
SHA="$(git -C "$ROOT" rev-parse "origin/$BRANCH")"
VERIFY="$(dirname "$ROOT")/Fisher-Healthcare-phase5-verification-${SHA:0:12}"
[[ ! -e "$VERIFY" ]] || { echo "Verification worktree already exists: $VERIFY" >&2; exit 2; }
git -C "$ROOT" worktree add --detach "$VERIFY" "$SHA"
cd "$VERIFY"
FISHER_EXPECTED_COMMIT="$SHA" FISHER_PHASE5_LOCAL_ACK=synthetic-only \
 bash scripts/verify-phase5-local.sh
