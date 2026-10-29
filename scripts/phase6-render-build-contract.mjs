#!/usr/bin/env node
// Static checks only; never loads DB credentials or performs migrations.
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function inspectRenderBuild(root){
 const docker=readFileSync(join(root,'infra/docker/Dockerfile'),'utf8');
 const migrate=readFileSync(join(root,'packages/database/src/migrate.ts'),'utf8');
 const api=readFileSync(join(root,'apps/api/src/main.ts'),'utf8');
 const files=readdirSync(join(root,'packages/database/drizzle')).filter(x=>/^\d{4}_[a-z0-9_]+[.]sql$/.test(x));
 if(files.length===0||!files.every(x=>existsSync(join(root,'packages/database/drizzle',x))))
  throw new Error('No versioned migration files');
 if(!docker.includes('pnpm install --frozen-lockfile')||!docker.includes('pnpm build')||
    !docker.includes('USER node')||!docker.includes('COPY --from=build'))
  throw new Error('Docker build prerequisites missing');
 if(!migrate.includes("FISHER_MIGRATE_ACK")||
    !migrate.includes("pg_advisory_xact_lock")||
    !migrate.includes("Migration checksum mismatch")||
    !migrate.includes("mode === 'check'"))
  throw new Error('Reviewed migration gating missing');
 if(!api.includes('FISHER_API_BIND_HOST')||
    !existsSync(join(root,'scripts/phase6-render-start.mjs')))
  throw new Error('Private runtime boot wiring missing');
 return {schemaVersion:1,mode:'static-build-and-migration-readiness',
  migrationFilesDiscovered:files.length,liveDatabaseConnected:false,
  migrationsApplied:false,renderProvisioned:false,clinicalUseApproved:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(JSON.stringify(inspectRenderBuild(process.cwd()),null,2)+'\n');}
 catch{console.error('Static Render build contract failed');process.exitCode=2;}
}
