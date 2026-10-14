# Fisher Healthcare

**Healthcare diagnostics sample collection and logistics | Lagos, Nigeria**

> Sample collection, without the hospital wait.

Fisher Healthcare coordinates home and office diagnostic sample collection, professional phlebotomy, secure transport to partner laboratories, laboratory processing, and secure results delivery. Customers can book for themselves or authorized family members. Results are available on the patient dashboard and through a secure email delivery process.

**Status:** Pre-implementation. This repository is the authoritative product and engineering documentation baseline. No implementation is implied by the specifications.

## Documentation index

1. [Product requirements](docs/01-product-requirements.md) — mission, personas, functional requirements, acceptance criteria.
2. [Architecture and technology stack](docs/02-architecture-and-stack.md) — approved design, deployment, monorepo, integration boundaries.
3. [Roles and authorization](docs/03-roles-and-permissions.md) — access control, family relationships, staff separation.
4. [API and endpoint specification](docs/04-api-contracts.md) — proposed REST endpoints, common contracts, security.
5. [Domain model and workflows](docs/05-domain-model-and-workflows.md) — entities, state transitions, custody, result release, ledger.
6. [Engineering roadmap](docs/06-development-roadmap.md) — phases, dependencies, deliverables and acceptance gates.
7. [Security, privacy and operations](docs/07-security-and-operations.md) — sensitive data, audit, incident handling and reliability.
8. [Engineering standards](docs/08-engineering-standards.md) — development workflow, quality, testing, CI/CD and governance.
9. [Design system and UX](docs/09-design-and-ux.md) — navigation, responsive flows, accessibility and brand implementation.
10. [Decision register](docs/10-decisions-and-open-items.md) — approved decisions and items awaiting operational confirmation.

## Product scope

**Initial interfaces:** patient and caregiver web app; internal operations command center; mobile-first field PWA. Laboratory relationships and laboratory processing coordination are administered internally. A scoped partner portal is included in the expansion roadmap.

**Service tiers:** Regular (batched, normally next-day collections based on available slots) and Premium (priority same-day collection where available). Turnaround estimates must be test-, laboratory-, cutoff- and capacity-specific. The strategy's 12-hour Premium target is conditional, not a universal guarantee.

**Channels:** website ordering and WhatsApp-assisted intake, with a single authoritative order record.

**Commercial model:** customer pays a combined laboratory and logistics amount; Fisher Healthcare reconciles payment and settles laboratories separately.

## Delivery principles

- No production patient data in development or tests.
- Patient safety, specimen traceability, consent, access control and financial accuracy are release gates.
- Domain logic lives in the backend, not solely in UI clients.
- Every material decision and API change must update these docs.
- Implement phases sequentially with testable acceptance criteria; do not claim a phase complete until evidence exists.

## Repository status

Documentation-first baseline. Source directories will be created during Phase 1. The repository is not yet a deployed service.

## Source context

Product intent originates from the September 2026 Fisher Healthcare Business, Product & Launch Strategy and approved product discussions. Where the strategy leaves pricing, laboratory contracts, coverage or clinical SOPs unspecified, this documentation marks them as operational dependencies rather than inventing values.
