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
- Internal lab manifests, laboratory-specific receiving grants, full specimen reconciliation, rejection reasons, audit and receipt idempotency.
- Two-person administrator review for internal lab staff access requests, with immediate auditable revocation.
- Phase 3 API methods fail closed outside explicit synthetic-only execution on a loopback `fisher_test` database and refuse production mode.
- Offline event reconciliation and `/field/events/sync` API contracts; durable device sync remains in development.
- Production-gated UI workbenches at `/dispatch` and `/visits`, with explicit synthetic-only training previews.
- Phase 3 additive migrations numbered `0017`–`0023`, database-backed full-flow, lab-receipt, and two-admin lab-onboarding tests authored. Not yet locally executed.

## Remaining release engineering

1. **Integrated on Phase 3 branch:** the accepted Phase 2 `main` baseline was preserved in integration commit `65c4f1309c874de3ed71ae59c02b751da767e91f` (not merged back into `main`). Phase 3 exact-commit verification and PR review remain required.
2. Implement signed server-side staff SSO and properly authorized browser-to-API forwarding for operations/field. No real personal data in client caches.
3. Complete visit progression, collection checklist and labels, courier staffing/assignment, and recoverable failure handling.
4. Run the prepared `scripts/verify-phase3-local.sh` as one consolidated exact-commit local verification: Node 22, pnpm 9.15.9, disposable PostgreSQL 16, migrations and rollback checks, all unit/integration/security tests, lint/typecheck/build, regenerated OpenAPI, production/full dependency audits and API/three-web-app smoke tests. GitHub Actions remains unavailable.
5. Complete external clinical, privacy, partner and operations release gates separately. No production or real-patient launch is implied by source completion.

**Phase 3 is not accepted or merge-ready.** Source commits have not passed local lint, typecheck, build, migration or end-to-end gates yet; do not report those tests as passed.
