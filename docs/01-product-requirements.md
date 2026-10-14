# Product requirements

**Document status:** Approved product baseline; detailed operational rules require validation with clinical and laboratory partners.

## 1. Purpose and outcomes

Fisher Healthcare enables patients to receive diagnostic sample collection at home or work, avoiding routine hospital queues. Qualified collectors take appropriate samples; authorized transport personnel transfer them to contracted partner labs; labs process tests and validate results; Fisher Healthcare coordinates delivery and support.

Launch area: Lagos, Nigeria. Launch is a controlled pilot followed by public availability after operational, privacy and clinical readiness gates.

## 2. Users and jobs

| Persona | Core jobs |
| --- | --- |
| Patient | Find appropriate offered tests, book collection, pay, prepare, track and access own results |
| Caregiver/account holder | Arrange and pay for authorized relatives/dependants; see only records they are authorized to access |
| Guest customer | Explore catalogue, coverage and pricing; start booking without mandatory initial registration |
| Phlebotomist | Review assignment, verify patient, collect/label sample, document condition and handoff |
| Courier/transport staff | Accept specimens, document custody and transport conditions, hand off to lab |
| Dispatcher | Allocate staff and routes, handle capacity, exceptions and SLA risk |
| Support staff | Assist bookings, rescheduling and incidents within scoped access |
| Laboratory coordinator | Maintain partner test offerings, send manifests, record acceptance and results handoff |
| Finance staff | Reconcile collections, refunds, fees and partner settlements |
| Administrator | Manage staff permissions, service zones, configurations, audit and reporting |

## 3. Customer-facing requirements

**FR-C01 Catalogue:** searchable supported tests, categories, test descriptions, specimen requirements, eligibility, preparation/fasting instructions and lab-dependent turnaround estimates. Clinical content is partner-reviewed; no unsupported test may be sold.

**FR-C02 Coverage:** validate address against enabled Lagos service zones, hours, staffing capacity and laboratory compatibility before offering a slot.

**FR-C03 Service tier:** present Regular and Premium with actual available slots, cutoff conditions, logistics fee and realistic turnaround estimate. Regular batching must not silently change a confirmed collection window.

**FR-C04 Booking:** five logical stages: tests/lab; service/slot; patient and location; quote/payment; confirmation/tracking. Preserve draft state safely, expire quotes and slot holds, prevent duplicate orders.

**FR-C05 Family bookings:** account holder may register relatives/dependants with relationship and consent/authority evidence appropriate to age and circumstances. Booking/payment authority never implies blanket result visibility.

**FR-C06 Guest-first:** browsing and quote building require no account; before order confirmation, verify appropriate contact identity and establish secure order access.

**FR-C07 Payment:** show line-item lab fee, logistics fee, optional physical-copy fee, discounts if configured, taxes/processing where applicable, and total in NGN. Confirm payments server-side.

**FR-C08 Tracking:** order reference, collection window, collector assignment state, collection, sample transport, lab receipt, processing, result availability, delivery and exceptions. Public statuses must avoid sensitive disclosures.

**FR-C09 Results:** validated results appear on the patient's authenticated dashboard and are also delivered through an approved secure email process. Notify authorized recipients when ready. Result visibility is controlled per patient/relationship and release policy; access and downloads are audited.

**FR-C10 Service management:** rebooking, cancellation, refunds and failed-collection support according to displayed policy; self-service actions constrained by state and cutoff.

**FR-C11 Communication:** transactional email, optional SMS/WhatsApp alerts, support channels and accessible notification preferences; avoid sensitive medical detail in generic messages.

**FR-C12 Physical copies:** optional paid delivery with a separate delivery workflow, recipient verification and proof of handoff.

## 4. Internal operations requirements

**FR-O01** Live queue by status, tier, geography, date, lab, exception and priority.

**FR-O02** Manual dispatch with capacity controls; Regular-area batching; Premium priority within verified staff/lab availability.

**FR-O03** Collector credentials, availability, assigned zone, shift and role management.

**FR-O04** Unique specimen identifiers, label verification, collection metadata, packaging/condition, custody handoffs and lab receipt/rejection. Multiple specimens per order supported.

**FR-O05** Field PWA with assigned tasks, scoped patient details, incident reporting, explicit event acknowledgment, and secure offline capture where safe; conflict resolution on reconnect.

**FR-O06** Internal partner-lab directory, test menus, commercial agreements, turnaround constraints, lab manifest, receipt, rejection, processing and result ingestion/release controls.

**FR-O07** Exception queue for missed appointments, failed collection, specimen rejection/loss, delays, duplicate payment, refund, delivery failure and safety events; each has owner, timestamps, severity and resolution.

**FR-O08** Payments, refunds, ledger entries, payable lab settlements, reconciliation and immutable audit history.

**FR-O09** Role-based dashboards, export controls, operational metrics and audit review.

## 5. Service expectations

- Regular: area-based batching and typically next-day collection, contingent on confirmed available windows.
- Premium: priority same-day collection subject to cutoff, zone and personnel availability.
- Result turnaround: estimated per test and laboratory. A 12-hour Premium business target is not a universal medical promise.
- Results are produced and clinically validated by authorized partner laboratories, not by the logistics platform.

## 6. Key acceptance journeys

1. Guest finds test, sees valid Lagos slot and accurate quote, verifies contact, pays once, receives order reference.
2. Caregiver books for adult relative; authorized booking succeeds; result is hidden until valid result-access authorization.
3. Regular order is batched without changing promised time; staff receive only assigned tasks.
4. Collector creates two distinct specimens; courier handoff and lab acceptance are attributable and chronological.
5. Lab rejects one specimen; affected test becomes exception, unrelated tests continue.
6. Lab result passes validation/release; patient sees it in dashboard; secure email channel delivers it or provides protected access; access is logged.
7. Refund and laboratory settlement remain consistent after cancellation or partial fulfillment.
8. A delayed or lost specimen produces an incident and blocks inaccurate completion.

## 7. Non-functional requirements

Mobile-first, WCAG 2.2 AA target, resilient network behavior, localization-friendly, secure defaults, traceability, observable queues, documented backup/restore, and repeatable deployments. Numeric SLAs, RPO/RTO and load targets will be approved before pilot based on operational capacity.
