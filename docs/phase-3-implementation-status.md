# Fisher Healthcare — Phase 3 Engineering Status

**Phase:** Dispatch, Collection and Custody — IN DEVELOPMENT  
**Source branch:** `feat/phase3-dispatch-collection-custody`  
**Acceptance:** OPEN. Source committed; consolidated exact-commit local verification not yet executed.  
**Production:** NOT APPROVED. Synthetic test identities and disposable PostgreSQL only.

## Implemented source increments

- Paid-only dispatch queue and assignments, with active collector/courier shift-and-zone checks, locked overlapping-worker capacity checks, and negative synthetic eligibility tests.
- Assigned collector access, immutable barcode-label checks required before collection, versioned specimen custody, append-only events and replay-safe receipts.
- Courier handoff offers with frozen specimen versions, authenticated receiving courier acknowledgement, atomic custody progression, replay defense, and a recipient-scoped page requiring individual physical specimen-ID reconciliation.
- Collector/courier incident reports, idempotent event IDs, supervisor resolution audit, and unresolved-incident custody blocks.
- Internal lab manifests, laboratory-specific receiving grants, full specimen reconciliation, rejection reasons, audit and receipt idempotency.
- Two-person administrator request/approval/rejection for internal laboratory staff grants, with reason-coded denial, current grant listings, revocation, and an access-controlled administration interface.
- Phase 3 API methods fail closed outside explicit synthetic-only execution on a loopback `fisher_test` database and refuse production mode.
- Synthetic-only encrypted IndexedDB event recovery for at most 25 minimal custody envelopes and up to 24 hours, HMAC-scoped to the current verified field staff identity, no barcodes, patient identity, clinical data or tokens; manual reconciliation and conflict-review controls, with sign-out cleanup. The browser store is an experimental non-production facility and has NOT undergone device/privacy, XSS, loss-of-key, offline/reauth or integration acceptance.
- Operations workbenches for eligible paid-order collector shift selection, incident resolution, manifest preparation, and lab-scoped receipt reconciliation. Same-origin, fixed-route command gateways plus negative CSRF/authorization tests prevent browser-supplied bearer authority.
- Production-gated UI workbenches at `/dispatch` and `/visits`, plus `/visits/[id]` for signed, scoped collection actions. Both staff portals use encrypted, HTTP-only OIDC/PKCE sessions with server-side MFA and capability checks, and now distinguish expired/revoked sessions from API outages. No browser bearer token is exposed.
- Phase 3 additive migrations numbered `0017`–`0025`, database-backed full-flow, lab-receipt, and two-admin lab-onboarding tests authored. Not yet locally executed.

## Step 1 source-hardening continuation

The current Phase 3 branch also includes the following **source-level** corrections.
They have not been accepted by an integrated build or the consolidated verifier:

- Encrypted IndexedDB queue upgraded with authenticated owner/event metadata,
  an owner-scoped unique event fingerprint index, atomic capacity and collision
  enforcement, safe legacy-record migration, and transactional review/removal.
  The store remains strictly synthetic-only; no patient data, diagnostic
  information, credentials, or barcode scans may enter the persisted envelope.
- Manual recovery now excludes concurrent tabs using Web Locks, checks live
  server-side staff authorization, retains original IDs after uncertain
  network results, and distinguishes conflicts from successful receipts.
  Minimal synthetic field events can be durably staged before network submission.
- Staff sign-out now requests browser storage clearance and broadcasts
  cross-tab session invalidation. Both staff layouts redirect stale open tabs,
  and same-origin mutations are bound to the configured staff web origin.
- Laboratory grant approvals are fenced against prior revocations; revoke
  takes serialized laboratory/coordinator locks, and disposable database tests
  cover stale-request refusal plus independently approved fresh requests.
- Fixed field UI imports and offline messages, removed constant-incompatible
  TypeScript role branches, improved administrative error states, enabled
  previously undiscovered library security tests, and expanded the
  dependency-free source-guard specification.

Connector-backed source inspections checked the changed imports and referenced
paths, but **the local source-guard script, full TypeScript/lint/build gates,
PostgreSQL migrations and test suite have not been run**. Browser Web Locks,
IndexedDB privacy guarantees, OIDC/MFA provider outage handling, sign-out
behavior and reauthentication still require disposable integration acceptance.

### Latest additional source controls

- Custody event IDs are now content-bound in the synthetic offline store,
  canonical lowercase UUIDs are required, and server-side offline batch
  validation rejects duplicate event IDs or unexpected properties before
  making any custody mutation.
- Browser recovery distinguishes expired/revoked staff sessions from
  identity-provider outages, retaining encrypted envelopes through temporary
  service failures. Focused negative-path test cases were added.
- Staff HTTP-only `__Host-` cookies now expire with matching Secure,
  Path and other creation attributes during logout and OIDC callback handling.
  Signed MFA presence and failure cases are explicitly covered in API tests.
- The exact-commit Phase 3 verification script now refuses uncommitted
  generated contracts and does not create commits or push a verified HEAD.
  The previous redundant first API build has been removed; the integrated
  Phase 2 verifier owns the single full build/test/database/audit pass.
- Connector-backed static inspection confirmed one Phase 3 SQL migration
  for each version 0017–0025 and no missing relative imports in newly
  added TypeScript files. This is **not** a substitute for running the
  dependency-free preflight or consolidated local acceptance.

### Prepared consolidated acceptance invocation

After engineering review, the repository includes
`scripts/run-phase3-acceptance.sh`. It requires the caller to set the
`FISHER_PHASE3_LOCAL_ACK=synthetic-only` acknowledgment, fetches and pins
the latest Phase 3 remote HEAD, creates a new sibling **detached** worktree,
and runs `scripts/verify-phase3-local.sh` against that exact SHA.

The runner is opt-in and has **not been executed**. It does not reset, stash,
commit, push, merge, or remove an existing working tree. The acceptance script
retains logs in the disposable verification worktree and rejects uncommitted
OpenAPI changes. The full pass still includes controlled disposable database
startup/cleanup; this is not a production release procedure.

## Remaining release engineering

1. **Integrated on Phase 3 branch:** the accepted Phase 2 `main` baseline was preserved in integration commit `65c4f1309c874de3ed71ae59c02b751da767e91f` (not merged back into `main`). Phase 3 exact-commit verification and PR review remain required.
2. Verify the newly authored OIDC/PKCE staff session and operations/field BFF flows against an approved disposable OIDC staging provider. Complete production review, staff account provisioning and MFA expiry/revocation scenarios. No real personal data in client caches.
3. Verify the completed visit progression, label/collection checklist, failed-visit actions, specimen incidents, courier staffing/physical receipt and lab-reconciliation interfaces end to end. Review historical replay safety and user-facing conflict states. The experimental encrypted offline store remains synthetic-only and requires formal device/privacy approval and integration tests before any real-patient enablement.
4. Run the prepared `scripts/verify-phase3-local.sh` as one consolidated exact-commit local verification: Node 22, pnpm 9.15.9, disposable PostgreSQL 16, migrations and rollback checks, all unit/integration/security tests, lint/typecheck/build, regenerated OpenAPI, production/full dependency audits and API/three-web-app smoke tests. GitHub Actions remains unavailable.
5. Complete external clinical, privacy, partner and operations release gates separately. No production or real-patient launch is implied by source completion.

**Phase 3 is not accepted or merge-ready.** Source commits have not passed local lint, typecheck, build, migration or end-to-end gates yet; do not report those tests as passed.
