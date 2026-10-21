# Fisher Healthcare Development Roadmap

**Programme status:** **Phase 4 — Laboratory, Results and Finance is in development.** Phases 1–3 are merged into `main` following local engineering acceptance. The roadmap defines the company's delivery sequence, scope and release assurance requirements. Milestone dates remain dependent on staffing, partnerships and operational capacity.

## Phase 1 — Product foundation, UX and architecture

**Engineering milestone status: COMPLETED AND MERGED.** Initial local engineering acceptance on 16 October 2026 at `a504bee8d858712a8ada350a9792a87d23ecbb9a` passed functional checks with a documented development-only `braces` dependency exception. The follow-up remediation was subsequently merged into `main` ([PR #4](https://github.com/Wilberry/Fisher-Healthcare/pull/4)); [Issue #2](https://github.com/Wilberry/Fisher-Healthcare/issues/2) is closed. Production release and use of real clinical/patient data remain separately prohibited until approved. [Historical Phase 1 acceptance](operations/phase-1-engineering-acceptance.md).

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

**Engineering closure evidence:** Reproducible committed-lockfile local verification passed the functional foundation checks, including database and authorization tests. GitHub Actions remained unavailable. The original Phase 1 acceptance exception is retained in the historical record; its security follow-up was subsequently remediated and merged. Separate clinical, privacy, provider and production-release controls still apply.

## Phase 2 — Patient booking and payment

**Engineering milestone status: COMPLETED AND MERGED INTO `main` (19 October 2026).** Local exact-commit acceptance passed at `bec33a3bae4e0c12eb160c75f388ac672e7aa357`, with reviewed lockfile, OpenAPI, lint, typecheck, builds, disposable PostgreSQL migrations, automated tests, production/full high-severity dependency audits and API/three-interface smoke tests. Merged in [PR #1](https://github.com/Wilberry/Fisher-Healthcare/pull/1) as `82f025d582d976cc8f6c04818351ce1a47aa8996`. This is **engineering acceptance for synthetic/test modes only**, not external live-provider or clinical launch approval. [Acceptance record](phase-2-implementation-status.md).

**Planned capabilities and deliverables:** Public site, catalogue, service zones, lab offerings, test preparation, patient/family profiles, booking drafts, slot holds, Regular/Premium quotes, verified checkout, receipts, customer dashboard shell, booking timeline, notifications, WhatsApp-assisted intake.

**Phase completion criteria:** Full synthetic booking works; expired holds cannot oversell; duplicate callbacks cannot double-charge; caregiver result permissions are separated; cancellations follow policy.

## Phase 3 — Dispatch, collection and custody

**Engineering milestone status: COMPLETED AND MERGED (21 October 2026).** Exact-commit synthetic-only local acceptance passed for `3e59f0143c69786e300389713f1d50f6017ca301`. Merged via [PR #5](https://github.com/Wilberry/Fisher-Healthcare/pull/5) as `909971ac8ec482d23a714d64d8050d6aeea8a8bb`. This does not approve clinical production use.

**Planned capabilities and deliverables:** Operations queues, staffing and shifts, assignment and zone batching, field PWA, specimen IDs/labels, collection checklists, handoff records, lab manifests, transport status, incident/exception management, offline event synchronization.

**Phase completion criteria:** Complete multi-specimen collection is traceable; wrong actor cannot alter custody; retries do not duplicate events; field recovery tested; operational staff can resolve failed collection.

## Phase 4 — Laboratory, results and finance

**Engineering milestone status: IN DEVELOPMENT.** Work is on `feat/phase4-lab-results-finance`.

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
