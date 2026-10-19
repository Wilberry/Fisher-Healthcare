# Phase 3 — Dispatch, Collection and Custody Engineering Contract

Status: IN DEVELOPMENT. This contract defines implementation and local acceptance; it does not assert that runtime features have passed verification.

## Integration boundary
Phase 3 is developed on `feat/phase3-dispatch-collection-custody` independently of the Phase 2 verification branch. Only confirmed, paid, eligible orders may enter dispatch. All incoming order references must be validated against the authoritative order store. No field request can create or mark a paid order. Phase 1 and Phase 2 engineering have merged into main; current Phase 1 security remediation must be preserved when Phase 3 integrates. External clinical and provider release gates remain separate.

## Migration integration
Phase 3's originally drafted migration names `0001_phase3_dispatch_custody.sql` and `0002_phase3_manifests_incidents.sql` must not be applied to a database that has already applied the Phase 2 migration series through `0016`. Since Phase 3 has not undergone local acceptance or production deployment, they are renumbered as `0017_phase3_dispatch_custody.sql` and `0018_phase3_manifests_incidents.sql` before its first accepted integration. Never silently rewrite checksums in an existing database: use a fresh disposable integration database and abort on any pre-existing Phase 3 migration fingerprint under the old filenames.

## Delivery increments
1. Database migration and domain services: shifts, assignments, specimens, custody events, incidents, manifests, offline receipts and immutable audit trail. Unique client-event IDs, foreign keys, status checks, indexes and atomic transition guards.
2. Dispatch: staff eligibility, zone/shift availability, capacity checks, atomic claim/reassignment, conflict-safe assignment, queue filtering and audit.
3. Field workflows: own-assignment read, arrival, checklist, immutable barcode verification receipt as a prerequisite for collection, specimen condition, failure and exception reporting. This technical check supplements, but does not replace, approved patient identity and collection SOPs. Minimum-necessary patient data.
4. Custody: immutable append-only event history, explicit sender/receiver authorization and acknowledgement, monotonic transitions, duplicate rejection, specimen isolation, manifest creation and lab receipt handoff contract (Phase 4 integration boundary).
5. Offline: per-device event identity, idempotent batched sync, server-side ordering and authorization, conflict responses, replay protection, explicit recovery UX.
6. Operations and field interfaces: mobile-first field PWA, dispatch queue, assignments, custody timeline, exceptions and manifest monitoring; loading/error/offline/accessibility states.
7. Local acceptance: migrations, typecheck, lint, unit/integration tests, concurrent assignment and event replay tests, authorization matrix, synthetic end-to-end multi-specimen flow, OpenAPI parity, build and dependency audit.

## Non-negotiable invariants
- Staff must have an active, scoped permission and a valid assignment or transfer role for every mutation.
- The actor may not be supplied by the client as trusted identity.
- Custody event history is append-only; correction is a new attributed event.
- A handoff is not complete without verifiable receiving-party acknowledgement.
- Concurrent assignment or custody transitions have one winner, not two.
- A retry with the same event ID and payload returns the same outcome; reuse with different payload is rejected.
- Offline events are untrusted until independently authenticated, authorized and checked against current state.
- Rejected, damaged, missing or quarantined specimens cannot silently progress.
- Logs, errors, analytics and field caches must not expose clinical results or unnecessary patient details.
- A completed visit does not imply that every specimen has been accepted by a lab.

## Active engineering handoff

The Phase 3 feature branch includes additive migrations 0017–0025; scoped dispatch, field, incident, custody, courier-handoff and laboratory-manifest APIs; immutable audit receipts; source policy tests; and disposable PostgreSQL integration scenarios.

The accepted Phase 2 `main` baseline was incorporated into the Phase 3 branch in a two-parent integration commit `65c4f1309c874de3ed71ae59c02b751da767e91f`, retaining its booking/payment/API/security/lockfile history and routes. The integration is NOT a merge of Phase 3 back into `main`. Source-level and database tests are still unverified locally. Dispatch zone checks depend on Phase 2's `service_zones` and `collection_slots`.

The `/dispatch` and `/visits` workbenches expose training fixtures **only** when `FISHER_PHASE3_DEMO_MODE=synthetic-only` outside production. They also have server-side OIDC/PKCE staff sessions and scoped API reads. An authenticated collector can open `/visits/[id]` and submit versioned label/collection events through a same-origin server-only BFF, subject to the separate synthetic-only API execution gate. Staff credentials are never returned to client JavaScript. An experimental encrypted IndexedDB queue now exists only for explicit non-production synthetic mode. It stores minimal specimen UUIDs, action/version/event IDs (no barcodes or clinical/patient fields), is capped at 25 events and 24 hours, and requires a fresh matching signed staff identity for manual reconciliation. This design does not establish approved protection against compromised devices, XSS, browser deletion failures or production PHI use. Collector incident and courier offer interfaces and courier-specimen reconciliation now exist in source. OIDC callback/role revocation, race safety, and every UI mutation still require disposable-provider/database integration tests before acceptance.

## Test-mode and laboratory grant boundaries

All Phase 3 database APIs require `FISHER_PHASE3_OPERATION_MODE=synthetic-only`, `FISHER_DISPOSABLE_DB_ACK=disposable-test-only`, an explicit loopback `fisher_test` PostgreSQL URL, and a non-production Node environment. Stage and live operation modes are NOT implemented. Database-backed acceptance also independently checks `current_database()`.

Lab manifest receipt requires a current lab-specific grant in `phase3_lab_staff_access`. Internal grants follow an auditable two-administrator request/approval/rejection workflow; requesters cannot approve their own requests and administrators may revoke a grant immediately.

Local acceptance is consolidated into `scripts/verify-phase3-local.sh`, which prepares a generated OpenAPI snapshot in an isolated worktree, runs the complete Phase 2 and Phase 3 migrations/tests/audits/builds and route smokes, and optionally fast-forward pushes the accepted Phase 3 branch. The current phase is NOT verified until that script succeeds at the exact commit.

## Release controls
Use synthetic patients and specimens only. No real clinical data, external courier dispatch or live lab acceptance before the security issue, clinical SOPs and operational release controls are closed. GitHub Actions are not a required local verification mechanism. Record exact SHA, environment, commands, counts and failures from the final local verification before marking the phase accepted.
