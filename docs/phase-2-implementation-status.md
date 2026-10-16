# Fisher Healthcare — Phase 2 Implementation & Acceptance

**Working branch:** `feat/phase2-patient-booking-payment`

**Pull request:** [Draft PR #1](https://github.com/Wilberry/Fisher-Healthcare/pull/1)

**Phase 1:** independent verification remains a prerequisite.

**Phase 2:** synthetic feature implementation assembled; **local exact-commit acceptance OPEN**. No production or live-patient rollout authorized.

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
| Guest-assisted intake | Explicit booking-policy consent, approved synthetic email-only challenge, hashed 8-digit OTP, expiry, per-mailbox throttling and attempt limit, staff queue; does not grant patient access or reserve a slot |
| Notifications | PostgreSQL outbox creates idempotent email intent; fenced sender to Resend staging allowlist with provider idempotency, bounded retry, receipt acceptance and no clinical content |
| Customer support | Signed-in idempotent cases, email/WhatsApp response preference without claiming vendor delivery, durable staff queue and auditable resolution |
| Internal catalogue & finance | Separate staff-MFA catalogue author/reviewer, inactive-by-default slots and fees; staff support and payment-exception queues; no automated refunds |
| Governance | Opaque reviewed evidence references, append-only audits, versioned synthetic policy acknowledgment; releases and clinical records are out of Phase 2 |
| Tests | Synthetic PostgreSQL fixtures cover concurrent holds, authorization, consent, payment replay, late payment, guest OTP, email receipts, staff separation, support idempotency and catalogue approval |
| Reproducibility | One resource-conscious pinned verifier `scripts/verify-phase2-local.sh` using one disposable loopback PostgreSQL instance, sequential builds/tests, OpenAPI and dependency audits |

## System constraints

All Phase 2 booking/profile/address/catalogue/support/guest operations require `FISHER_PHASE2_BOOKING_MODE=synthetic` and **never** run with `NODE_ENV=production`. Paystack additionally requires `FISHER_PHASE2_PAYMENT_MODE=staging` and a test key starting `sk_test_`. Email requires `FISHER_PHASE2_EMAIL_MODE=staging`, a verified Resend sender and explicit allowed test mailboxes. No live charging, real patient data or clinical results are permitted.

Booking rights (`can_book`) and clinical rights (`can_view_results`) are never conflated. No patient identity or permission is inferred from a guest email or the browser redirect from Paystack.

Resend `sent` means the provider returned an acceptance identifier; it does not prove inbox delivery. WhatsApp is a **preference only** until a separately approved provider, opt-in and delivery-audit path exists. Guest intake is a **staff-assisted request**, not a confirmed booking.

## Gates that still require real evidence

1. **Exact pinned local one-pass verification** under Node 22, pnpm 9.15.9 and one disposable PostgreSQL 16, including migrations 0000–0015, lint/typecheck/build, unit/integration tests, signed HTTP negative cases, APIs, frontends, audits and OpenAPI. Fix any failures before acceptance.
2. **Reproducible lockfile and generated OpenAPI snapshot** reviewed and committed at the tested SHA. Source code without these artifacts is diagnostic only.
3. **OIDC staging provider** configured with registered callback, issuer/JWKS/audience, signed MFA claims and verified patient contact email. Validate PKCE, cookie handling, login/logout and guardian revocation with real signed staging tokens.
4. **External staging integration**: separately approved Paystack sandbox account/test recipients and signed callback, approved Resend domain/test inboxes, email idempotency window and operational telemetry. Do not put API keys in Git.
5. **Business / clinical / legal approvals**: diagnostics catalogue and preparation guidance, approved lab partnerships, real Lagos coverage and prices, proof of guardianship and address, patient privacy/consent text, cancellation/refund policy and regulatory readiness.
6. **Operations handoff**: documented staff training, response SLA, charge exceptions/refunds, legitimate consent review, monitoring, backups and manual incident response. Provider-backed WhatsApp requires separate explicit opt-in and review if requested for production.
7. **Phase 1 acceptance and integration**: reconcile any verified Phase 1 changes into Phase 2 and repeat the exact-commit verification before merge. No automatic PR merge or production deploy.

The latest code is **not claimed tested or production-ready**. The final consolidated Bash is prepared for independent local execution when source changes are frozen.

## Final local verification

Run only from a clean local detached or exact-commit worktree; do not run this against real patient, payment or production services.

```bash
FISHER_PHASE2_LOCAL_ACK=synthetic-only \\
FISHER_EXPECTED_COMMIT=<verified-phase-2-head-sha> \\
bash scripts/verify-phase2-local.sh
```

The script refuses unexpected worktree changes or the wrong pinned commit, starts one disposable PostgreSQL container on loopback, does not stop unrelated containers, and writes scoped evidence into `.verification/phase2-*/summary.txt`. No successful local verification evidence is available from this chat.
