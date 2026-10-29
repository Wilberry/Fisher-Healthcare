#!/usr/bin/env bash
# Offline exact-commit Render build acceptance. Does not start containers or contact Render.
set -Eeuo pipefail
EXPECTED="${FISHER_RENDER_ACCEPTED_SHA:-}"
[[ "$EXPECTED" =~ ^[a-f0-9]{40}$ ]] || { echo "Set full FISHER_RENDER_ACCEPTED_SHA" >&2; exit 2; }
[[ "${FISHER_RENDER_LOCAL_ACK:-}" == "synthetic-build-only" ]] || { echo "Synthetic-build-only acknowledgment required" >&2; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]] || { echo "Unexpected commit" >&2; exit 2; }
[[ -z "$(git symbolic-ref -q --short HEAD || true)" ]] || { echo "Require detached verification worktree" >&2; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || { echo "Require clean source" >&2; exit 2; }
command -v node >/dev/null
command -v docker >/dev/null
EVIDENCE="$(mktemp -d "${TMPDIR:-/tmp}/fisher-render-acceptance.XXXXXXXX")"
chmod 700 "$EVIDENCE"
echo "Evidence directory: $EVIDENCE"
trap 'code=$?; if [[ "$code" -eq 0 ]]; then echo "PASS $EXPECTED" >"$EVIDENCE/summary.txt"; else echo "FAIL $EXPECTED" >"$EVIDENCE/summary.txt"; fi; echo "Evidence: $EVIDENCE/summary.txt"' EXIT
node --test scripts/phase6-render-blueprint.test.mjs scripts/phase6-render-start.test.mjs scripts/phase6-render-build-contract.test.mjs >"$EVIDENCE/tests.log" 2>&1
node scripts/phase6-render-build-contract.mjs >"$EVIDENCE/build-contract.json"
# Local image only. Docker may pull public base images; no application service started.
docker build -f infra/docker/Dockerfile -t "fisher-render-synthetic-verify:${EXPECTED:0:12}" . >"$EVIDENCE/docker-build.log" 2>&1
docker image inspect "fisher-render-synthetic-verify:${EXPECTED:0:12}" --format '{{.Id}}' >"$EVIDENCE/image-id.txt"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || { echo "Build changed repository source" >&2; exit 2; }
echo "RENDER_BUILD_ACCEPTED_SHA=$EXPECTED"
echo "Database migrations were inspected statically, NOT executed."
