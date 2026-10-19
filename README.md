# Fisher Healthcare

**Healthcare diagnostics, home and workplace sample collection, and laboratory logistics | Lagos, Nigeria**

> Sample collection, without the hospital wait.

## Company and product overview

Fisher Healthcare is developing an integrated healthcare diagnostics service that connects patients with professional sample collection and accredited partner laboratory services. The platform is designed to coordinate bookings, collection scheduling, specimen transportation, laboratory processing, secure result delivery, customer support, and financial settlement within a unified operating system.

The initial market is Lagos, Nigeria, with expansion determined by service coverage, laboratory partnerships, and operational readiness.

## Product vision

To make routine diagnostic testing more accessible, convenient, and dependable through coordinated at-home and workplace collection, reliable laboratory partnerships, and secure digital access to results.

## Planned service experience

Fisher Healthcare will offer a digital booking experience for individuals and authorized family members. Customers will be able to explore supported diagnostic tests, review preparation requirements, choose an available collection window, receive a transparent price quotation, and complete payment through a unified checkout.

Qualified collection personnel will attend scheduled visits and document specimen collection and handoff. Specimens will be transferred to partner laboratories for testing and clinical validation. Released results will be accessible through the patient's secure dashboard and through an approved secure email delivery process.

The service model includes **Regular** collection, organized around scheduled batching, and **Premium** priority collection where staffing, laboratory capacity, and service windows permit. Collection and result turnaround commitments will be determined by actual availability and partner laboratory requirements.

## Platform portfolio

| Platform | Proposed scope |
| --- | --- |
| Patient and caregiver platform | Test discovery, booking, family profiles, payment, order history, secure results, and support |
| Operations management platform | Orders, dispatch, staffing, service coverage, specimens, laboratory coordination, exceptions, finance, and reporting |
| Field operations application | Assigned visits, collection workflows, specimen labeling, chain of custody, and incident recording |
| Laboratory partner capabilities | Internal coordination at launch, with dedicated partner access considered in the expansion phase |

## Technology strategy

Fisher Healthcare is adopting a TypeScript-based modular platform with Next.js interfaces, a NestJS application API, PostgreSQL, Drizzle ORM, secure identity integration, private document storage, and dedicated background processing. The architecture emphasizes traceability, patient privacy, operational resilience, and controlled expansion.

The full technical design is maintained in the [Architecture and Technology Stack](docs/02-architecture-and-stack.md).

## Development programme

| Phase | Strategic objective |
| --- | --- |
| Phase 1 | Establish the product architecture, design foundations, core data model, security baseline, and engineering environment |
| Phase 2 | Deliver patient discovery, booking, family management, payment, and customer account functionality |
| Phase 3 | Deliver dispatch operations, field collection, specimen tracking, and custody management |
| Phase 4 | Deliver laboratory coordination, secure result access, and financial reconciliation |
| Phase 5 | Complete production readiness, clinical and operational validation, and the controlled Lagos pilot |
| Phase 6 | Launch publicly and expand service capacity and partner operations |

Development milestones are governed by the [Development Roadmap](docs/06-development-roadmap.md). Completion is recorded against documented acceptance criteria and verification evidence.

## Product and engineering documentation

| Document | Coverage |
| --- | --- |
| [Product Requirements](docs/01-product-requirements.md) | Customer experience, service capabilities, internal operations, and acceptance scenarios |
| [Architecture and Technology Stack](docs/02-architecture-and-stack.md) | System structure, technology selections, domain boundaries, and deployment model |
| [Roles and Permissions](docs/03-roles-and-permissions.md) | Patient, caregiver, employee, and operational authorization |
| [API Specifications](docs/04-api-contracts.md) | Planned customer, administrative, field, and financial interfaces |
| [Domain Models and Workflows](docs/05-domain-model-and-workflows.md) | Business entities, booking lifecycle, specimen custody, results, and payments |
| [Development Roadmap](docs/06-development-roadmap.md) | Phased delivery programme and completion criteria |
| [Security and Operations](docs/07-security-and-operations.md) | Clinical governance, privacy, resilience, and incident management |
| [Engineering Standards](docs/08-engineering-standards.md) | Software quality, testing, release controls, and documentation governance |
| [Design and User Experience](docs/09-design-and-ux.md) | Patient, operations, and field interface design standards |
| [Decisions and Open Items](docs/10-decisions-and-open-items.md) | Approved product decisions and pending commercial or operational determinations |

## Delivery governance

The documentation in this repository defines the company's intended product capabilities, architecture, and delivery programme. Product and technical decisions will be reflected in the relevant specifications as the platform develops. Engineering milestones will be accepted only after the corresponding security, functional, and operational criteria have been verified.

## Project status

**Current development phase: Phase 3 — Dispatch, Collection and Custody.** Engineering is under development on `feat/phase3-dispatch-collection-custody`; Phase 3 acceptance and merge are not yet complete.

**Phase 1 and Phase 2:** Their engineering foundations and synthetic booking/payment implementations have been merged into `main`. Phase 2 passed local exact-commit verification at `bec33a3bae4e0c12eb160c75f388ac672e7aa357` and merged through [PR #1](https://github.com/Wilberry/Fisher-Healthcare/pull/1) in commit `82f025d582d976cc8f6c04818351ce1a47aa8996`.

The completed Phase 2 engineering is **synthetic/staging-only**, not authorization to process real patient data, accept live payments or deliver clinical services. External-provider staging, clinical/privacy approvals and production readiness remain separately gated.

[Development Roadmap](docs/06-development-roadmap.md) · [Phase 2 Engineering Acceptance](docs/phase-2-implementation-status.md)
