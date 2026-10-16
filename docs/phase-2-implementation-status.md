# Fisher Healthcare — Phase 2 Engineering Status

**Branch:** `feat/phase2-patient-booking-payment`
**Foundation checkpoint:** `c131c514f1a9c08578ae84b821c9c1a6b87b3d4b`
**State:** Implementation in progress; **Phase 2 acceptance OPEN**; **Phase 1 acceptance OPEN**.

This branch deliberately stays separate from Phase 1 verification. It must not be merged, deployed publicly, or populated with real patients, medical or payment data.

## Implemented in the Phase 2 branch
- PostgreSQL additive migrations `0004`–`0007` for zones, slots, immutable quotes, holds, drafts, checkout idempotency, reservations, schedule history, provider events, notification intents and manual payment review.
- Public patient site: active test/lab catalogue, test details, coarse zones, availability search, Regular/Premium provisional quote planner.
- NestJS APIs: active catalogue, labs, zones, slot availability, immutable quote, authenticated booking draft/hold/commit, history, timeline projection, unpaid cancellation/rescheduling, authorized receipts, payment status.
- Patient enrolment requests, listed profiles and current relationship checks; profile creation grants **no** booking or results authority.
- Paystack **test-key staging only** initialization, signed raw-body webhook, independent Paystack verification, single ledger posting, replay handling and late-payment exception; no live charging.
- Worker creates durable pending email notification intents and operations payment-review alerts. It does not claim a message was sent, and no email/WhatsApp provider is active.
- Synthetic integration test source and one consolidated local verifier.

## Current activation controls
- Zones, tests, laboratories, offerings and slots remain inactive by default in the foundation schema.
- Booking mutations require `FISHER_PHASE2_BOOKING_MODE=synthetic` with a non-production runtime.
- Paystack checkout/webhook additionally requires `FISHER_PHASE2_PAYMENT_MODE=staging` and a `sk_test_` Paystack key, and refuses production runtime.
- Patient-web fetches a server-configured `FISHER_API_SERVER_URL`; absent integration returns an accurate unavailable state.
- Unconfigured OIDC denies all protected patient routes.
- No real checkout, clinical result downloads, live email delivery, or production patient onboarding are authorized.

## Planned endpoints implemented
**Public:** `GET /catalog/tests`, `GET /catalog/tests/:id`, `GET /catalog/labs`, `GET /service-zones`, `POST /availability/search`, `POST /quotes`, `GET /quotes/:id`.

**Patient bearer-authenticated:** `GET/POST /patients`, `GET /patients/:id`, `POST /booking-drafts`, `POST /bookings` with `Idempotency-Key`, `GET /me/bookings`, `GET /me/notifications`, `GET /bookings/:id`, `GET /bookings/:id/timeline`, `POST /bookings/:id/cancel`, `POST /bookings/:id/reschedule` with `Idempotency-Key`, `GET /bookings/:id/receipt`, `POST /payments/checkout`, `GET /payments/:id`.

**Paystack:** `POST /webhooks/payments/paystack`, requires signed original raw bytes and server-to-server verification.

## Verification
Use only `scripts/verify-phase2-local.sh` for the end-of-engineering checkpoint. It reuses the Phase 1 resource-conscious one-pass verification design: Node 22/pnpm 9.15.9, one isolated PostgreSQL 16 container, strictly synthetic records, sequential builds, migration apply/check/rollback, tests, OpenAPI generation, production and full audits, then API/web smoke tests. It does not stop unrelated Docker services. It accepts optional `FISHER_EXPECTED_COMMIT` and records evidence in `.verification/phase2-*/summary.txt`.

**No local commands or disposable PostgreSQL tests have been executed from this chat.** Source commits are not passing test evidence.

## Engineering work remaining before Phase 2 acceptance
1. Fix all exact-commit lint, TypeScript, migration, unit, PostgreSQL concurrency, API, UI and dependency findings from the consolidated local run.
2. Establish verified OIDC account provisioning, secure session transfer to the patient web, safe self/family identity linking, reviewed guardian/caregiver proof and revocation UX.
3. Complete guest contact verification, accessible checkout UX, durable provider checkout recovery, failed-payment/late-payment/cancellation policy and Paystack staging integration with real signed sandbox evidence.
4. Finalize operationally approved catalogue preparation information, Lagos zoning, price/fee policy, reschedule/refund rules, backend rate limits, address handling, consent and notification privacy rules.
5. Integrate a vetted email provider with idempotent delivery evidence, opt-in WhatsApp-assisted intake, support flows, controlled delivery retries and audited status.
6. Complete real signed-session patient account dashboard, booking details, family management, transactional confirmation and receipt E2E. Result-document release is Phase 4, not a Phase 2 bypass.
7. Generate/review reproducible lockfile, OpenAPI snapshot, migration/capacity security tests and exact-commit verification evidence.
8. Reconcile any Phase 1 fixes with this branch only after Phase 1 is accepted; finish a reviewed draft PR, with no automatic merge.

A successful compilation alone does not close the acceptance gate.
