# Fisher Healthcare — Phase 3 Engineering Status

**Phase:** Dispatch, Collection and Custody — IN DEVELOPMENT  
**Source branch:** `feat/phase3-dispatch-collection-custody`  
**Acceptance:** OPEN. Source committed; consolidated exact-commit local verification not yet executed.  
**Production:** NOT APPROVED. Synthetic test identities and disposable PostgreSQL only.

## Implemented source increments

- Paid-only dispatch queue and assignments, with active collector/courier shift-and-zone checks, locked overlapping-worker capacity checks, and negative synthetic eligibility tests.
- Assigned collector access, immutable barcode-label checks required before collection, versioned specimen custody, append-only events and replay-safe receipts.
- Courier handoff offers with frozen specimen versions, authenticated receiving courier acknowledgement, atomic custody progression, replay defense, and a recipient-scoped page requiring individual physical specimen-ID reconciliation.
- Collector/courier incident reports, idempotent event IDs, supervisor resolution audit, and unresolved-incident custody blocks.
- Internal lab manifests, laboratory-specific receiving grants, full specimen reconciliation, rejection reasons, audit and receipt idempotency.
- Two-person administrator request/approval/rejection for internal laboratory staff grants, with reason-coded denial, current grant listings, revocation, and an access-controlled administration interface.
- Phase 3 API methods fail closed outside explicit synthetic-only execution on a loopback `fisher_test` database and refuse production mode.
- Synthetic-only encrypted IndexedDB event recovery for at most 25 minimal custody envelopes and up to 24 hours, HMAC-scoped to the current verified field staff identity, no barcodes, patient identity, clinical data or tokens; manual reconciliation and conflict-review controls, with sign-out cleanup. The browser store is an experimental non-production facility and has NOT undergone device/privacy, XSS, loss-of-key, offline/reauth or integration acceptance.
- Operations workbenches for eligible paid-order collector shift selection, incident resolution, manifest preparation, and lab-scoped receipt reconciliation. Same-origin, fixed-route command gateways plus negative CSRF/authorization tests prevent browser-supplied bearer authority.
- Production-gated UI workbenches at `/dispatch` and `/visits`, plus `/visits/[id]` for signed, scoped collection actions. Both staff portals use encrypted, HTTP-only OIDC/PKCE sessions with server-side MFA and capability checks, and now distinguish expired/revoked sessions from API outages. No browser bearer token is exposed.
- Phase 3 additive migrations numbered `0017`–`0025`, database-backed full-flow, lab-receipt, and two-admin lab-onboarding tests authored. Not yet locally executed.

## Remaining release engineering

1. **Integrated on Phase 3 branch:** the accepted Phase 2 `main` baseline was preserved in integration commit `65c4f1309c874de3ed71ae59c02b751da767e91f` (not merged back into `main`). Phase 3 exact-commit verification and PR review remain required.
2. Verify the newly authored OIDC/PKCE staff session and operations/field BFF flows against an approved disposable OIDC staging provider. Complete production review, staff account provisioning and MFA expiry/revocation scenarios. No real personal data in client caches.
3. Verify the completed visit progression, label/collection checklist, failed-visit actions, specimen incidents, courier staffing/physical receipt and lab-reconciliation interfaces end to end. Review historical replay safety and user-facing conflict states. The experimental encrypted offline store remains synthetic-only and requires formal device/privacy approval and integration tests before any real-patient enablement.
4. Run the prepared `scripts/verify-phase3-local.sh` as one consolidated exact-commit local verification: Node 22, pnpm 9.15.9, disposable PostgreSQL 16, migrations and rollback checks, all unit/integration/security tests, lint/typecheck/build, regenerated OpenAPI, production/full dependency audits and API/three-web-app smoke tests. GitHub Actions remains unavailable.
5. Complete external clinical, privacy, partner and operations release gates separately. No production or real-patient launch is implied by source completion.

**Phase 3 is not accepted or merge-ready.** Source commits have not passed local lint, typecheck, build, migration or end-to-end gates yet; do not report those tests as passed.
