# Fisher Healthcare — Phase 3 Engineering Status

**Phase:** Dispatch, Collection and Custody — IN DEVELOPMENT  
**Source branch:** `feat/phase3-dispatch-collection-custody`  
**Acceptance:** OPEN. Source committed; consolidated exact-commit local verification not yet executed.  
**Production:** NOT APPROVED. Synthetic test identities and disposable PostgreSQL only.

## Implemented source increments

- Active shift and zone-scoped dispatch queue and assignment controls, with locked overlapping-worker capacity checks.
- Assigned collector access, versioned specimen custody, append-only events and replay-safe receipts.
- Courier handoff offers with frozen specimen versions, authenticated receiving courier acknowledgement, atomic custody progression, and replay defense.
- Collector/courier incident reports, idempotent event IDs, supervisor resolution audit, and unresolved-incident custody blocks.
- Internal lab manifests, staff-authenticated receipt, full specimen reconciliation, reason-coded rejection, audit and receipt idempotency.
- Offline event reconciliation and `/field/events/sync` API contracts; durable device sync remains in development.
- Production-gated UI workbenches at `/dispatch` and `/visits`, with explicit synthetic-only training previews.
- Phase 3 migrations numbered 0017–0020 and authored database-backed multi-specimen flow tests.

## Remaining release engineering

1. Integrate the currently accepted Phase 2 `main` into Phase 3 without overwriting prior security patches, APIs, migrations, lockfile or OpenAPI.
2. Implement signed server-side staff SSO and properly authorized browser-to-API forwarding for operations/field. No real personal data in client caches.
3. Complete visit progression, collection checklist and labels, courier staffing/assignment, and recoverable failure handling.
4. Run one consolidated exact-commit local verification: Node 22, pnpm 9.15.9, disposable PostgreSQL 16, migrations and rollback checks, all unit/integration/security tests, lint/typecheck/build, regenerated OpenAPI, production/full dependency audits and API/three-web-app smoke tests. GitHub Actions remains unavailable.
5. Complete external clinical, privacy, partner and operations release gates separately. No production or real-patient launch is implied by source completion.

**Phase 3 is not accepted or merge-ready.**
