# Phase 1 — Local Engineering Verification

**Fisher Healthcare | Engineering assurance procedure**  
**Execution model:** Developer workstation, no GitHub Actions  
**Applies to:** `feat/phase1-local-verification-hardening` and its exact tested commit

## Verification approach

Phase 1 will be accepted against evidence from one consolidated local verification run. GitHub remains the authoritative code repository, but automated GitHub Actions execution is suspended while billing prevents use. No workflow status will be treated as a substitute for local verification.

The local verifier uses **Node.js 22, Corepack/pnpm 9.15.9, Git, Docker, the PostgreSQL `psql` client and curl**. It builds applications sequentially to limit memory consumption. Only **one** disposable PostgreSQL 16 container is created, with a temporary loopback port; it does not stop or reconfigure Supabase or other projects' containers.

## Local execution

Use a clean checkout or worktree. After an earlier failed verification, the existing untracked `pnpm-lock.yaml` or generated `docs/api/openapi.json` may be retained for review; these are explicitly permitted by the verification preflight. Turborepo's generated `.turbo/` cache is ignored by Git and does not need to be removed. The six known Next.js-generated `next-env.d.ts` and `tsconfig.json` files may also be recognized when modified by the framework; their contents are checked against the committed version by `scripts/validate-next-generated.mjs`. Unknown tracked changes still block verification. From the Fisher Healthcare repository:

```bash
git fetch origin
git switch --track origin/feat/phase1-local-verification-hardening
git status --short
FISHER_PHASE1_LOCAL_ACK=synthetic-only bash scripts/verify-phase1-local.sh
```

If the tracking branch already exists locally, use `git switch feat/phase1-local-verification-hardening` and `git pull --ff-only` rather than creating it a second time. The script refuses non-framework tracked modifications or unrelated untracked files; it will not stash, reset, delete, or rewrite them. Allowed generated changes are explicitly validated and displayed as diagnostic-only drift. The final acceptance run requires the reviewed lockfile and framework-generated configuration to be committed, without remaining tracked differences.

Optionally set `FISHER_EXPECTED_COMMIT` to the exact 40-character SHA from the approved verification handoff. The script rejects a different checkout.

On Linux, the PostgreSQL client may be installed via the distribution's `postgresql-client` package if `psql` is missing. The Docker daemon must already be accessible to the current user. Network access is needed to install dependencies, obtain the PostgreSQL image if uncached, and query dependency vulnerability advisories.

## Acceptance sequence

The single script:

1. Records the exact commit and validates expected generated worktree files against the committed source.
2. Uses Corepack/pnpm 9.15.9. For an untracked lockfile, preserves the previous resolution then refreshes it; for a committed lockfile, runs frozen installation without rewriting it.
3. Executes workspace lint, TypeScript checks, and sequential production builds.
4. Generates OpenAPI and records **separate** production and full dependency audits (both required for acceptance).
5. Smoke-tests the compiled API and three web apps individually on loopback, even when the security audits report unresolved advisories.
6. Starts one isolated PostgreSQL 16 container on a temporary loopback port and preserves container logs, exit/OOM state, Docker startup errors and resource information on failure.
7. Applies checksummed migrations and rollback tests against the disposable database, then runs the full package/integration test suite.
8. Records outcomes in `.verification/phase1-YYYYMMDD-HHMMSS/summary.txt` and individual logs; exits unsuccessfully when either audit is not clear.

The script cleans up **only its uniquely named disposable container** when finished. It does not run `docker system prune`, stop external containers, or remove shared volumes. To retain the disposable database **only for investigation**, set `FISHER_KEEP_VERIFY_DB=1`; it must then be removed explicitly after investigation.

## Fast PostgreSQL startup diagnostic

On low-memory machines, confirm isolated Docker readiness **before** another complete build. Run from the repo root:

```bash
FISHER_PHASE1_LOCAL_ACK=synthetic-only bash scripts/diagnose-postgres-local.sh
```

