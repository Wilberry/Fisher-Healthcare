# Development roadmap and release gates

**Status:** Authoritative phased delivery plan. Phases are dependency-driven; dates and estimates require staffing and partner validation. Completion is based on evidence, not percentage claims.

## Phase 1 — Product foundation, UX and architecture

**Objectives:** Establish reproducible engineering foundations and sign off domain rules.

**Deliverables:**
- Product requirements traceability matrix and service blueprints.
- Patient, operations and field information architecture; responsive UI components; accessibility rules.
- pnpm/Turborepo workspace, Next.js apps, NestJS API and worker shells with health checks.
- Drizzle/PostgreSQL migrations, seed strategy and isolated test database.
- OIDC identity integration, authorization policy framework and audited staff roles.
- Domain contracts, API error conventions, OpenAPI generation and ADRs.
- CI lint, typecheck, unit/integration tests, dependency/security scanning.
- Environment and secret handling, containerized local development and staging plan.

**Acceptance gate:** Fresh checkout boots; all CI checks pass; schema migrate/rollback tested; forbidden resource access denied; design flows reviewed; core business invariants documented.

## Phase 2 — Patient booking and payment

**Deliverables:** Public site, catalogue, service zones, lab offerings, test preparation, patient/family profiles, booking drafts, slot holds, Regular/Premium quotes, verified checkout, receipts, customer dashboard shell, booking timeline, notifications, WhatsApp-assisted intake.

**Acceptance gate:** Full synthetic booking works; expired holds cannot oversell; duplicate callbacks cannot double-charge; caregiver result permissions are separated; cancellations follow policy.

## Phase 3 — Dispatch, collection and custody

**Deliverables:** Operations queues, staffing and shifts, assignment and zone batching, field PWA, specimen IDs/labels, collection checklists, handoff records, lab manifests, transport status, incident/exception management, offline event synchronization.

**Acceptance gate:** Complete multi-specimen collection is traceable; wrong actor cannot alter custody; retries do not duplicate events; field recovery tested; operational staff can resolve failed collection.

## Phase 4 — Laboratory, results and finance

**Deliverables:** Internal laboratory onboarding and offerings, acceptance/rejection workflows, controlled result intake/release, patient dashboard result history, secure email delivery, physical-copy add-on workflow, payment reconciliation, refunds, lab payables/settlements and reporting.

**Acceptance gate:** Result access is patient-scoped and audited; dashboard/email paths tested independently; rejected specimen does not corrupt unrelated tests; financial ledger reconciles.

## Phase 5 — Production readiness and controlled Lagos pilot

**Deliverables:** Partner agreements, clinically approved SOPs, Nigerian privacy/regulatory review, security assessment, production infrastructure, encrypted backups and restore drills, incident runbooks, observability, load and failure tests, training and small supervised real-order pilot.

**Acceptance gate:** No open critical security/patient-safety defects; documented regulatory and clinical sign-off; disaster recovery proven; pilot completion and exception handling evidenced; public launch authorization recorded.

## Phase 6 — Public launch and growth

**Deliverables:** Public Lagos availability, operational reporting, service-zone tuning, recurring booking convenience, expanded partner operations, scoped lab portal, referral processes, and additional coverage as capacity permits.

**Acceptance gate:** Monitored production stability, reconciliation accuracy, customer support capacity, laboratory performance and documented expansion readiness.

## Cross-phase workstreams

| Workstream | Required every phase |
| --- | --- |
| Product | Requirements and acceptance criteria updated |
| Design | Mobile responsiveness, accessible states and copy review |
| Backend | Transactions, authorization, audit and idempotency |
| Quality | Unit, integration, contract and end-to-end tests |
| Security | Threat model updates and dependency review |
| Operations | Runbooks, observability, incident escalation |
| Documentation | API, ADR, migrations and deployment guides current |

## Definition of done

Feature is complete only when behavior matches acceptance criteria, authorization and edge cases are tested, migrations are safe, metrics/logging avoid sensitive data, API and user documentation are updated, CI is green, and an accountable reviewer approves. A phase is complete only with reproducible verification evidence.

## Dependencies and decision checkpoints

Before production: confirmed lab partners, supported test menu, specimen collection and transport SOPs, collection coverage, price agreements, refund rules, result release ownership, consent model, vendor data processing arrangements, hosting region, staffing capacity and incident response. These are open operational decisions, not assumptions.

## Change control

Product baseline changes require a decision record, affected requirement IDs, updated API/schema specifications and explicit phase impact. Engineering must not silently reinterpret business requirements.
