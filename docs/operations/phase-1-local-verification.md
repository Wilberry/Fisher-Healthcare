# Phase 1 — Local Engineering Verification

**Fisher Healthcare | Engineering assurance procedure**  
**Execution model:** Developer workstation, no GitHub Actions  
**Applies to:** `feat/phase1-local-verification-hardening` and its exact tested commit

## Verification approach

Phase 1 will be accepted against evidence from one consolidated local verification run. GitHub remains the authoritative code repository, but automated GitHub Actions execution is suspended while billing prevents use. No workflow status will be treated as a substitute for local verification.

The local verifier uses **Node.js 22, Corepack/pnpm 9.15.9, Git, Docker, the PostgreSQL `psql` client and curl**. It builds applications sequentially to limit memory consumption. Only **one** disposable PostgreSQL 16 container is created, with a temporary loopback port; it does not stop or reconfigure Supabase or other projects' containers.

## Local execution

Use a clean checkout or worktree. After an earlier failed verification, the existing untracked `pnpm-lock.yaml` or generated `docs/api/openapi.json` may be retained for review; these are explicitly permitted by the verification preflight. Turborepo's generated `.turbo/` cache is ignored by Git and does not need to be removed. From the Fisher Healthcare repository:

```bash
git fetch origin
git switch --track origin/feat/phase1-local-verification-hardening
git status --short
FISHER_PHASE1_LOCAL_ACK=synthetic-only bash scripts/verify-phase1-local.sh
```

If the tracking branch already exists locally, use `git switch feat/phase1-local-verification-hardening` and `git pull --ff-only` rather than creating it a second time. The script refuses tracked modifications or unrelated untracked files; it will not stash, reset, delete, or rewrite them. Generated lockfiles do not count toward final acceptance until reviewed and committed.

Optionally set `FISHER_EXPECTED_COMMIT` to the exact 40-character SHA from the approved verification handoff. The script rejects a different checkout.

On Linux, the PostgreSQL client may be installed via the distribution's `postgresql-client` package if `psql` is missing. The Docker daemon must already be accessible to the current user. Network access is needed to install dependencies, obtain the PostgreSQL image if uncached, and query dependency vulnerability advisories.

## Acceptance sequence

The single script:

1. Records the exact commit and confirms that the worktree was clean.
2. Uses Corepack/pnpm 9.15.9. If no lockfile exists, generates one explicitly, then runs a frozen install.
3. Executes workspace lint, TypeScript checks, and sequential production builds.
4. Starts an isolated, resource-limited `postgres:16-alpine` container using a randomly allocated local PostgreSQL port.
5. Applies and checks the complete checksummed migration history, including constraints and transactional rollback verification.
6. Runs package and application tests, including synthetic authenticated resource tests and durable outbox fencing/retry tests.
7. Generates the OpenAPI specification and checks dependency vulnerabilities.
8. Smoke-tests the compiled API and each Next.js application individually on loopback.
9. Records the results in `.verification/phase1-YYYYMMDD-HHMMSS/summary.txt` and individual step logs.

The script cleans up **only its uniquely named disposable container** when finished. It does not run `docker system prune`, stop external containers, or remove shared volumes. To retain the disposable database **only for investigation**, set `FISHER_KEEP_VERIFY_DB=1`; it must then be removed explicitly after investigation.

## Repository and acceptance requirements

The first clean run may generate `pnpm-lock.yaml` and `docs/api/openapi.json`. These outputs require review and a subsequent commit. **A successful first run without a committed lockfile is not a reproducible phase acceptance.**

The intended final sequence is:

1. Review results and resolve any failing steps on the verification branch.
2. Commit the reviewed lockfile and generated API contract.
3. Run the same verifier a second time on the new exact commit with a clean working tree and a frozen lockfile.
4. Record local verification evidence, including failures and fixes, in the Phase 1 acceptance record.
5. Merge the verified branch only after explicit acceptance. No real patient, clinical, or payment data may be introduced as part of these tests.

## Known outstanding integrations

Synthetic JWT integration tests are not evidence that a production identity provider, staff MFA, patient sessions, clinical document storage, or external payment and laboratory systems are operational. Such connections require their own provider contracts, threat review, and staging acceptance. Phase 1 covers only the approved foundation and keeps clinical and payment workflows disabled.

## Failure handling

If verification fails, preserve the log directory and the exact commit. The script exits nonzero and does not commit, push, reset, or merge anything. Remaining repairs will be applied to the working branch and verified in the next consolidated local run.
