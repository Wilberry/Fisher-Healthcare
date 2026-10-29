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
