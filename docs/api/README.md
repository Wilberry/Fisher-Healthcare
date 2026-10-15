# Fisher Healthcare API Contract

The OpenAPI specification is generated from NestJS controllers and the current framework route metadata during Phase 1 CI using:

```bash
pnpm --filter @fisher/api openapi:generate
```

The generated file is `docs/api/openapi.json`. Publicly documented diagnostic and authorization-check routes are not patient-facing product APIs. Valid bearer authentication alone does not authorize access to clinical data, and no result document download route is enabled in Phase 1.

The generation script rejects missing core routes. Publication, version compatibility, schema changes, endpoint RBAC, and E2E contract validation require review before later phases.
