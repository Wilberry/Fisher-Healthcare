#!/usr/bin/env bash
# Verify the exact remote Phase 5 commit in a new detached worktree.
# This entrypoint never pushes, merges, deploys or activates pilot services.
set -Eeuo pipefail
umask 077
[[ "${FISHER_PHASE5_LOCAL_ACK:-}" == synthetic-only ]] || {
  echo "Set FISHER_PHASE5_LOCAL_ACK=synthetic-only" >&2
  exit 2
}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH=feat/phase5-production-readiness
# Reject unexpected working tree changes before deriving the pinned reference.
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=all)" ]] || {
  echo "Source checkout must be clean" >&2; exit 2;
}
git -C "$ROOT" fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
SHA="$(git -C "$ROOT" rev-parse "origin/$BRANCH")"
# An optional caller pin protects against accidentally verifying a newer commit.
if [[ -n "${FISHER_PHASE5_EXPECTED_SHA:-}" &&
      "$SHA" != "$FISHER_PHASE5_EXPECTED_SHA" ]]; then
  echo "Remote Phase 5 head is not the expected commit" >&2; exit 2;
fi
VERIFY="$(dirname "$ROOT")/Fisher-Healthcare-phase5-verification-${SHA:0:12}"
[[ ! -e "$VERIFY" ]] || {
  echo "Verification worktree already exists: $VERIFY" >&2; exit 2;
}
git -C "$ROOT" worktree add --detach "$VERIFY" "$SHA"
cd "$VERIFY"
FISHER_EXPECTED_COMMIT="$SHA" FISHER_PHASE5_LOCAL_ACK=synthetic-only \
 bash scripts/verify-phase5-local.sh
