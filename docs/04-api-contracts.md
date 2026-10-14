# Planned API and endpoint specification

**Status:** Design contract, not implemented routes. All paths below are proposed under `/api/v1`. OpenAPI and runtime schemas must be generated and reviewed during implementation.

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
| GET | /results/:resultId | Authorized result metadata |
| POST | /results/:resultId/download-ticket | Short-lived authorized document access |
| GET | /patients/:patientId/bookings | Authorized history |
| GET | /patients/:patientId/addresses | Saved collection locations |
| POST | /patients/:patientId/addresses | Save authorized address |

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

## 7. Security and behavior contracts

- Payment webhook endpoints validate signature, timestamp/replay where supported, provider transaction identity and amount before mutating ledger.
- State-changing routes enforce valid transitions and concurrency preconditions.
- Result endpoints always check patient ownership, delegated authority, release state and document ACL.
- Field events require assignment and actor verification, stable client event IDs and server timestamps.
- Admin/finance exports are explicitly permissioned, purpose-limited and audited.
- Rate limit authentication, catalogue search, quote creation, checkout and webhook processing appropriately.
- Validate schemas at runtime; tests must cover 401, 403, 404, 409, 422, 429 and retry behavior.
- OpenAPI must include examples, pagination, auth, error codes, idempotency and field privacy classification before implementation acceptance.
