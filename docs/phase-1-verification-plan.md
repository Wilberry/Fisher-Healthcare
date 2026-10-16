# Fisher Healthcare — Phase 1 Engineering Verification and Acceptance

**Test execution:** Local workstation only  
**Automated GitHub Actions:** Suspended because the account's billing restrictions prevent use  
**Acceptance gate:** OPEN pending results

## Verification coverage

The approved Phase 1 engineering gate requires one exact-commit, reproducible local run validating:

| Gate | Evidence required |
| --- | --- |
| Workspace reproducibility | Committed pnpm lockfile and frozen dependency installation |
| Source quality | Lint and strict TypeScript checks across the full monorepo |
| Application packaging | Successful production builds of patient, operations, field, API and worker |
| PostgreSQL | Reviewed forward migrations, checksummed history, constraint checks and rollback test |
| Identity and permissions | Valid/invalid JWT checks, cross-patient denial, revoked grants, employee MFA and clinical segregation |
| Worker and durability | Concurrent claims, lease expiry, stale-worker fencing, retries and dead-letter handling |
| Contracts | Generated API specification and strict schema tests |
| Security and operations | Dependency audit, protected data handling and safe structured logs |
| Runtime readiness | Loopback API health/authentication smoke tests and individual frontend smoke tests |
| Governance | Exact commit, local logs, inspected changes and recorded acceptance decision |

## Single execution entry point

The company's local verification entry point is:

```bash
FISHER_PHASE1_LOCAL_ACK=synthetic-only bash scripts/verify-phase1-local.sh
```

Prerequisites, branch checkout, logging, rollback testing, data isolation and generated artifacts are defined in the [Local Verification Procedure](operations/phase-1-local-verification.md).

A missing lockfile is a known initial blocker. The verifier can generate it for review, but Phase 1 acceptance requires committing it and rerunning verification on the updated exact commit.

## Evidence and results

Local logs are stored under `.verification/`, excluded from source control. The final review will record the tested commit SHA, package-manager version, PostgreSQL image, migration checksums, test results, build and smoke outcomes, vulnerability review, and any remaining exceptions.

No clinical or customer data may be used to pass an engineering acceptance gate. No unfinished Phase 2 or later functionality may be presented as operational.

**A phase can be accepted only after the local tests have actually run and passed.**
