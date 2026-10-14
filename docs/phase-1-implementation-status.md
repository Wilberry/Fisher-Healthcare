# Phase 1 implementation status

**Status: IN PROGRESS — acceptance gate OPEN.**

## Committed foundations
- pnpm/Turborepo workspace and strict TypeScript baseline.
- Minimal Next.js patient, operations and field app entrypoints (not functional applications).
- NestJS API bootstrap and basic health endpoint.
- Worker bootstrap with no active processing.
- Shared design tokens.
- Initial PostgreSQL domain schema in Drizzle and matching initial SQL DDL (not migration-tested).
- Initial patient relationship authorization policy separating booking from result visibility, with unit tests.
- Zod boundary contracts for quote requests, currency and booking status, with unit tests.
- Disposable PostgreSQL Docker Compose file.
- GitHub Actions CI workflow and architecture decision records.
- Verification plan: [Phase 1 verification](phase-1-verification-plan.md).

## Incomplete / not verified
- No pnpm lockfile or verified reproducible dependency installation.
- CI, TypeScript builds, SQL migration and rollback have not been executed successfully against an isolated checkout.
- Identity provider integration, OIDC token verification, session management, privileged MFA, and server-enforced API guards are missing.
- Domain schema needs further review for integrity constraints, data retention, migrations and patient authorization enforcement.
- Shared accessible component library, complete UX flows and field offline synchronization are missing.
- No full OpenAPI generator, durable queue/outbox implementation, API domain services or integration/E2E tests.
- Deployment configuration, secrets, monitoring and production readiness checks are incomplete.

**Safety gate:** No real patient, clinical, payment or operational data. Do not deploy as a healthcare service.

## Next acceptance work
1. Reproducible install and lockfile; fix any build/typecheck/CI failures.
2. Verify disposable PostgreSQL migrations and constraints; establish forward-only migration tooling.
3. Implement authenticated OIDC integration and server-side authorization with negative integration tests.
4. Complete shared design system, contracts, and documented UX flows.
5. Implement/test durable jobs, integration boundaries, observability and deployable staging.
6. Run and record end-to-end verification against exact commit, then request Phase 1 acceptance.
