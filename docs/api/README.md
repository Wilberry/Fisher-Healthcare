# Fisher Healthcare — API Contract

The Phase 1 API specification is generated from NestJS route metadata using the
**compiled API artifact**. TypeScript is compiled with legacy decorators and
`emitDecoratorMetadata` enabled; executing the original NestJS TypeScript
entrypoint directly with `tsx` does not guarantee equivalent injection metadata.

## Local generation

Compile the shared packages and API first, then generate the specification:

```bash
pnpm exec turbo run build --concurrency=1
pnpm --filter @fisher/api openapi:generate
```

Alternatively, `pnpm --filter @fisher/api openapi:generate:from-source`
recompiles just the API before generation, assuming the shared packages have
already been built. The consolidated Phase 1 verification script builds the
workspace before generating the API specification.

The generator writes `docs/api/openapi.json`. It fails if required Phase 1
routes or bearer-authentication metadata disappear and records the failed
generation stage. Detailed error output is opt-in and restricted to explicitly
acknowledged synthetic local verification:

```bash
FISHER_PHASE1_LOCAL_ACK=synthetic-only FISHER_OPENAPI_DEBUG=1 \
  pnpm --filter @fisher/api openapi:generate
```

Do not enable diagnostic stack traces in production or with real patient data.

## Contract boundaries

The Phase 1 endpoints support health, identity verification, capability and
authorization checks. These are not live patient booking, laboratory,
clinical-result delivery or payment workflows. A valid bearer token alone
does not confer access to patient data; server-side authorization verifies
current persisted relationships and relevant staff permissions.

Generated specifications require review before they are committed and accepted.
A successful generator run is not proof that OAuth/OIDC production onboarding,
clinical storage, payments, field dispatch or laboratory release workflows
are production ready.


## Phase 2 supplementary routes
The Phase 2 branch adds patient catalogue, quote, booking and staging payment routes. These routes are isolated behind explicit synthetic and payment-staging configuration; they are **not** live booking or clinical delivery endpoints. See [Phase 2 implementation status](../phase-2-implementation-status.md). Generated OpenAPI is reviewed alongside both security annotations and runtime authorization tests.
