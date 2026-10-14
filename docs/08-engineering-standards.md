# Engineering standards and repository governance

## 1. Code quality

Strict TypeScript; explicit domain types; schema validation at boundaries; no unsafe implicit casts for financial/clinical records; cohesive modules; no business logic hidden in React components. Prefer named migrations and small auditable changes.

## 2. Source control

Use `main` as the stable integration branch. Work through reviewed change sets/PRs when contributors join; protect production releases with checks and approvals. Conventional commit subjects recommended. Never commit credentials, real patient information, payment secrets or private documents.

## 3. Testing pyramid

- Unit: pricing, cutoff, scheduling, state transitions, permission policies.
- Integration: PostgreSQL transactions, migrations, outbox, job retries, storage ACL, payment verification.
- Contract: OpenAPI schemas, partner adapters, webhooks and error shapes.
- End-to-end: booking, family authorization, collection, handoff, lab receipt, result release, refund and settlement.
- Security: horizontal/vertical privilege escalation, expired sessions, replay, injection, cross-patient access.
- Reliability: duplicate messages, failed jobs, partial network failure, restore and rollback.

Every clinical/financial invariant requires negative tests as well as happy paths.

## 4. CI pipeline

Install from lockfile; formatting/lint; TypeScript checks; tests; migration validation; dependency and secret scans; production builds; artifacts and test reports. Staging deployment is gated; production requires explicit approval, migration plan and rollback.

## 5. Documentation policy

This repository's docs are the source of truth. Requirements, API contracts, role matrix, domain models, ADRs, deployment instructions and runbooks must change in the same PR as affected code. Record unresolved questions rather than making silent assumptions.

## 6. Phase verification

Every phase ends with an implementation summary, exact commit SHA, passing command outputs, integration/E2E evidence, remaining risks and approval. A design-only milestone cannot be called production-ready.
