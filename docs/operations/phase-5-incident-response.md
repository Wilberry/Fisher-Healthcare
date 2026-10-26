# Fisher Healthcare — Phase 5 synthetic incident response

**Scope:** Internal engineering rehearsal only. This is not an approved live
incident command center, emergency clinical workflow, or legal sign-off.

## Alert review cycle

1. The currently authenticated administrator opens the synthetic readiness dashboard.
2. The administrator evaluates three aggregate counts: unresolved custody incidents,
   dead-lettered background events and failed result-availability notifications.
3. An open alert is acknowledged by an MFA-authenticated administrator. The
   acknowledgment is recorded in immutable audit history, without personal data.
4. A real operational investigation must determine the actual cause and impact
   before changing any upstream patient, specimen or result state. The Phase 5
   alert itself cannot perform those changes.
5. A later evaluation resolves the alert only when the underlying count is
   zero. A recurrence reopens it and clears the previous acknowledgment. Every evaluated opening, resolution, recurrence
   and acknowledgment is persisted as an append-only aggregate event, separate
   from the current alert state. The audit also records which administrator
   performed the transition.

An acknowledged alert is **not** resolved; a resolved alert is **not** proof
of regulatory clearance or clinical safety.

## Routing and operational response

| Aggregate signal | Suggested owner for rehearsal | Rehearsal response |
| --- | --- | --- |
| Custody incidents | Dispatch/collection lead; clinical lead for specimen safety | Stop synthetic specimen progression, verify custody sequence, preserve incident evidence; obtain qualified clinical decisions for any actual patient-impacting event |
| Outbox dead letters | Backend/operations on-call | Determine failed worker class, validate lease/fencing and idempotency, review safe synthetic replay; never manually mutate clinical records |
| Result email failures | Results operations and privacy lead | Verify recipient consent/revocation and release evidence, inspect provider-safe telemetry; never send report contents through general email |

All real incidents require named duty owners, approved contact methods, response
windows, communications templates and escalation routes before a pilot.
Those details remain open organizational decisions and must not be invented
by an engineering implementation.

## Security, privacy and external escalation

A suspected privacy breach requires prompt containment, preserving access
logs without exposing clinical material, and contacting qualified Nigerian
privacy/legal advisers under the approved breach response procedure. Staff
must not copy diagnostic reports into chat, tickets, logs or incident emails.

A critical specimen or urgent clinical concern must be escalated to
authorized laboratory/clinical professionals through an approved channel;
the engineering console cannot classify clinical urgency or order care.

## Evidence and exercise acceptance

Record: synthetic incident identifier where applicable, alert signal,
count changes, administrator authorization result, exact software commit,
reproduction steps, containment decision, audit records, resolution
verification and outstanding actions. Keep identifiers and clinical payload
out of exported readiness dashboards.

Acceptance drills must prove unauthorized access is denied, replay does not
overwrite acknowledgments, resolved signals reopen upon recurrence, logs do
not disclose protected data, and releases remain disabled in production.

## Deployment, recovery and stop conditions

If a software regression exposes restricted clinical records, bypasses
role checks, alters financial invariants, or corrupts custody evidence,
stop any proposed rollout and restore known-good application state under a
reviewed deployment procedure. Do not roll back database migrations
blindly; preserve audit and transactional history.

The disposable Phase 5 restore drill exercises migrations, archive/restore
and a marker only. Full encrypted production recovery with agreed RTO/RPO,
key custody, auditability and a witnessed rehearsal is a later independent
approval requirement.
