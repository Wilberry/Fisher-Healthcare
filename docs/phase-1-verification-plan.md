# Phase 1 verification and acceptance

## Current status

Phase 1 remains **OPEN**. Source and migration files are committed, but dependency installation, migration execution, authenticated integration tests, and production build are not verified. No clinical data should be used.

## Verification procedure

1. On an isolated workstation, install Node 22, Corepack/pnpm 9.15.9 and Docker.
2. Clone repository at an exact commit. Run `corepack enable && pnpm install`.
3. Run `pnpm typecheck`, `pnpm test` and `pnpm build`; record exact output and commit.
4. Start disposable PostgreSQL with `docker compose -f infra/docker-compose.yml up -d`.
5. Apply migration `packages/database/drizzle/0000_foundation.sql` to an empty disposable database using `psql -v ON_ERROR_STOP=1`. Verify table names, constraints, indexes and rollback strategy.
6. Exercise access policy tests and prove unauthorized cross-patient result reads fail at the API and storage boundaries.
7. Implement and test OIDC validation, staff MFA and server-side guards before enabling protected routes.
8. Verify web accessibility, field offline sync, durable worker retries and OpenAPI contract generation.
9. Confirm CI green on exact commit, review security scan, and sign off Phase 1 checklist.

## Release blockers

No authenticated integration, full schema coverage, protected patient data access, durable worker implementation, complete shared UI library, or end-to-end deployment has been verified. A passing unit test alone does not close the phase.
