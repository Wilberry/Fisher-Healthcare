# Fisher Healthcare — Phase 1 Engineering Acceptance

## Subsequent security remediation — 18 October 2026

The original Phase 1 engineering acceptance decision and its audit exception below are preserved as historical evidence. **The specific high-severity GHSA-vfj7-8cjw-p6xm finding has since been remediated at locally verified commit `3f65f647bbf6f92af994ff67e8f9aec1138dc1a8`.** A root pnpm override replaces `braces@3.0.3` with `@franciscosolis/braces@3.1.1`; the committed lockfile contains the fork and no original vulnerable snapshot.

The frozen-lockfile installation, lint, typecheck, build, workspace tests, OpenAPI, HTTP smoke checks, disposable PostgreSQL migrations, and database checks passed. Both production and complete high-severity audits passed (production: 6 moderate, 1 low; full: 7 moderate, 1 low). The Next.js lint policies and strict audit commands remain in place. The verification is local and the remediation branch must still be pushed and integrated. Production/live patient-data approval remains **NOT APPROVED**. See [Dependency Security Remediation](../security/phase-1-dependency-remediation.md).

**Decision date:** 16 October 2026  
**Decision:** **PASS — Phase 1 engineering foundation accepted with a documented development-dependency security exception**  
**Decision authority:** Project owner direction in the development conversation ("then lets mark it as pass"). This records an engineering-phase acceptance decision, **not** an independently performed professional security assessment or production-release authorization.

## Immutable verification baseline

- Repository: `Wilberry/Fisher-Healthcare`
- Verified branch: `feat/phase1-local-verification-hardening`
- **Verified source commit:** `a504bee8d858712a8ada350a9792a87d23ecbb9a`
- Developer-machine verification directory: `.verification/phase1-20261016-215109/`
- Evidence was executed locally; GitHub Actions could not run because of billing restrictions.
- The exact source revision contained the **committed pnpm lockfile, generated OpenAPI contract, and reviewed Next.js-generated configuration**.
- The developer reported a **clean Git worktree** at the end of this run.

## Reported check results at the immutable baseline

| Gate | Actual verifier outcome |
| --- | --- |
| Frozen dependency installation | **PASS** |
| Workspace lint | **PASS** |
| TypeScript type checking | **PASS** |
| Production builds | **PASS** |
| Generated OpenAPI specification | **PASS** |
| Local API and three frontend HTTP smoke tests | **PASS** |
| Synthetic disposable PostgreSQL migrations and database verification | **PASS** |
| Complete workspace automated test suites | **PASS** |
| `pnpm audit --prod --audit-level high` | **PASS** |
| `pnpm audit --audit-level high` | **FAIL** |
| Overall `scripts/verify-phase1-local.sh` process | **FAIL**, due to the full audit security gate |

The full audit found **9 advisories (1 high, 7 moderate, 1 low)**. Its only reported high-severity finding was `GHSA-vfj7-8cjw-p6xm` in `braces@3.0.3`, reached via the **Next.js ESLint development-only dependency chain**: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. Upstream reports no patched version at this checkpoint. The other eight lower-severity findings remain in the audit evidence and are not asserted to have been remediated.

## Explicit scoped exception and rationale

The owner has directed that the **Phase 1 engineering milestone be marked passed** despite the single unresolved **high-severity development-only** dependency advisory. This is a **scoped project milestone risk decision**, not a change to the real audit result:

- The affected toolchain is used during lint/development; it is **not part of the production-only dependency audit's high-severity findings**. No confirmed user-controlled exploit path has been shown in the provided evidence. Absence of a demonstrated exploit is **not proof of non-exploitability**.
- The original Next.js lint checks remain enabled. No advisory is ignored, versions are not spoofed, and severity thresholds are not lowered.
- `scripts/verify-phase1-local.sh` **must continue to exit nonzero** while the full audit returns a failing result. The documentation is the exception record; it is **not a false PASS in the audit logs**.
- The engineering milestone is therefore **PASS WITH DOCUMENTED EXCEPTION**. The complete dependency security audit is **FAIL / remediation open**.
- `braces` remains tracked at [GitHub Issue #2](https://github.com/Wilberry/Fisher-Healthcare/issues/2). That issue **must stay open** until verified remediation or an explicitly reviewed security disposition.
- Any additional high/critical production finding, new advisory, meaningful dependency change, or changed exploitability evidence invalidates the assumptions underlying this exception and requires a new review.

## Boundaries of acceptance

**Accepted:** Phase 1 source foundation, security-control scaffolding, synthetic-only authorization checks, data/migration foundation, build/test tooling and API contracts sufficient to continue Phase 2 engineering.

**Not accepted:** live clinical services, processing actual patient data, production identity-provider credentials, real laboratory integrations, payment settlement, live booking, final clinical/security governance, a complete successful full-dependency security audit, or deployment to production.

Phase 1 engineering acceptance **does not authorize a merge or deployment without applicable independent repository/release checks**. Clinical, privacy, operational, and production readiness remain separate gates.

## Follow-up obligations

1. Retain the original local security logs (production and full audit) and the exact pinned SHA in the evidence record.
2. Track an upstream fix or audited equivalent Next.js lint toolchain retaining `next/core-web-vitals` and `next/typescript` coverage; do not trade away rules simply to clear the audit.
3. Review the reported 7 moderate and 1 low advisories with deployment context before any production approval.
4. Revisit this exception **before any production deployment**, and whenever the affected toolchain/advisory changes.
5. Repeat frozen-lockfile lint, typecheck, builds, tests, migrations, OpenAPI and both audits on any materially changed revision; earlier passes do not transfer automatically.
6. Keep the full audit a truthful failing signal until the security issue is actually remediated or release policy is changed through a separate, explicitly approved process.

**Result:** **PHASE 1 ENGINEERING: PASS WITH DOCUMENTED SECURITY EXCEPTION.**  
**Full development-dependency security audit: FAIL; open follow-up.**  
**Production/live healthcare readiness: NOT APPROVED.**
