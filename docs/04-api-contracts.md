# Planned API and endpoint specification

**Status:** Programme target contract. Phases 1–4 have merged following synthetic-only engineering acceptance; Phase 5 engineering is in progress on a separate feature branch. This document includes planned routes. The generated [OpenAPI contract](api/openapi.json) lists implemented routes. All paths below are under `/api/v1`.

## 1. Conventions

JSON over HTTPS; RFC 3339 UTC timestamps; currency in integer minor units; opaque UUID identifiers; stable machine-readable error codes; pagination via opaque cursor; request IDs; versioned schemas. POST mutation endpoints with financial/booking effects require `Idempotency-Key`. Authentication uses secure session or bearer tokens according to client; every route enforces resource-level authorization.

Example response:
```json
{"data":{"id":"example-id","status":"confirmed"},"meta":{"requestId":"req_example"}}
```
Example error:
```json
{"error":{"code":"SLOT_UNAVAILABLE","message":"Choose another collection window","requestId":"req_example"}}
```
No sensitive clinical data in URL query strings or public error responses.

## 2. Public discovery and booking

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /catalog/tests | Search offered tests, filters and paging |
| GET | /catalog/tests/:testId | Requirements, preparation and supported specimen |
| GET | /catalog/categories | Test categories |
| GET | /service-zones | Public coverage lookup with coarse address input |
| POST | /availability/search | Available windows by zone, tests, lab and tier |
| POST | /quotes | Price breakdown and expiration |
| GET | /quotes/:quoteId | Retrieve verified quote |
| POST | /booking-drafts | Start guest/account booking |
| PATCH | /booking-drafts/:draftId | Update patient, address, tests or tier |
| POST | /booking-drafts/:draftId/validate | Validate requirements and capacity |
| POST | /bookings | Commit booking from valid draft and hold |
| GET | /bookings/:bookingId | Authorized booking detail |
| GET | /bookings/:bookingId/timeline | Customer-safe milestones |
| POST | /bookings/:bookingId/cancel | Request eligible cancellation |
| POST | /bookings/:bookingId/reschedule | Request eligible new slot |
| POST | /payments/checkout | Create provider checkout for payable booking |
| GET | /payments/:paymentId | Authorized payment status |
| GET | /bookings/:bookingId/receipt | Authorized receipt |
| POST | /support/cases | Create support request |

## 3. Identity, patients, family and results

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /me | Current principal and capabilities |
| PATCH | /me | Update account preferences |
| GET | /me/notifications | Notifications and delivery status |
| GET | /patients | Own and authorized patient profiles |
| POST | /patients | Create patient/dependant profile |
| GET | /patients/:patientId | Authorized patient profile |
| PATCH | /patients/:patientId | Update permitted fields |
| POST | /patients/:patientId/relationships | Request/record relationship authority |
| GET | /patients/:patientId/relationships | Authorized relationship grants |
| POST | /relationships/:relationshipId/revoke | Revoke delegated access |
| GET | /patients/:patientId/results | Released result listing |
| GET | /patients/:patientId/result-email-preference | Current self-owned result email consent |
| POST | /patients/:patientId/result-email-preference | Revocable result-availability email opt-in/out |
| GET | /patients/:patientId/physical-copies | Patient-owned optional physical-copy quote requests |
| POST | /patients/:patientId/physical-copies | Request a quote for a released result at an approved address |
| POST | /patients/:patientId/physical-copies/:id/cancel | Cancel an unquoted request |
| GET | /results/:resultId | Authorized result metadata |
| GET | /results/:resultId/document | Audited, patient-authorized synthetic PDF download; disabled for production |
| GET | /patients/:patientId/bookings | Authorized history |
| GET | /patients/:patientId/addresses | Saved collection locations |
| POST | /patients/:patientId/addresses | Save authorized address |

### Phase 4 synthetic finance and physical-copy quotation

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /finance/transactions | Authorized payment reconciliation view |
| GET | /finance/reconciliation | Immutable reconciliation history |
| POST | /finance/reconciliation/runs | Run guarded synthetic reconciliation |
| GET, POST | /finance/refunds | Review and record bounded refund requests |
| POST | /finance/refunds/:id/review | Independent approval or rejection; no provider refund |
| GET, POST | /finance/lab-payables | Read and record synthetic agreement payables |
| GET, POST | /finance/lab-settlements | Read and propose partner settlement batches |
| POST | /finance/lab-settlements/:id/review | Independent settlement decision; no bank transfer |
| GET | /finance/physical-copies | Finance-only physical-copy quotation queue |
| POST | /finance/physical-copies/:id/quote | Record a bounded synthetic quote; never charge or dispatch |

Production clinical data, document storage, real result-email delivery, refund execution,
settlement transfers, physical-copy payment and courier handoff are not activated by
these development endpoints.

## 4. Operations and administration

