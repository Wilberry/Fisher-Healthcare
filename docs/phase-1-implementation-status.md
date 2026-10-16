# Fisher Healthcare — Phase 1 Implementation Status

**Programme phase:** Product foundation, user experience and technical architecture  
**Current status:** **Implementation continuing; acceptance gate OPEN**  
**Verification authority:** Local exact-commit engineering tests (GitHub Actions unavailable due to billing)

**First local checkpoint (16 October 2026):** pnpm 9.15.9 lockfile generation and frozen installation succeeded at `f3eaf80e`. Lint stopped on two Next.js web-app issues. Both were repaired in the working branch. TypeScript, migration, integration, build and smoke-test acceptance have not yet run. See [Local Verification Evidence](operations/phase-1-verification-evidence.md).

**Third local checkpoint (16 October 2026):** At `4f2dcf6`, install, lint, TypeScript, production builds and database migration checks passed. The full suite then stopped at an operations-web JSX unit test (`React is not defined`). Automatic JSX test transforms and validated Next.js generated-file handling have been committed for the next diagnostic run. Remaining steps are not yet verified.

**Fourth local checkpoint (16 October 2026):** At `5f0a84d`, the local installation, lint, typecheck, build, migration and complete workspace test commands passed. OpenAPI generation failed before the dependency audit and HTTP smoke tests. The compiled-NestJS OpenAPI runner, documented route security, and safe diagnostic reporting have been committed for the next exact-commit verification. Phase 1 is still OPEN.

**Fifth local checkpoint (16 October 2026):** At `0f8f23e`, install, lint, typecheck, production builds, migrations, automated tests, and OpenAPI generation all passed. The full dependency audit reported 40 advisories (3 critical, 15 high), stopping verification before runtime smoke tests. Source-level dependency upgrades and a non-bypassing production/full audit workflow are committed; remediation verification is pending. See [Dependency Security Remediation](security/phase-1-dependency-remediation.md).

## Foundation delivered in source

| Workstream | Implemented foundation | Acceptance status |
| --- | --- | --- |
| Product and architecture | Product specifications, phased roadmap, architectural decision records, domain workflows, service experience blueprints | Documented; business and clinical reviews remain |
| Applications | Next.js patient, operations and field interfaces, shared branding and accessible component primitives | Source committed; production build and accessibility review pending |
| Backend | NestJS API, health and identity endpoints, standard error handling, OpenAPI generator | Source committed; API build, generated specification review and smoke tests pending |
| Identity and authorization | OIDC signature verification, issuer/audience validation, staff MFA policy, database-backed patient and staff permissions | Synthetic test code committed; execution and provider onboarding pending |
| Data services | PostgreSQL/Drizzle schema, append-only audit/custody constraints, checksummed migrations, synthetic-only fixtures | SQL committed; real migration and rollback tests pending |
| Background processing | PostgreSQL durable outbox, lease fencing, retries and dead-letter behavior | Implementation and synthetic concurrency tests committed; execution pending |
| Engineering standards | TypeScript, monorepo tasks, ESLint, unit/integration tests and synthetic isolation controls | Exact-commit local evidence pending |
| Observability | Restricted structured operational event logger designed not to accept patient payloads | Source and unit tests committed; execution pending |
| Infrastructure | Preview Docker configuration, disposable PostgreSQL verification, local build and smoke-test script | Local execution pending |

## Verification approach

GitHub Actions is disabled as an automatic acceptance mechanism because billing currently blocks its use. The company will conduct Phase 1 engineering verification on a controlled local workstation using the [Phase 1 local verification procedure](operations/phase-1-local-verification.md).

The local verifier is committed as `scripts/verify-phase1-local.sh`. It builds sequentially and starts only one isolated PostgreSQL container; it does not stop unrelated Docker services.

## Open acceptance items

1. Generate, review, and commit a reproducible `pnpm-lock.yaml`.
2. Run the exact-commit local verification pipeline and resolve all installation, typecheck, lint, test, migration, rollback, security audit, build and smoke-test failures.
3. Generate and review `docs/api/openapi.json`; commit a reproducible API contract snapshot.
4. Confirm PostgreSQL schema constraints, migration tracking, results ownership, audit immutability, and worker concurrency behavior through executed tests.
5. Confirm patient and staff authorization with synthetic tokens, including revoked access, cross-patient denial and verified multi-factor staff access.
6. Review responsive patient, operations and field foundations for accessibility and security boundaries.
7. Record the final local verification results against a fixed commit and complete Phase 1 approval.

## Scope boundaries

Phase 1 does not activate customer orders, real collection assignments, clinical result downloads, online payments or partner laboratory processing. Production identity-provider contracts, secure result document delivery, operational and clinical processes, and payment settlement have dedicated future milestones.

**Safety status:** No live patient, clinical, payment, or operational data is authorized in the development and test environments. Fisher Healthcare is not yet approved for live healthcare delivery.

## Phase closure

Phase 1 can be marked complete only when all acceptance requirements are verified and recorded. A committed implementation, absence of CI errors, or unexecuted test specification is not sufficient evidence of completion.
