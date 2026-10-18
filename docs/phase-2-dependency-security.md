# Phase 2 dependency-security engineering register

Status: OPEN until the pinned lockfile, production and full dependency audits, and all local acceptance gates have been verified. No waiver is applied.

## Baseline observations

The synthetic Phase 2 verification on `e34ecf6013eb65c351a96e253b2f0d00b81ca2ef` passed lint, typecheck, builds, migrations, tests, OpenAPI and API/UI smoke tests. Dependency audits failed with 27 production findings (12 high) and 29 full-graph findings (13 high). Counts are historical evidence, not a claim about future dependency resolution.

## Dependency corrections

The repository uses pnpm 9.15.9. Transitive security overrides belong in root `package.json` under `pnpm.overrides`; the earlier `pnpm-workspace.yaml` overrides did not produce patched resolutions in the tested lockfile. The root now specifies:

- `multer@2.4.0` — replace vulnerable 2.0.2 in the NestJS HTTP stack.
- `lodash@4.18.1` — replace vulnerable 4.17.21 through Swagger.
- `js-yaml@4.3.2` — replace vulnerable 4.1.0 through Swagger.
- `postcss@8.5.18` — replace vulnerable 8.4.31 in the Next.js graph.
- `vite@^6.4.3` — retain the existing Vite floor for test tooling.

Versions are constraints, not evidence that the generated dependency graph is secure or compatible. Refresh the lockfile, rerun both audits, then rerun all typechecks/builds/tests/migrations/smoke checks on the exact commit. A reviewed, committed lockfile is required for final acceptance.

## Unpatched development dependency

`GHSA-vfj7-8cjw-p6xm` flags `braces@3.0.3` through `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`. The advisory currently lists **no patched release**. This is a development-tooling path in the supplied audit, not evidence of affected deployed patient functionality; its exact production reachability must still be verified.

Reference: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

Do not invent a patched version or exclude this advisory silently. The full raw audit remains enforced, and the release gate stays OPEN until a tested dependency-tree removal/replacement is available or a separately authorized security review determines the disposition. Production and full audits must be reported independently.

## Lightweight local audit preflight

From an isolated, pinned verification worktree:

```bash
FISHER_PHASE2_LOCAL_ACK=synthetic-only \
FISHER_EXPECTED_COMMIT="$(git rev-parse HEAD)" \
bash scripts/phase2-security-preflight.sh
```

This preflight refreshes the untracked lockfile (preserving its previous version), saves separate audit logs and a summary under `.verification`, and fails when either high-severity audit fails. It does not execute clinical operations or change production systems.

## Replacing the unpatched lint-only dependency chain

The final high-severity `braces@3.0.3` issue in the full dependency audit was introduced by the development-only `eslint-config-next@15` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` chain. The vulnerable package has no published patched release, so no version override or audit-ignore entry can truthfully remediate it.

The three Next.js applications now use the existing root TypeScript ESLint configuration, direct React/React Hooks/JSX accessibility recommended rules, and local Next.js navigation, image and synchronous-script guards. They no longer depend on `eslint-config-next`. This is a deliberate lint migration and **not a claim of exact rule-for-rule parity** with the Next.js preset. The local rules contain executable RuleTester cases. Future work can extend the local rules or restore the official upstream preset when its dependency graph no longer includes vulnerable `braces`.

All application-internal HTML anchors identified in the Phase 2 portal have been migrated to `next/link`; external Paystack checkout links and fragment-only anchors remain HTML anchors.

Release gates: refresh the full pnpm lockfile, reinstall all dependencies, run local Next guard tests and lint across 11 packages, confirm the full `pnpm audit --audit-level high` passes, confirm `pnpm audit --prod --audit-level high` passes, then repeat tests, builds, migration checks and API/UI smoke checks. Do not assume the advisory has disappeared until a newly generated lockfile has been audited.