All `/ops/*` routes require authenticated staff roles and resource-scoped permissions.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /ops/dashboard | Aggregated operational workload |
| GET | /ops/orders | Search/filter bookings |
| GET | /ops/orders/:orderId | Detailed staff-authorized order |
| POST | /ops/orders/:orderId/notes | Audit-linked support notes |
| POST | /ops/orders/:orderId/transition | Guarded order action |
| GET | /ops/dispatch/queue | Unassigned and active tasks |
| POST | /ops/assignments | Assign eligible collector/courier |
| PATCH | /ops/assignments/:assignmentId | Reassign or update allowed details |
| GET | /ops/service-zones | Manage configured coverage |
| POST | /ops/service-zones | Create zone |
| PATCH | /ops/service-zones/:zoneId | Update zone |
| GET | /ops/capacity | Shifts, staffing and slot capacity |
| POST | /ops/capacity/slots | Configure capacity |
| GET | /ops/specimens | Search specimens |
| GET | /ops/specimens/:specimenId/custody | Authorized custody history |
| POST | /ops/specimens/:specimenId/incident | Report specimen exception |
| GET | /ops/labs | Partner laboratory directory |
| POST | /ops/labs | Onboard approved lab |
| PATCH | /ops/labs/:labId | Update verified lab details |
| GET | /ops/labs/:labId/offerings | Lab test capabilities/pricing |
| PUT | /ops/labs/:labId/offerings/:testId | Update offering with approvals |
| POST | /ops/lab-manifests | Create specimen transfer manifest |
| POST | /ops/lab-manifests/:manifestId/receipt | Record lab acceptance/rejection |
| POST | /ops/results/intake | Register controlled lab result |
| POST | /ops/results/:resultId/release | Authorized result release |
| GET | /ops/results/pending | MFA-protected independent release review queue |
| GET | /ops/results/intake-readiness | Laboratory staff permission probe |
| GET | /ops/exceptions | Operational exception queue |
| POST | /ops/exceptions/:exceptionId/resolve | Resolution with reason |
| GET | /ops/customers | Scoped customer support lookup |
| GET | /ops/staff | Authorized staff listing |
| POST | /ops/staff | Invite/activate staff |
| PATCH | /ops/staff/:staffId/roles | Role change with audit |
| GET | /ops/audit | Filtered privileged audit review |
| GET | /ops/reports/operations | Aggregate performance report |

## 5. Field collection and transport

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /field/assignments | Own assigned jobs |
| GET | /field/assignments/:id | Minimum necessary task details |
| POST | /field/assignments/:id/arrival | Record arrival |
| POST | /field/assignments/:id/collection | Record collection and specimen IDs |
| POST | /field/specimens/:id/label-check | Confirm label verification |
| POST | /field/specimens/:id/handoff | Signed custody transfer event |
| POST | /field/specimens/:id/condition | Record condition and packaging |
| POST | /field/assignments/:id/failure | Record no-show/failed collection |
| POST | /field/incidents | Safety or logistics incident |
| POST | /field/events/sync | Idempotent batched offline events |

## 6. Finance and integrations

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /finance/transactions | Restricted transaction register |
| GET | /finance/reconciliation | Reconciliation runs and mismatches |
| POST | /finance/reconciliation/runs | Initiate authorized reconciliation |
| GET | /finance/settlements | Lab payables and settlements |
| POST | /finance/settlements | Create approved settlement batch |
| POST | /finance/refunds | Initiate approved refund |
| GET | /finance/reports | Aggregated financial reporting |
| POST | /webhooks/payments/paystack | Signature-verified payment event receiver |
| POST | /integrations/labs/:labId/results | Authenticated partner result integration, if contracted |

## Phase 5 — Synthetic operational readiness and alert lifecycle

These implemented development endpoints are protected by verified staff identity,
MFA, the current active administrator role and `audit:read`. They operate only
with explicit synthetic mode on a disposable local `fisher_test` database,
return aggregate counts/statuses only, and cannot authorize a real pilot.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /ops/pilot-readiness/snapshot | Aggregate custody, background work, result delivery and finance queue counts |
| GET | /ops/pilot-readiness/alerts | Read fixed synthetic alert status/counts and up to 30 aggregate-only immutable transitions, without patient or actor identifiers |
| POST | /ops/pilot-readiness/evaluate | Evaluate three current aggregate conditions; open, resolve or reopen internal synthetic alerts |
| POST | /ops/pilot-readiness/alerts/:code/acknowledge | Audit acknowledgment of one existing open alert by an authorized administrator |

Allowed alert codes are `custody_incidents`, `outbox_dead_letters`,
and `result_email_failures`. Acknowledgment does not resolve the underlying
incident or trigger external paging. Production clinical release, real provider
integrations and Lagos pilot activation require independent authorization.

## 7. Security and behavior contracts

- Payment webhook endpoints validate signature, timestamp/replay where supported, provider transaction identity and amount before mutating ledger.
- State-changing routes enforce valid transitions and concurrency preconditions.
- Result endpoints always check patient ownership, delegated authority, release state and document ACL.
- Field events require assignment and actor verification, stable client event IDs and server timestamps.
- Admin/finance exports are explicitly permissioned, purpose-limited and audited.
- Rate limit authentication, catalogue search, quote creation, checkout and webhook processing appropriately.
- Validate schemas at runtime; tests must cover 401, 403, 404, 409, 422, 429 and retry behavior.
- OpenAPI must include examples, pagination, auth, error codes, idempotency and field privacy classification before implementation acceptance.
