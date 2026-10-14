# Domain model and operational workflows

## 1. Entity inventory

**Identity:** users, identities, sessions, staff_profiles, role_assignments, audit_events.

**Patients:** patients, patient_relationships, consents, addresses, communication_preferences.

**Catalogue:** tests, test_categories, specimen_requirements, laboratories, lab_test_offerings, lab_agreements.

**Orders:** booking_drafts, quotes, quote_items, orders, order_items, order_events, service_zones, collection_slots, slot_holds.

**Field/logistics:** staff_shifts, assignments, routes, route_stops, specimens, specimen_labels, custody_events, incidents, lab_manifests, lab_receipts.

**Results:** lab_result_submissions, result_documents, result_release_events, result_access_events, delivery_attempts.

**Finance:** payment_intents, provider_events, ledger_accounts, ledger_entries, refunds, lab_payables, settlements, reconciliation_runs.

**Operations:** support_cases, exception_cases, notification_outbox, jobs, idempotency_records.

Names are logical entities; migration-level schema and cardinalities will be finalized in Phase 1.

## 2. Core relationships

- A user can represent one or more patient profiles through scoped relationships.
- A patient can have many orders; an order can contain many tests and specimens.
- A test may require one or more specimen types; a specimen may serve multiple compatible ordered tests under lab SOP.
- An order has one quoted service tier and scheduled collection window; rescheduling creates auditable history.
- A specimen has many append-only custody events and zero or more documented incidents.
- A result belongs to specific ordered tests and patient; release and access events are separate.
- Financial obligations track the customer payment and lab payable independently.

## 3. Booking state machine

```text
DRAFT -> QUOTED -> SLOT_HELD -> AWAITING_PAYMENT
 -> CONFIRMED -> ASSIGNED -> VISIT_IN_PROGRESS
 -> COLLECTED -> LAB_PROCESSING -> RESULTS_READY -> COMPLETED
```

Alternative guarded states include EXPIRED, PAYMENT_FAILED, CANCELLED, COLLECTION_FAILED, PARTIALLY_FULFILLED and EXCEPTION. Payment confirmation is derived from verified server-side evidence, not a client redirect. Order-level state is an aggregate projection; specimen and test statuses remain independent.

## 4. Specimen custody lifecycle

```text
PLANNED -> COLLECTED -> PACKAGED -> HANDED_TO_COURIER
 -> IN_TRANSIT -> LAB_RECEIVED -> ACCEPTED
```

REJECTED, LOST, DAMAGED and QUARANTINED require exception workflows. Custody event contains specimen ID, actor, action, occurred/recorded times, handoff counterpart, condition, location at appropriate granularity, and event source. No destructive update to historical events.

## 5. Result release

1. Lab submits validated result using approved secure channel.
2. Authorized staff/system checks patient/order/test linkage, file integrity and lab validation.
3. Result is stored encrypted in private storage and indexed as unreleased.
4. Authorized release transitions result to available, recording actor, timestamp and version.
5. Patient dashboard lists released result for correct patient.
6. Approved secure email process sends result or authenticated protected access; failure creates retry/exception without hiding dashboard availability.
7. Every result view/download and delegated access is audited.

## 6. Regular batching and Premium scheduling

Capacity considers zone, collector shift, lab acceptance window, specimen transport requirements and tier cutoff. Regular batching groups compatible bookings by vicinity while honoring confirmed windows. Premium scheduling reserves priority capacity only when feasible. A slot hold expires automatically and cannot be oversold under concurrent checkout.

## 7. Finance and settlement

Create immutable quote with test fee, logistics fee, physical delivery fee and total. Record verified provider payment against order, post balanced ledger entries, recognize lab payable under contracted terms, and reconcile provider settlements. Refunds post compensating entries rather than deleting history. Lab payout references approved payable items and settlement evidence.

## 8. Failure recovery

Duplicate payment event: deduplicate and acknowledge. Unavailable slot: release hold and request alternative. Missed visit: exception, notify and reschedule/refund per policy. Specimen rejected: quarantine affected test workflow, coordinate recollection. Email failure: retry with backoff, preserve dashboard result, escalate if permanent. Offline field event: client-generated ID, server validation, idempotent sync and explicit conflict resolution.

## 9. Audit invariants

No unverified payment becomes PAID. No result is visible before authorized release. No actor reads an unrelated patient's result. No custody transfer lacks attributable sender/receiver evidence. No order becomes COMPLETED while required items remain unresolved. No lab settlement exceeds approved payable balance without authorized adjustment.
