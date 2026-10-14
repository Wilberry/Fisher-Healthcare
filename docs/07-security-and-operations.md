# Security, privacy, clinical governance and operations

## 1. Data classes

Public content; internal operational metadata; personal contact/location information; financial records; sensitive patient/clinical records; authentication secrets. Apply least-privilege and retention controls by classification.

## 2. Patient privacy

- Obtain appropriate privacy notices, lawful basis, consent/authorization and vendor agreements before processing real health data.
- Separate patient identity from caregiver account ownership; authorize result access independently.
- Encrypt transport and storage, including private result documents and backups.
- Prefer secure result email delivery or authenticated protected access; avoid exposing medical detail in subject lines, analytics or logs.
- Apply per-resource policies to every API request and background task.
- Log result access and administrative actions; restrict exports and mass downloads.
- Define retention, deletion/archival and breach response with qualified legal/clinical review for Nigeria.
- Do not use real patient records in development, demonstrations or automated testing.

## 3. Clinical and laboratory governance

Clinical professionals approve test suitability, patient preparation, collection instructions, labeling, specimen transport, rejection criteria and incident escalation. Laboratories validate diagnostic results. Define who may release results, how corrections/retractions work, and escalation for urgent findings. A customer-facing logistics service must not imply independent laboratory certification or medical interpretation.

## 4. Technical controls

OIDC-compatible identity, MFA for privileged staff, server-side RBAC/ABAC, session revocation, CSRF protections where cookie auth is used, rate limiting, input validation, webhook signature verification, secure secrets, least-privilege DB credentials, private networks, security headers and vulnerability scanning.

## 5. Operations

Document on-call escalation, specimen incident playbooks, failed collection/refund handling, lab delay escalation, failed result delivery, payment mismatch, service degradation and privacy incidents. Use structured metrics for booking conversion, assignment latency, collection window adherence, specimen rejection, custody gaps, result turnaround, notification failure and settlement reconciliation.

## 6. Reliability and recovery

Health/readiness endpoints, error budgets to be agreed, monitored job queues, dead-letter handling, idempotent replay, encrypted backups, documented RPO/RTO, periodic restore tests, disaster recovery exercise and rollback procedures. Staging must use synthetic data and sandbox integrations.

## 7. Release security gate

Threat model reviewed; access-control tests pass; critical findings remediated; incident contacts assigned; clinical SOPs signed; regulatory obligations reviewed by qualified advisers; backups restored successfully; data-processing vendors approved.
