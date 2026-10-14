# ADR 0003 — PostgreSQL schema and migration governance

Status: Accepted for development baseline. Date: 2026-10-15.

The `packages/database/src/schema.ts` Drizzle schema defines typed database entities; `packages/database/drizzle/0000_foundation.sql` is the initial executable SQL. These artifacts must be reconciled before any production deployment. No application may run automatic destructive schema synchronization at startup.

Migration rules: review SQL in code review; apply to a disposable database in CI; run migrations in a transaction when supported; verify constraints, indices and rollback/recovery plans; keep forward-only production migrations with documented compensating procedures.

Data ownership: patients and users are distinct. A family booking relationship is not a result-access grant. Clinical result documents live in private object storage and are referenced by opaque object keys. Custody history is append-only by application policy, and database-level immutability enforcement is required before clinical use.

Release blockers: PostgreSQL row-level restrictions or equivalent audited service access, database constraints for state/amount integrity, migration drift detection, retention and backup verification, and production identity integration.
