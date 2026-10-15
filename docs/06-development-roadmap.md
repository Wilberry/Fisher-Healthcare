# Fisher Healthcare Development Roadmap

**Programme status:** Phased platform development in progress. The roadmap defines the company's proposed delivery sequence, scope, and release assurance requirements. Milestone dates will be established alongside staffing, commercial partnerships, and operational capacity.

## Phase 1 — Product foundation, UX and architecture

**Strategic objective:** Establish the software engineering, product design, data architecture, and security foundations required for subsequent service development.

**Planned capabilities and deliverables:**
- Product requirements traceability matrix and service blueprints.
- Patient, operations and field information architecture; responsive UI components; accessibility rules.
- pnpm/Turborepo workspace, Next.js apps, NestJS API and worker shells with health checks.
- Drizzle/PostgreSQL migrations, seed strategy and isolated test database.
- OIDC identity integration, authorization policy framework and audited staff roles.
- Domain contracts, API error conventions, OpenAPI generation and ADRs.
- CI lint, typecheck, unit/integration tests, dependency/security scanning.
- Environment and secret handling, containerized local development and staging plan.

**Phase completion criteria:** Fresh checkout boots; all CI checks pass; schema migrate/rollback tested; forbidden resource access denied; design flows reviewed; core business invariants documented.

## Phase 2 — Patient booking and payment

**Planned capabilities and deliverables:** Public site, catalogue, service zones, lab offerings, test preparation, patient/family profiles, booking drafts, slot holds, Regular/Premium quotes, verified checkout, receipts, customer dashboard shell, booking timeline, notifications, WhatsApp-assisted intake.

**Phase completion criteria:** Full synthetic booking works; expired holds cannot oversell; duplicate callbacks cannot double-charge; caregiver result permissions are separated; cancellations follow policy.

## Phase 3 — Dispatch, collection and custody

**Planned capabilities and deliverables:** Operations queues, staffing and shifts, assignment and zone batching, field PWA, specimen IDs/labels, collection checklists, handoff records, lab manifests, transport status, incident/exception management, offline event synchronization.

**Phase completion criteria:** Complete multi-specimen collection is traceable; wrong actor cannot alter custody; retries do not duplicate events; field recovery tested; operational staff can resolve failed collection.

## Phase 4 — Laboratory, results and finance

**Planned capabilities and deliverables:** Internal laboratory onboarding and offerings, acceptance/rejection workflows, controlled result intake/release, patient dashboard result history, secure email delivery, physical-copy add-on workflow, payment reconciliation, refunds, lab payables/settlements and reporting.

**Phase completion criteria:** Result access is patient-scoped and audited; dashboard/email paths tested independently; rejected specimen does not corrupt unrelated tests; financial ledger reconciles.

## Phase 5 — Production readiness and controlled Lagos pilot

**Planned capabilities and deliverables:** Partner agreements, clinically approved SOPs, Nigerian privacy/regulatory review, security assessment, production infrastructure, encrypted backups and restore drills, incident runbooks, observability, load and failure tests, training and small supervised real-order pilot.

**Phase completion criteria:** No open critical security/patient-safety defects; documented regulatory and clinical sign-off; disaster recovery proven; pilot completion and exception handling evidenced; public launch authorization recorded.

## Phase 6 — Public launch and growth

**Planned capabilities and deliverables:** Public Lagos availability, operational reporting, service-zone tuning, recurring booking convenience, expanded partner operations, scoped lab portal, referral processes, and additional coverage as capacity permits.

**Phase completion criteria:** Monitored production stability, reconciliation accuracy, customer support capacity, laboratory performance and documented expansion readiness.

## Programme-wide workstreams

| Workstream | Ongoing programme commitment |
| --- | --- |
| Product | Requirements and acceptance criteria updated |
| Design | Mobile responsiveness, accessible states and copy review |
| Backend | Transactions, authorization, audit and idempotency |
| Quality | Unit, integration, contract and end-to-end tests |
| Security | Threat model updates and dependency review |
| Operations | Runbooks, observability, incident escalation |
| Documentation | API, ADR, migrations and deployment guides current |

## Quality and delivery assurance

Fisher Healthcare's engineering assurance framework requires each delivered capability to meet its approved functional, security, accessibility, and operational criteria. Phase closure is supported by verified test evidence, reviewed architecture and data changes, updated specifications, and documented release approval.

## Commercial and operational dependencies

Production service activation depends on contracted laboratory partners, a validated test catalogue, clinically approved collection and transport procedures, defined coverage areas, pricing and refund policies, result release governance, patient consent requirements, approved service providers, infrastructure arrangements, staffing capacity, and incident response readiness.

## Programme governance

The programme will maintain aligned product specifications, technical contracts, architecture records, and release milestones. Changes to the agreed service model or platform design will be assessed for their implications across customer experience, clinical operations, security, cost, and delivery schedule.
