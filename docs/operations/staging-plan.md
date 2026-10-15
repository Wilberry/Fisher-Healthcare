# Fisher Healthcare — Phase 1 Environment and Staging Strategy

**Status:** Proposed execution topology; deployment acceptance outstanding.

## Environment separation

| Environment | Purpose | Data boundary |
| --- | --- | --- |
| Developer workstation | Software implementation, component previews, isolated testing | Synthetic records only |
| Disposable integration test | Database, authentication, custody, and background processing verification | Synthetic records only; short-lived database |
| Internal preview | Review patient, operations, and field interface foundations | No customer, laboratory, or real clinical data |
| Production (future milestone) | Controlled Lagos pilot and authorized commercial operations | Subject to clinical, legal, security, and infrastructure sign-off |

## Disposable preview

The repository includes `infra/docker/Dockerfile` and `infra/compose-preview.yml`. The compose project uses loopback-bound HTTP ports and a distinct PostgreSQL database. Starting the preview requires an explicit disposable-scope acknowledgment.

```bash
export FISHER_PREVIEW_ACK=disposable-no-phi
docker compose -f infra/compose-preview.yml up --build
```

The API health endpoint is `http://127.0.0.1:4000/api/v1/health`. Web previews are bound to ports 3000, 3001, and 3002. The preview must never be exposed publicly or populated with real patient, lab, or transaction data.

## Secrets and identity

Production and preview secrets are not stored in Git. OIDC issuer, audience and JWKS location are provided by trusted environment-specific configuration. Missing identity integration disables protected routes. Strong staff authentication is validated from verified token claims, and staff permissions are loaded from current database records.

## Readiness controls

Engineering approval for a staging environment will require a reproducible lockfile, exact-commit CI results, a verified migration history, successful JWT and resource authorization tests, dependency and security checks, accessibility review, isolated storage, monitored worker failures, and documented environment teardown.

The preview Dockerfile intentionally prioritizes completeness and transparency over a production-hardened minimal runtime image. It is not a public deployment artifact.
