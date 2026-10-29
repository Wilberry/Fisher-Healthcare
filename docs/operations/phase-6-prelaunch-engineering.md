# Phase 6 — Public launch engineering (pre-activation)

Phase 6 in the engineering roadmap covers public Lagos availability and growth. **No public availability, live payment, clinical data processing or provider integration is authorized by this milestone.** Phase 5 synthetic acceptance does not satisfy Phase 6 external release approvals.

## First increment: offline release-readiness inventory

Run `node --test scripts/phase6-readiness-inventory.test.mjs` and
`node scripts/phase6-readiness-inventory.mjs docs/operations/phase-6-readiness-inventory.json`.
The second command exits nonzero while evidence is missing. It accepts internal evidence *references*, never patient details, tokens or approval text. Its report hardcodes release authorization to false regardless of input.

This is an **inventory**, not a signature verifier, deployment gate or live system probe. Editing JSON cannot authorize rollout.

## Engineering workstreams

1. Restricted non-clinical staging and deployment provenance: choose hosting region/operator, network segmentation, TLS/domain, immutable artifact pinning, service accounts and KMS owner.
2. Operational resilience: offsite encrypted backup lifecycle, witnessed restore with approved non-sensitive datasets, agreed recovery objectives, incident owners and escalation.
3. Provider adapters: separately approved identity, payments, email and private storage, with disabled-by-default live feature flags and sandbox contract testing.
4. Launch readiness: service-zone controls, audit-only operational reports, reconciliation accuracy, field training and support escalation, limited supervisor-reviewed pilot.
5. Growth features only after legal/clinical sign-off: convenience booking, bounded lab portal, referrals and zone expansion.

Decisions and externally owned requirements remain open until accountable sign-off. Do not add a deploy action to this script.

## Second increment: restricted staging offline preflight

`node --test scripts/phase6-staging-preflight.test.mjs` checks source contract boundaries. `node scripts/phase6-staging-preflight.mjs docs/operations/phase-6-staging-example.json` validates a synthetic example only.

It requires a full source commit, immutable OCI image digest, staging-only `.test` ingress, private database network, sandbox identity, disabled external notification, disabled payments, disabled clinical workflows, and disabled public ingress. Only internal secret *references* are accepted; neither keys nor secret values belong in Git.

**The example's digest, SHA, operator, region and change ticket are placeholders, not verified artifacts or accepted infrastructure choices.** This validator does not inspect DNS, container registries, firewall rules, network policy, TLS, key custody or actual cloud state. Any successful preflight still returns `deploymentAuthorized=false`, and no deployment action is connected to it.

Before introducing an actual deployment workflow, approve and document the provider/region, account isolation, threat model, private network, role hierarchy, secret manager, artifact signing/provenance, staging DNS/TLS, alert ownership, recovery plan and service costs.

## Third increment: immutable artifact and rollback-plan validation

`node --test scripts/phase6-rollback-preflight.test.mjs` exercises the static validator.
`node scripts/phase6-rollback-preflight.mjs docs/operations/phase-6-rollback-example.json` validates a **placeholder-only example**.

Required: identical pinned source commit and OCI image digest across staging and deployment records; a distinct pinned last-known-compatible image; forward-only reviewed migrations; application-only image rollback; separate manual witnessed database recovery; named incident and rollback owners; referenced backup evidence. The evaluator rejects activation toggles, ambiguous sources, unreviewed automatic restores and unexpected fields.

This is not a real rollback rehearsal, artifact signature verification, backup inspection, or permission to deploy. The placeholders must never be used as operational inputs. Production rollback requires an approved compatibility assessment and accountable human authorization.

## Fourth increment: secrets and monitoring ownership preflight

Run `node --test scripts/phase6-operations-preflight.test.mjs` and
`node scripts/phase6-operations-preflight.mjs docs/operations/phase-6-operations-example.json`.

The offline validator checks that secret references exactly match the staging declaration, that lifecycle rotation/emergency revocation procedures have accountable owners, and that five operational signals have named owners and playbook references. It denies real alert delivery, live provider calls, and unrecognized configuration fields.

**References are not secret values and do not prove a secret manager, alerts, monitoring agents, incident notification channels, or actual rotations exist.** The example is illustrative and unapproved. Independent staging and provider approvals remain required.

## Fifth increment: consolidated offline verification

The exact-commit verifier is `scripts/verify-phase6-offline.sh`. Run it only in a clean detached worktree at the current Phase 6 branch head, using `FISHER_PHASE6_EXPECTED_SHA=<full SHA> FISHER_PHASE6_LOCAL_ACK=offline-synthetic-only bash scripts/verify-phase6-offline.sh`.

It executes the four preflight unit suites, the sample staging/rollback/operations plans, and confirms the default readiness inventory remains blocked. Its JSON output is explicitly **offline static evidence**, not live infrastructure acceptance. Never use the placeholder source/image digests as deployment artifacts. It does not contact cloud providers, run application integration tests, verify secret custody, send monitoring notifications, or grant clinical release. The existing Phase 5 acceptance remains the software baseline.
