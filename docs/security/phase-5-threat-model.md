# Fisher Healthcare — Phase 5 technical threat-model review

**Scope:** Design review and engineering tests for a synthetic Phase 5 branch.
No clinical use, vendor certification or privacy-law sign-off is implied.

| Trust boundary or asset | Threat scenario | Existing / proposed control | Outstanding verification |
| --- | --- | --- | --- |
| OIDC staff identities | Forged or stale role/MFA claims | Signed JWT with issuer, audience, expiry and MFA verification; live staff-role lookup | Production IdP/rotation integration and privileged access review |
| Patient diagnostic results | Booking authority incorrectly grants report access | Separate result permissions, release-event evidence, audited document access | Independent penetration test, patient and family consent legal review |
| Clinical file storage | Guessable links or report content in email/logs | Private synthetic PDF checksum and protected access; generic availability notices | Approved encrypted object storage, short-lived access and delivery contract |
| Custody and lab receipt | Out-of-order or fabricated specimen handoff | Signed-in scoped field roles, immutable handoff/receipt and manifest checks | Clinically approved SOPs, real-device process drills and personnel verification |
| Payment and lab settlements | Double refund, cross-lab payable or altered decision | Idempotent decisions, paid-payment revalidation and immutable synthetic finance history | Licensed provider integration, independent financial reconciliation |
| Worker and result emails | Stale leases, duplicate sends, revoked recipient consent | Durable leases, bounded retries, recheck of consent and result-release evidence | Verified staging provider callbacks, bounce/failure incident process |
| Operational alerts | PHI leak from monitoring, forged safety approval | Three fixed aggregate signals, admin/MFA authorization, immutable acknowledgment and append-only aggregate transition history, no external paging and unconditionally false pilot-release flags | Duty owners and actual on-call escalation route, alert fatigue and access testing |
| Restore/backups | Stolen backup file, wrong tenant/database restore, unmeasured recovery time | New disposable loopback backup-and-restore probe, ephemeral-key authenticated encryption, tamper detection, cleanup and migration checks | Encryption, KMS role separation, offsite retention, production restore rehearsal with approved RPO/RTO |
| Deployment and configuration | Test gate accidentally enables production clinical operations | `NODE_ENV=production` disables Phase 4/5 synthetic services; pinned acceptance and draft review workflow | Real environment secret/flag policy, reviewed promotion and rollback process |
| Audit and administrative interfaces | Unauthorized alert or incident suppression | Fixed codes, admin role + MFA, audited actions and guarded state transitions | Separate audit-log integrity/retention and independent review |

## Negative scenarios to retain in the automated suite

- Deny missing or forged authentication, stale/disabled staff, and missing MFA.
- Refuse readiness/evaluation outside disposable local `fisher_test`.
- Reject identifiers or patient-level payloads as alert signals.
- Retain acknowledgments on repeated evaluations; reopen resolved alert only
  when its aggregate source returns.
- Deny originless cross-site mutations through operations web proxies.
- Reject direct changes to alert identity, acknowledged reviewer or evidence.
- Ensure no deployment, transfer, clinic visit or outbound paging can be
  initiated by any Phase 5 endpoint.

## Residual risks and sign-off

Operational authorization, Nigerian data-protection compliance, partner
agreements, device/field validation, urgent clinical escalation, production
capacity, threat-model independent assessment, offsite encryption/key custody
and patient-safety review are **open release dependencies**. The Phase 5
engineering record is evidence for reviewers, not approval itself.
