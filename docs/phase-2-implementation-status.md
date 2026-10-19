# Fisher Healthcare — Phase 2 Implementation & Acceptance

**Engineering milestone: COMPLETED — merged to `main` (19 October 2026).**

**Accepted integration commit:** `bec33a3bae4e0c12eb160c75f388ac672e7aa357`.

**Main merge commit:** `82f025d582d976cc8f6c04818351ce1a47aa8996` via [merged PR #1](https://github.com/Wilberry/Fisher-Healthcare/pull/1).

**Next engineering milestone:** [Phase 3 — Dispatch, Collection and Custody](06-development-roadmap.md#phase-3--dispatch-collection-and-custody), in progress; not yet verified or merged.

**Release boundary:** Local acceptance covers synthetic booking/payment implementations. Production, real patient/clinical data, live payments and external integration acceptance are not authorized by this milestone.

## Complete source implementation areas

| Area | Current source capability |
| --- | --- |
| Public customer discovery | Reviewed/inactive-by-default test, laboratory and offering catalogue; published preparation instructions; Lagos service-zone list; dynamic Regular/Premium quote calculation |
| Collection capacity | Time-boxed quotes, PostgreSQL slot locks and holds, one order per draft, deterministic lock order, slot expiry checks, versioned user consent |
| Patient identity | Server-side OIDC authorization-code PKCE, signed ID/access JWT validation, authenticated HttpOnly encrypted session, no browser bearer-token exposure |
| Family booking authority | Pending self/dependent/caregiver requests, independent staff MFA approval, booking-only authorization, user-initiated revocation, distinct clinical result permission |
| Collection location | Per-patient pending addresses, independent staffed zone/coverage approval, preserved booking location snapshot |
| Staging payment | Paystack test-key only, allowlisted synthetic payers, server-verified currency/amount/reference/test domain, raw-body HMAC webhook, idempotent ledger/outbox, provider reconciliation, late-payment exception |
| Booking account | Authorized dashboard, booking details, unpaid cancellation/rescheduling, provider status action, test-mode receipt, event-intent statuses |
| Guest-assisted intake | PostgreSQL per-minute IP-hash throttle, explicit booking-policy consent, approved synthetic email-only challenge, hashed 8-digit OTP, expiry, per-mailbox throttling and attempt limit, staff queue; does not grant patient access or reserve a slot |
| Notifications | PostgreSQL outbox creates idempotent email intent; fenced sender to Resend staging allowlist with provider idempotency, bounded retry, receipt acceptance and no clinical content |
| Customer support | Signed-in idempotent cases, email/WhatsApp response preference without claiming vendor delivery, durable staff queue and auditable resolution |
| Internal catalogue & finance | Separate staff-MFA catalogue author/reviewer, inactive-by-default slots and fees; staff support and payment-exception queues; no automated refunds |
| Governance | Opaque reviewed evidence references, append-only audits, versioned synthetic policy acknowledgment; releases and clinical records are out of Phase 2 |
| Tests | Synthetic PostgreSQL fixtures cover shared API rate-limits, concurrent holds, authorization, consent, payment replay, late payment, guest OTP, email receipts, staff separation, support idempotency and catalogue approval |
| Reproducibility | One resource-conscious pinned verifier `scripts/verify-phase2-local.sh` using one disposable loopback PostgreSQL instance, sequential builds/tests, OpenAPI and dependency audits |

## System constraints

All Phase 2 booking/profile/address/catalogue/support/guest operations require `FISHER_PHASE2_BOOKING_MODE=synthetic` and **never** run with `NODE_ENV=production`. Paystack additionally requires `FISHER_PHASE2_PAYMENT_MODE=staging` and a test key starting `sk_test_`. Email requires `FISHER_PHASE2_EMAIL_MODE=staging`, a verified Resend sender and explicit allowed test mailboxes. No live charging, real patient data or clinical results are permitted.

Booking rights (`can_book`) and clinical rights (`can_view_results`) are never conflated. No patient identity or permission is inferred from a guest email or the browser redirect from Paystack.

Resend `sent` means the provider returned an acceptance identifier; it does not prove inbox delivery. WhatsApp is a **preference only** until a separately approved provider, opt-in and delivery-audit path exists. Guest intake is a **staff-assisted request**, not a confirmed booking.

## Local engineering acceptance evidence

The merged integration commit `bec33a3bae4e0c12eb160c75f388ac672e7aa357` passed the clean, pinned, one-pass local verifier in synthetic mode on 19 October 2026. The recorded final summary reported `Result: PASS`, `Final acceptance: PASS`, a committed lockfile, both production and full dependency security audits passing, and no pending worktree changes. Verification covered installation, Next.js lint-guard tests, all 11 workspace lint tasks, TypeScript, production builds, disposable PostgreSQL migrations/rollback/authorization checks, workspace tests, OpenAPI generation, and API and three interface smoke checks.

The merged dependency lockfile and OpenAPI snapshot were regenerated and reviewed against both Phase 1 and Phase 2 operations during integration; the generated OpenAPI retained all 55 operations. GitHub Actions were unavailable due to billing; this acceptance relies on documented local verification rather than hosted CI.

**Engineering completion does not authorize clinical launch or live service.**

## Outstanding external staging and production gates

1. Confirm real signed OIDC staging identity-provider integration with registered callback, JWKS/audience, MFA claims and approved test users; exercise PKCE, cookie security, login/logout and guardian revocation.
2. Validate separately approved Paystack **sandbox** callbacks/test accounts and Resend verified staging domain/test recipients, provider idempotency and operational telemetry; do not commit credentials.
3. Obtain business, clinical, legal and privacy approvals for laboratory partners, diagnostics catalogue/preparation, real service zones and prices, guardianship, patient consent, cancellations/refunds and Nigerian regulatory obligations.
4. Approve operational handoff, staff training, incident and exception handling, backups/restore, monitoring, and any future opt-in WhatsApp integration. No real patient data or live payment processing before these gates.

## Final local verification

The accepted source workflow is `scripts/verify-phase2-local.sh` with `FISHER_PHASE2_LOCAL_ACK=synthetic-only`, `FISHER_PHASE2_ACCEPTANCE_ACK=exact-commit`, and `FISHER_EXPECTED_COMMIT` pinned to the integrated SHA. Evidence was collected under `.verification/phase2-*/summary.txt` in the isolated local integration worktree.

Future changes to the accepted source must pass new exact-commit verification. Phase 3 acceptance is tracked separately.
