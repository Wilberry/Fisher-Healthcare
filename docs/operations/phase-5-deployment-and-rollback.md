# Fisher Healthcare — Phase 5 deployment and rollback control

**Status:** Engineering handover for a proposed controlled pilot. This document
does not authorize a production deployment or processing of patient data.

## Deployment topology and separation

- **Development:** local TypeScript workspace, isolated databases and synthetic
  identities; may enable Phase 2–5 explicitly restricted test modes.
- **Disposable verification:** clean pinned commit, one freshly created local
  PostgreSQL 16 container for integration and a separate disposable restore drill.
  No connection to deployed clinical or payment providers.
- **Restricted staging (future):** private infrastructure, approved identity
  service, least-privilege database roles, encrypted object storage, approved
  outbound staging contacts, audited secrets access and restricted network
  boundaries. Use only synthetic or appropriately authorized non-clinical test data.
- **Production controlled pilot (not enabled):** independently approved clinical
  operations and provider arrangements, Nigerian privacy review, witnessed recovery
  and operational supervision. Deployment must be a separate human-authorized
  process from this engineering PR.

The staging region, hosting operator, service-provider contracts, RTO/RPO,
runtime topology and launch zones are not yet approved. Do not infer them from
placeholder Compose or Next.js preview settings.

## Pinned software acceptance gate

Before a software release candidate is considered, evidence must establish:

1. Exact Git commit SHA and dependency lockfile checksum.
2. Successful TypeScript, lint, build, unit and PostgreSQL integration tests with
   none unexpectedly skipped.
3. Forward migration checksum and schema/contract compatibility checks.
4. Generated OpenAPI parity and authenticated API/BFF negative tests.
5. Both production and full dependency audit results, including tracked
   low/moderate findings.
6. Clean synthetic restore exercise and reproducible evidence summary.
7. Bounded local health/unauthorized access probe, with no clinical data.
8. Signed review of changed permissions, clinical/financial invariants and
   service configurations.

These are **engineering gates**, not legal/clinical approvals.

## Deployment order — after independent authorization

A reviewed operational deployment would ordinarily:
1. Confirm named incident, release, security and clinical authorities, and a
   frozen deployment window.
2. Create and verify an encrypted recovery point under approved key custody.
3. Run explicit forward-only schema migrations with checksum validation and
   backward-compatible application contracts. Never attempt a blind SQL down
   migration against records that could include medical or financial history.
4. Roll out a pinned application artifact to a limited internal audience,
   initially with external deliveries and money movement disabled.
5. Inspect readiness, error rates, durable work queues, custody exceptions,
   protected result-access audit and reconciliation.
6. Obtain signed operational approval before expanding any traffic or enabling
   integrations. The current repository **contains no activation automation**.

## Stop / rollback conditions

Stop rollout on unauthorized result access, signature/JWT validation defects,
PHI appearing in logs, custody lineage gaps, duplicate charge/refund behavior,
incorrect payable/reconciliation states, queue lease corruption, or suspected
privacy breaches. Freeze further changes and preserve immutable evidence.

For an application regression, redeploy the prior compatible artifact only
under an authorized plan. Validate its compatibility with **forward-only**
migrations and new schema. Do not revert committed custody, audit, release,
payment or incident records to obtain a green status. Database recovery is an
independently approved, witnessed procedure with known recovery point and
business reconciliation. Synthetic local restore results cannot guarantee
production RPO/RTO.

## Verification ownership

- Engineering lead: commit provenance, API and migration compatibility.
- Security/privacy lead: privilege separation, token handling, data processing
  vendor/security controls, incident escalation.
- Clinical/laboratory leads: collection/result workflows, urgent findings and
  release authority.
- Operations/finance leads: staffing, partner arrangements, reconciliation and
  supervised stop conditions.
- Infrastructure lead: backup key custody, access-controlled rollout,
  observability, encrypted restore and failback.

Human approvals must be recorded outside this synthetic software feature;
setting a test environment variable never supplies approval.