The diagnostic starts only one uniquely named synthetic `postgres:16-alpine` container, performs a readiness check and a read-only `SELECT current_database()` over the temporary local port, saves its exit/OOM state and Docker logs, then removes only that container. It does not execute pnpm, wipe images/volumes, stop existing containers, or contact production databases.

Evidence is saved under `.verification/postgres-preflight-*/`, particularly `postgres.log`, `state.txt`, `docker-run-error.txt`, and `host-resources.txt`. These are ignored by Git. Inspect these logs to identify the actual failure rather than assuming it is out-of-memory. A passing diagnostic is useful environment evidence but not a substitute for migrations and integration tests.

The full verifier also captures `postgres.log`, `postgres-state.txt`, and `local-resources.txt` on failure, before cleaning up its own uniquely named container.

## Focused dependency audit before the full run

Once an earlier full verification has passed functionality but failed dependency
security, avoid repeating long builds just to confirm the resolution graph.
From the repository branch with the exact expected SHA:

```bash
FISHER_EXPECTED_COMMIT="<approved 40-character SHA>" \
  bash scripts/verify-phase1-dependencies-local.sh
```

The focused runner requires Node 22 and pnpm 9.15.9. It saves a copy of the
untracked lockfile before regenerating it, confirms patched transitive versions
using `scripts/check-dependency-resolution.mjs`, and executes **both** the
production-only and full dependency audits. It does not build applications,
start or delete Docker containers, or modify tracked/generated Next.js files.
Its logs and summary are saved in the ignored `.verification/security-*/` folder.
A nonzero audit result is reported as a real failure, never an automatic waiver.

Until the upstream `braces` advisory is resolved or explicitly dispositioned,
the full audit may remain red even if the production audit clears. Do not mark
Phase 1 as accepted solely because the production dependency graph passes.
Only resume the expensive full acceptance script once the remaining security
findings are understood and a valid resolution is approved.

## Repository and acceptance requirements

The first clean run may generate `pnpm-lock.yaml` and `docs/api/openapi.json`. These outputs require review and a subsequent commit. **A successful first run without a committed lockfile is not a reproducible phase acceptance.**

The intended final sequence is:

1. Review results and resolve any failing steps on the verification branch.
2. Commit the reviewed lockfile and generated API contract.
3. Run the same verifier a second time on the new exact commit with a clean working tree and a frozen lockfile.
4. Record local verification evidence, including failures and fixes, in the Phase 1 acceptance record.
5. Merge the verified branch only after explicit acceptance. No real patient, clinical, or payment data may be introduced as part of these tests.

## Owner-directed Phase 1 engineering acceptance — 16 October 2026

The source foundation is now **accepted as PASS WITH DOCUMENTED SECURITY EXCEPTION** under the [Phase 1 engineering acceptance record](phase-1-engineering-acceptance.md). The acceptance is tied exclusively to the *actual* local run on clean pinned commit `a504bee8d858712a8ada350a9792a87d23ecbb9a`.

This changes the **engineering milestone decision**, not the verifier's observed outcomes. The full dependency audit and the consolidated script both still returned **FAIL** due to an unresolved high-severity development-only `braces` advisory. The production high/critical audit and all functional checks passed. The existing scripts continue to report failing audit results truthfully. Development may proceed to Phase 2, while [security Issue #2](https://github.com/Wilberry/Fisher-Healthcare/issues/2) stays open.

There is **no production deployment, live-data, security-compliance or clinical-operation approval** in this milestone decision. A new revision must undergo its own relevant checks, and all applicable release gates remain in effect.

## Known outstanding integrations

Synthetic JWT integration tests are not evidence that a production identity provider, staff MFA, patient sessions, clinical document storage, or external payment and laboratory systems are operational. Such connections require their own provider contracts, threat review, and staging acceptance. Phase 1 covers only the approved foundation and keeps clinical and payment workflows disabled.

## Failure handling

If verification fails, preserve the log directory and the exact commit. The script exits nonzero and does not commit, push, reset, or merge anything. Remaining repairs will be applied to the working branch and verified in the next consolidated local run.
