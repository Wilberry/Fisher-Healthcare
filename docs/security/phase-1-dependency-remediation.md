# Phase 1 — Dependency Security Remediation

**Security gate:** OPEN until exact-commit local verification confirms no unresolved high/critical advisory and approved deployment artifacts.  
**Verification mode:** Local execution only; GitHub Actions is unavailable because of billing restrictions.

## Local audit — 16 October 2026

At commit `0f8f23e316e99fc2b3ba6ccbf5bd587a1190fd67`, the full `pnpm audit --audit-level high` command exited unsuccessfully.

| Severity | Reported advisories |
| --- | ---: |
| Critical | 3 |
| High | 15 |
| Moderate | 20 |
| Low | 2 |
| **Total** | **40** |

A dependency advisory is a vulnerability report, not evidence of exploitation.

## Upgrade strategy

The following dependency ranges are **proposed source-level remediations**. They are not considered validated until installation, compile, tests, runtime smoke, and a regenerated lockfile audit pass.

| Exposure observed in local audit | Original dependency | Updated minimum | Action and acceptance evidence |
| --- | --- | --- | --- |
| Vitest dev-server arbitrary file execution advisory | `vitest@2.1.9` | `vitest >=4.1.11` | Upgraded across all testing workspaces. Execute full Vitest regression suite. |
| Tinypool code-execution advisories | `tinypool@1.1.1` via Vitest 2 | No unsafe override | Vitest 4 removes the old test-runner dependency path; verify with `pnpm why tinypool` and audit. |
| SQL identifier escaping | `drizzle-orm@0.36.4` | `drizzle-orm >=0.45.4` | Upgrade stable Drizzle ORM and compatible kit; verify schema compilation, SQL migrations, rollback and database authorization. |
| Multipart upload DoS | `multer@2.0.2` | `multer >=2.3.0` | Workspace override for NestJS Express adapter; verify compatible middleware behavior. |
| Lodash template code injection | `lodash@4.17.21` | `lodash >=4.18.1` | Workspace override for existing Swagger dependency. |
| YAML merge-key CPU exhaustion | `js-yaml@4.1.0` | `js-yaml >=4.3.2` | Workspace override. |
| PostCSS source-map file disclosure | `postcss@8.4.31` | `postcss >=8.5.18` | Workspace override; rerun three Next.js builds. |
| Vite development-server issues | `vite@5.4.21` | `vite >=6.4.3` | Upgraded Vitest toolchain and overridden transitive Vite. Verify test initialization and all test runs. |

The pnpm 9.15.9 workspace holds its overrides in `pnpm-workspace.yaml`. All manifest changes must be reflected in the reviewed `pnpm-lock.yaml` before acceptance.

## Unpatched upstream advisory — braces

The local audit also identified `braces@3.0.3` through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch`.

**Advisory:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) — stack exhaustion with deeply nested brace patterns. As reported on 16 October 2026, the advisory lists **no patched release**. Pinning the same affected version is not remediation. No advisory has been suppressed or ignored in this repository.

The reported dependency path is part of development-time lint tooling and normally consumes repository-authored glob patterns, not untrusted patient input. This context reduces direct clinical-runtime exposure but **does not automatically close the full development audit**. Inspect the resolved dependency graph, confirm absence from production assets using the production-only audit, and reassess upstream fixes or remove the affected toolchain only through a tested replacement with equivalent quality coverage. No production or Phase 1 acceptance waiver has been issued.

## Verification and failure handling

The consolidated local script now executes:

- `pnpm audit --prod --audit-level high` — evaluates the runtime production dependency graph.
- `pnpm audit --audit-level high` — evaluates the complete development and production graph.
- API and web HTTP smoke tests **even after a nonzero audit result**, so remaining runtime failures can be discovered in the same run.
- A final nonzero exit if **either** audit returns a high/critical finding. No blanket exemptions are applied.

The verifier preserves the previous, still-untracked lockfile in its ignored `.verification/` evidence directory before refreshing dependency resolution; it never resets tracked source files or cleans unrelated containers.

If the updated dependency graph still reports advisories, use `pnpm why <package>` and the new audit logs to determine which parent brings them in. Do not force incompatible versions or remove a security gate to make Phase 1 appear complete.

## Closure requirements

1. Resolve patched advisories without breaking builds, migrations, authentication, worker processing or contracts.
2. Capture production and full audit evidence, including any unpatched upstream findings.
3. Commit the reviewed lockfile and generated API contract only after the source and dependency graph stabilize.
4. Execute the complete verifier on that exact clean commit with the lockfile frozen.
5. Obtain explicit security and engineering acceptance before merging or deploying.
