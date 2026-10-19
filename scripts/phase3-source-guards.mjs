#!/usr/bin/env node
// Dependency-free source preflight for Phase 3. Does not mutate the worktree.
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {dirname,join,resolve,extname} from 'node:path';
const root=process.cwd();
const required=[
 'apps/operations-web/app/dispatch/[orderId]/assign-collector.tsx',
 'apps/operations-web/app/exceptions/review-incident.tsx',
 'apps/operations-web/app/lab-manifests/prepare-manifest.tsx',
 'apps/operations-web/app/lab-manifests/[id]/receive-manifest.tsx',
 'apps/field-pwa/app/visits/[id]/visit-actions.tsx',
 'apps/field-pwa/app/handoffs/courier-acknowledge.tsx',
 'apps/operations-web/app/lab-access/lab-access-actions.tsx',
 'apps/field-pwa/components/offline-recovery-panel.tsx',
 'apps/field-pwa/app/signed-out/page.tsx',
 'apps/field-pwa/components/staff-session-boundary.tsx',
 'apps/operations-web/components/staff-session-boundary.tsx',
 'apps/operations-web/app/signed-out/page.tsx'
];
const failures=[];
const read=path=>readFileSync(join(root,path),'utf8');
for(const path of required){
 if(!existsSync(join(root,path))){failures.push('Missing client component '+path);continue;}
 const code=read(path).replace(/^\uFEFF/,'').trimStart();
 if(!/^(['"])use client\1\s*;/.test(code))
   failures.push('Next.js client directive must appear before imports: '+path);
}
const migrationDir=join(root,'packages/database/drizzle');
const sql=readdirSync(migrationDir).filter(f=>f.endsWith('.sql'));
for(let version=17;version<=25;version++){
 const prefix=String(version).padStart(4,'0')+'_phase3_';
 const matches=sql.filter(f=>f.startsWith(prefix));
 if(matches.length!==1)failures.push('Expected one Phase 3 migration for '+prefix);
}
const legacy=sql.filter(f=>/^000[12]_phase3_/.test(f));
if(legacy.length)failures.push('Legacy Phase 3 migrations must not precede Phase 2: '+legacy.join(', '));
function walk(directory){
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(entry.name==='node_modules'||entry.name==='.next'||entry.name==='dist')continue;
  const path=join(directory,entry.name);
  if(entry.isDirectory())walk(path);
  else if(entry.isFile()&&/\.tsx?$/.test(entry.name))check(path);
 }
}
function check(file){
 const code=readFileSync(file,'utf8');
 const importPattern=/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g;
 for(const match of code.matchAll(importPattern)){
  const dest=resolve(dirname(file),match[1]);
  const candidates=[dest,dest+'.ts',dest+'.tsx',join(dest,'index.ts'),join(dest,'index.tsx')];
  if(!candidates.some(path=>existsSync(path)&&statSync(path).isFile()))
    failures.push('Unresolved relative import '+match[1]+' in '+file.slice(root.length+1));
 }
}
// Run on staff-facing apps and their action gateway routes (including nested routes).
walk(join(root,'apps/field-pwa/app'));
walk(join(root,'apps/field-pwa/lib'));
walk(join(root,'apps/field-pwa/components'));
walk(join(root,'apps/operations-web/app'));
walk(join(root,'apps/operations-web/lib'));
walk(join(root,'apps/operations-web/components'));
const collection=read('apps/api/src/phase3/field-assignments.controller.ts');
const manifest=read('apps/api/src/phase3/manifests.controller.ts');
if(/SELECT\s+id,barcode,status,custody_version\s+FROM specimens/.test(collection))
 failures.push('Expected specimen barcode exposed via field assignment API');
if(/SELECT\s+sp.id,sp.barcode/.test(manifest))
 failures.push('Expected specimen barcode exposed via lab manifest API');
const offlineStore=read('apps/field-pwa/lib/offline-store.ts');
const recovery=read('apps/field-pwa/lib/use-synthetic-recovery.ts');
const visit=read('apps/field-pwa/app/visits/[id]/visit-actions.tsx');
if(!offlineStore.includes("createIndex('owner_fingerprint'")||
   !offlineStore.includes('additionalData:aad(owner,event.eventId)'))
 failures.push('Synthetic recovery lacks cross-tab deduplication or authenticated encryption');
if(!recovery.includes("navigator.locks.request('fisher-phase3-synthetic-sync'"))
 failures.push('Manual synthetic synchronization must hold cross-tab exclusion');
if(!visit.includes("import { Notice } from '@fisher/ui'"))
 failures.push('Field visit client component missing safety notice import');
for(const area of ['field-pwa','operations-web']){
 if(!read('apps/'+area+'/app/auth/logout/route.ts').includes('Clear-Site-Data'))
   failures.push(area+' does not clear browser storage on sign-out');
 if(!read('apps/'+area+'/lib/staff-auth.ts').includes('FISHER_STAFF_WEB_ORIGIN'))
   failures.push(area+' must use trusted origin for CSRF');
}
if(failures.length){
 for(const issue of failures)console.error('FAIL: '+issue);
 process.exit(1);
}
console.log('PASS: Phase 3 source directives, relative imports, migration ordering and barcode minimization');
