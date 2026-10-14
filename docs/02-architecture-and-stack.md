# Architecture and technology stack

**Status:** Approved technical architecture baseline. Provider-specific contracts and deployment region are subject to verification.

## 1. Architecture decision

Use a TypeScript modular monolith, independently deployed frontend apps, one API, one background worker and PostgreSQL as the transactional source of truth. Domain modules expose typed contracts and transactional boundaries. Durable jobs and outbox events coordinate asynchronous external effects.

```text
Patient Web      Operations Web      Field PWA      (Later: Lab Portal)
      \                |                 /
                   HTTPS / API
               AuthN / AuthZ / validation
                   NestJS API
  Identity | Patients | Catalogue | Orders | Scheduling
  Dispatch | Specimens | Labs | Results | Finance
  Notifications | Support | Audit
             PostgreSQL + Outbox
                  Worker(s)
      Email | Payments | WhatsApp | Storage | Maps
```

## 2. Approved stack

| Layer | Selected technology | Role |
| --- | --- | --- |
| Language | TypeScript strict mode | Shared types and services |
| Monorepo | pnpm, Turborepo | Dependency graph and task orchestration |
| Web applications | Next.js, React | Patient and operations UIs |
| Field application | Next.js progressive web app | Mobile-first collector/courier workflow |
| UI | Tailwind CSS, shadcn/ui, Radix primitives | Accessible component foundation |
| API | NestJS | Modular HTTP services, validation and policies |
| Data | PostgreSQL | ACID transactional records |
| ORM/migrations | Drizzle ORM | Typed queries and versioned migrations |
| Identity | OIDC-compatible provider | Session/token identity; server-side authorization remains in API |
| Async | PostgreSQL-backed durable jobs and transactional outbox | Notifications, retries, reconciliation |
| Files | Private S3-compatible object storage | Result documents and protected uploads |
| Payments | Paystack adapter (commercial verification required) | Checkout, verification and refunds |
| Email | Transactional email adapter | Verification, booking and secure result delivery |
| Messaging | WhatsApp Business adapter | Assisted intake and transactional communication |
| Telemetry | OpenTelemetry, Sentry, structured logging | Traces, errors and health |
| Testing | Vitest, Playwright | Unit, integration, contract and E2E |
| Runtime/deployment | Docker, GitHub Actions | Reproducible builds and controlled release |

## 3. Repository layout

```text
apps/
  patient-web/
  operations-web/
  field-pwa/
  api/
  worker/
packages/
  ui/
  design-tokens/
  contracts/
  database/
  auth/
  config/
  testing/
  observability/
infrastructure/
  docker/
  migrations/
  monitoring/
docs/
  architecture/
  operations/
  adr/
scripts/
.github/workflows/
```

The structure above is a target for Phase 1, not an assertion that the directories exist.

## 4. Domain module rules

- Each module owns its entities, business services, state machine and public application interface.
- HTTP handlers are thin; all permissions and business invariants are checked in application/domain services.
- Database writes requiring consistency share transactions; events for external delivery use a transactional outbox.
- Worker handlers are idempotent; retry with bounded backoff and a dead-letter/exception mechanism.
- External integrations live behind adapters and have sandbox implementations.
- Version API routes under `/api/v1`; generate OpenAPI from runtime-validated contracts.
- Use UTC timestamps in storage, Lagos local time for presentation and scheduling rules.
- Monetary amounts are integer minor units, with explicit currency and immutable quoted totals.
- Avoid placing protected health information in logs, analytics, URLs, error telemetry or third-party tracking.

## 5. Deployment topology

Separate development, staging and production environments; isolated secrets and databases; HTTPS-only public entry; private PostgreSQL and storage; API/worker runtime; monitored job queues; restricted administrative access; encrypted backups with restoration drills. Production hosting region, data residency, vendor agreements, cost and recovery objectives require documented sign-off.

## 6. Reliability patterns

Idempotency keys for order/payment creation; database uniqueness constraints for provider events; optimistic concurrency for scheduling; guarded state transitions; outbox for notifications; webhook signature validation and replay protection; retryable worker tasks with permanent-failure queues; per-integration timeouts and circuit-breaker behavior where warranted.

## 7. Evolution

Partner laboratory self-service will reuse the existing lab domain and scoped API contracts. New frontends must not bypass central policy checks or access the database directly.
