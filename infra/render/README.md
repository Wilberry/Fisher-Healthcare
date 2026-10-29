# Render restricted synthetic test environment (not deployed)

The opt-in Blueprint template is `infra/render/render.synthetic.yaml`. It intentionally is **not** `render.yaml` at repository root, so commits do not automatically configure Render. Do not sync it until a written staging authorization and cost review are recorded.

It declares one private API service and a Render PostgreSQL 16 instance with `ipAllowList: []`, so the database is not exposed through Render's external connection endpoint. Automatic deployments are off. It is **not a public production system**; there are no patient, operations, field or admin frontends, payment/live-email integrations, or public API endpoints.

The private API is a first infrastructure smoke-test target only. It may not boot without completed OIDC/DB configuration or migrations. No automatic database migrations are configured. Before any actual sync:
1. Approve Render region, paid compute/database costs, cloud access policy and synthetic data scope.
2. Confirm OIDC environment settings and harden application boot to deny missing/invalid OIDC without allowing any bypass.
3. Confirm runtime dependency build, exact artifact revision, migrations plan, Postgres least privilege, database retention/backups, and private service health.
4. Add a reviewed access mechanism for private health checks; private Render services cannot be accessed from the open internet.
5. Perform a disposable and evidenced synthetic-only smoke test, plus a witnessed restore/rollback rehearsal.
6. Keep real patient data, live clinical results, live Paystack, and external notifications disabled until separate approvals.

The Blueprint template's branch is intentionally pinned to the Phase 6 Render development branch. Update that reference only in a reviewed deployment change. Production clinical readiness requires separate release acceptance and privacy, security and lab governance.

## Offline guard

`node --test scripts/phase6-render-blueprint.test.mjs`

This guards an exact contract; it does not validate provider runtime support or perform Render operations.

## Runtime startup gate

The Docker command now invokes `scripts/phase6-render-start.mjs` before starting the API. This denies missing OIDC settings, missing Postgres references, unsafe application modes and payment/email credentials in this strictly synthetic environment. The gate does not authenticate a live OIDC provider or validate database migrations. All failures are reported by field name only; credentials are never logged.

Run offline: `node --test scripts/phase6-render-start.test.mjs`.
