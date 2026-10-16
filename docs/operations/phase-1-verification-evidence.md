# Fisher Healthcare — Phase 1 Local Verification Evidence

**Verification model:** Local workstation; GitHub Actions unavailable due to billing.  
**Acceptance:** OPEN — only gates actually executed may be marked passed.

## Round 1 — 16 October 2026

**Pinned commit:** `f3eaf80e0450ecab83e30cf503aa3ad58810882a`  
**Branch:** `feat/phase1-local-verification-hardening`  
**Tooling confirmed:** Node 22 environment, Corepack, pnpm 9.15.9.

| Verification step | Observed result | Evidence |
| --- | --- | --- |
| Commit/branch pin | Passed | Exact SHA printed in local transcript |
| Lockfile generation | Passed locally | `pnpm install --lockfile-only --ignore-scripts`; pnpm finished |
| Frozen installation | Passed | `pnpm install --frozen-lockfile`, 510 packages installed |
| Workspace lint | Failed | Operations web: one JSX apostrophe escape, one CommonJS ESLint-config import rule |
| TypeScript | Not executed | Lint terminated consolidated script |
| Build | Not executed | Lint terminated consolidated script |
| PostgreSQL migrations | Not executed | Lint terminated consolidated script |
| Integration and UI tests | Not executed | Lint terminated consolidated script |
| OpenAPI, vulnerability audit, smoke tests | Not executed | Lint terminated consolidated script |

**User-provided transcript outcome:** The runner exited after the two operations-web lint errors at approximately 45 seconds of linting. Logs and the summary were saved under the ignored local `.verification/` directory. No claims of successful unexecuted stages are made.

### Source repairs following Round 1

- Escaped JSX apostrophes in patient and operations applications.
- Retained legitimate CommonJS ESLint configuration while narrowly disabling the incompatible `no-require-imports` lint rule in all three web application config files.
- Updated the local verifier to permit **only** the previously generated, untracked `pnpm-lock.yaml` and `docs/api/openapi.json` files on a subsequent execution; arbitrary changes still block exact-commit verification.
- Added explicit reporting of whether the lockfile was committed at the tested revision.

### Next evidence required

Run one consolidated local verification at the new pinned repair commit, with the generated lockfile preserved. If any later stage fails, retain the failure logs and apply source corrections on this branch. Phase 1 acceptance requires a reviewed committed lockfile and a clean full-suite rerun.

The Round 1 log did **not** demonstrate a successful database migration, authenticated API integration, UI build, outbox recovery or runtime smoke test.
