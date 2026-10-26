# Phase 5 — Controlled-pilot operational gates

The Phase 5 technical implementation prepares engineering evidence **without activating a real clinical service**.

## Approval boundary

The internal readiness snapshot always reports `pilotActivationAuthorized=false` and `productionReleaseAuthorized=false`. It has no write endpoint, override flag, rollout command, or approval-signing API. The feature requires administrator role, current staff permissions, MFA and an explicit local `fisher_test` database. It reports **only aggregate counts**, not patient, specimen or payment identifiers. Disable it outside disposable synthetic testing.

A real Lagos pilot requires separately reviewed and recorded approvals from qualified people and organizations. A successful software acceptance run, or even zero outstanding incidents, **must never be interpreted as clinical or legal authorization**.

## Non-technical gates owned by accountable professionals

| Gate | Required evidence | Responsible authority |
| --- | --- | --- |
| Clinical collection and transport | Signed collection, labeling, transport, urgent-findings and escalation SOPs | Clinical lead and partner laboratories |
| Results validation and release | Independent laboratory result validation, correction/retraction and consent processes | Accredited/authorized laboratory and clinical governance |
| Nigerian privacy | Approved lawful basis, data flows, privacy notices, retention/deletion rules, incident handling and processing/vendor contracts | Nigerian qualified privacy/legal counsel and privacy lead |
| Partners and operations | Executed laboratory contracts, verified personnel, Lagos zone and service rules | Business/operations and laboratories |
| Provider integrations | Authorized identity, payments, private storage and outbound notification contracts; no test secrets | Security and infrastructure leads |
| Recovery and incident handling | Encrypted offsite production backups, witnessed restore rehearsal with authorized synthetic or non-sensitive data, response escalation | Infrastructure, security and incident leads |
| Pilot supervision | Named on-call owners, measured KPIs, stop/rollback criteria and sign-off | Responsible business and clinical leadership |

Open items remain tracked in `docs/10-decisions-and-open-items.md`. No dates, clinical outcomes, prices, provider contracts or permissions should be assumed.

## Synthetic alert triage and acknowledgment

Phase 5 records three closed, aggregate-only signals:
`custody_incidents` (open incident count), `outbox_dead_letters`
(dead-letter queue count), and `result_email_failures` (failed result
notification count). An administrator with current MFA and `audit:read`
must explicitly request evaluation. The alert lifecycle is
`open → acknowledged → resolved`; a returning condition reopens a resolved
alert, and an acknowledgment is idempotent only for the same actor.

The operations dashboard permits evaluation and acknowledgment only through
same-origin authenticated API proxies. No arbitrary free-text clinical notes,
patient identifiers, specimen references, external paging or pilot-activation
commands are accepted. An acknowledgment means that the incident has been
noticed and assigned for investigation, **not** that it is safe or closed.
Automatic resolution means that the aggregate count has reached zero; it is
not clinical sign-off.

See [Phase 5 synthetic incident response](phase-5-incident-response.md)
for owner routing, evidence preservation, containment and verification steps.

## Synthetic observability baseline

The administrator-only `GET /api/v1/ops/pilot-readiness/snapshot` exposes non-sensitive counts for unresolved specimen incidents, unprocessed/dead-letter outbox entries, pending result release, pending/failed result notifications, and pending financial reviews. Unavailable database measurements fail closed; no result content or patient identifiers are included.

Classification `attention_required` indicates at least one unresolved incident, dead letter or failed result notification. `observed` does **not** mean safe for clinical release. Pending tasks are workload, not necessarily failures. Operational thresholds, paging rules and emergency rollback authority require explicit approval before pilot.

## Disposable database recovery proof

Run `FISHER_PHASE5_RESTORE_ACK=new-disposable-only bash scripts/phase5-disposable-restore-drill.sh` in a reviewed source checkout. This script:
1. Starts one uniquely named PostgreSQL 16 container with a loopback-only port and an entirely new `fisher_test` database.
2. Applies and checks migrations; inserts one synthetic marker with no PHI.
3. Streams a binary backup through ephemeral-key AES-256-GCM authenticated
   encryption. Only the encrypted temporary archive reaches disk. The archive
   is decrypted directly into a distinct `fisher_restore_test` database in
   the same disposable container, with an authenticated-tag integrity check.
4. Compares marker, migration registry count and migration checksums, records an evidence summary, then removes the encrypted temporary backup and only its own container.

**It does not test production backups, encryption keys, multi-region failover, disaster-recovery timing or real patient data.** Those require separately approved infrastructure and controlled evidence. The script never connects to an existing database or Docker Compose service.

## Bounded synthetic failure and latency baseline

The optional `scripts/phase5-local-probe.mjs` requires
`FISHER_PHASE5_LOAD_ACK=synthetic-loopback` and rejects non-loopback targets,
credentials, query strings and URL fragments. It issues at most 40 bounded
GET requests to health (expected 200) and the protected readiness route
(expected 401 without a token), recording only the status distribution and
p95/max latency. It does not send patient data or mutate application state.

The observations are **not** an agreed clinical or production SLA and do not
cover sustained load, external providers, edge routing or incident response.
Formal SLO targets and stress/load profiles must be approved separately.

## Exact-commit Phase 5 acceptance

From the Phase 5 branch checkout, run:

```bash
FISHER_PHASE5_LOCAL_ACK=synthetic-only bash scripts/run-phase5-acceptance.sh
```

It prepares a detached verification worktree, runs the existing full local quality/security/migrations/API UI checks with the new unit and integration tests, runs the disposable recovery drill, and checks the new API/dashboard denied-access smoke. `main` is not modified, the PR is not merged, and no pilot is activated.

A clean Phase 5 synthetic acceptance is only one prerequisite in the independent release authorization programme.
