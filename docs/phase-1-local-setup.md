# Phase 1 developer setup

**Prerequisites:** Node.js 22, Corepack, pnpm 9.15.9, Docker with Compose, PostgreSQL client `psql`. No real patient information.

```bash
git clone https://github.com/Wilberry/Fisher-Healthcare.git
cd Fisher-Healthcare
corepack enable
pnpm install
docker compose -f infra/docker-compose.yml up -d
PGPASSWORD=fisher_local_only psql -h 127.0.0.1 -U fisher -d fisher_dev -v ON_ERROR_STOP=1 -f packages/database/drizzle/0000_foundation.sql
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @fisher/api dev
```

Health check: `curl http://localhost:4000/api/v1/health`.

**Important:** The initial migration is for an empty disposable database. It is not idempotent and must not be applied twice. It has not yet been executed and verified by this assistant. The workspace currently has no committed pnpm lockfile; dependency resolution is not yet reproducible. If any command fails, capture full logs and exact commit before proceeding. Do not use the skeleton interfaces for healthcare operations.

For database reset, destroy only the disposable `fisher_dev` instance after verifying the Docker Compose project and volume identity; never apply generic destructive cleanup to unrelated Docker resources.
