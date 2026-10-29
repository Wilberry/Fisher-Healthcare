# Restricted staging — provider-neutral topology contract

**Scope:** Planning and static validation of a synthetic-only staging topology. This directory contains **no deployable manifests** and grants no provider, clinical, patient, payment or production permissions.

The reference topology declares API, patient web, operations web, field PWA, worker, PostgreSQL and a migration job. Each workload requires an internal-only network, no exposed host ports, a non-root identity, read-only image filesystem, bounded CPU and memory, and an image/secret *reference* instead of a deployable value.

A production-ready deployment will need separate architecture reviews for service-to-service authentication, database connection pooling and least-privilege roles, KMS and secret manager integration, build attestations, TLS, private routing, DNS and approved ingress controls. PostgreSQL writable volumes and ephemeral filesystem mounts must be designed explicitly; read-only root filesystem declarations are not substitutes.

The backup section intentionally reports *planning-only* with offsite recovery **approval pending**. Staging snapshots and DR exercises need an independently approved operator and evidence; the example's references do not prove them.

Verify offline with:
```bash
node --test scripts/phase6-topology-policy.test.mjs
node scripts/phase6-topology-policy.mjs infra/staging/topology.example.json
```

Both commands avoid network and cloud operations. Do not import this sample into Terraform, Compose, Kubernetes or a platform UI.
