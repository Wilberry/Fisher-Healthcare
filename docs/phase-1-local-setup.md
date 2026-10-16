# Fisher Healthcare — Phase 1 Local Development Environment

**Programme:** Phase 1 — Product and Engineering Foundation  
**Environment classification:** Development and synthetic-data verification only

## Environment baseline

The Fisher Healthcare monorepo is standardized around Node.js 22, Corepack with pnpm 9.15.9, TypeScript, a PostgreSQL development database, and containerized tooling where appropriate.

Development environments remain isolated from production services, clinical information, and customer transactions. The project's existing Docker services and unrelated repositories must not be stopped or modified to establish a Fisher Healthcare development environment.

## Local acceptance

The authoritative procedure for end-to-end Phase 1 verification is maintained in [Local Engineering Verification](operations/phase-1-local-verification.md). It uses the consolidated script `scripts/verify-phase1-local.sh` and a single disposable PostgreSQL container.

Database migrations are managed by the checksummed migration runner:

```bash
pnpm --filter @fisher/database migrate:check
```

Migration application requires an explicit `FISHER_MIGRATE_ACK=apply-reviewed-migrations` acknowledgment and is performed only against an identified development or verification database. The original untracked manual-SQL process is superseded by this controlled runner.

## Engineering safety boundary

Only synthetic, inactive catalogue and laboratory fixtures are authorized during foundational development. The production identity provider, customer booking, payment processing, clinician-approved protocols, and clinical result delivery remain subject to their respective later milestones and acceptance checks.

The Phase 1 release gate remains open until a reproducible clean checkout, committed lockfile, executed tests, and recorded local acceptance evidence are available.
