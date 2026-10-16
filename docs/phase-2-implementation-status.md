# Phase 2 — Patient booking and payment

**Branch:** \`feat/phase2-patient-booking-payment\`

**Status:** Development in progress. Phase 1 acceptance remains open; this branch is isolated and must not be merged or used for real patient/payment data until all required gates pass.

## Scope
Catalogue, approved service zones and lab offerings, patient/caregiver authorization, quotes, slot holds, booking commitment, provider-verified payments, booking history, and safe notifications. See [development roadmap](06-development-roadmap.md).

## Security and commercial constraints
- Service zones, laboratory menus and slots are disabled by default. Never invent production clinical content, service price, coverage or availability.
- Hold capacity under a PostgreSQL slot row lock. Count active holds and outstanding payment reservations while locked. Expired holds cannot reserve a place.
- Booking authority is distinct from results authority. Family registration is not an automatic grant to see results.
- A payment callback alone never authorizes a medical appointment. Verify signature, payment reference, currency and amount server-side and transition atomically.
- Protect real checkout behind explicit provider configuration and an activation gate. Use synthetic test fixtures only.
- Guest discovery/quotes may be public; order confirmation is restricted to verified authenticated relationships until a secure guest identity-link process is approved.
- Any late payment is recorded for manual resolution, never used to oversell a slot.

## Phase 2 acceptance
Pinned full-workspace install, lint, typecheck, builds, SQL migrations and rollback, unit + isolated PostgreSQL concurrency tests, OpenAPI review, web smoke, HMAC and provider verification negative tests, duplicate webhook/idempotency tests, access and expired quote/hold tests, dependency audit. GitHub Actions is not an acceptance gate while billing prevents it. One consolidated local verifier is planned after engineering completion.
