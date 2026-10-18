# Phase 3 — Dispatch, Collection and Custody Engineering Contract

Status: IN DEVELOPMENT. This contract defines implementation and local acceptance; it does not assert that runtime features have passed verification.

## Integration boundary
Phase 3 is developed on `feat/phase3-dispatch-collection-custody` independently of the Phase 2 verification branch. Only confirmed, paid, eligible orders may enter dispatch. All incoming order references must be validated against the authoritative order store. No field request can create or mark a paid order. Phase 1 security exception remains a release blocker.

## Delivery increments
1. Database migration and domain services: shifts, assignments, specimens, custody events, incidents, manifests, offline receipts and immutable audit trail. Unique client-event IDs, foreign keys, status checks, indexes and atomic transition guards.
2. Dispatch: staff eligibility, zone/shift availability, capacity checks, atomic claim/reassignment, conflict-safe assignment, queue filtering and audit.
3. Field workflows: own-assignment read, arrival, checklist, label verification, specimen collection, condition, failure and exception reporting. Minimum-necessary patient data.
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

## Release controls
Use synthetic patients and specimens only. No real clinical data, external courier dispatch or live lab acceptance before the security issue, clinical SOPs and operational release controls are closed. GitHub Actions are not a required local verification mechanism. Record exact SHA, environment, commands, counts and failures from the final local verification before marking the phase accepted.
