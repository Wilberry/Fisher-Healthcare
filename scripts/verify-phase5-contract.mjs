import {readFileSync} from 'node:fs';
const spec=JSON.parse(readFileSync('docs/api/openapi.json','utf8'));
const path='/api/v1/ops/pilot-readiness/snapshot';
const operation=spec.paths?.[path]?.get;
if(!operation||operation.operationId!=='Phase5PostureController_snapshot'||
 !operation.security?.some((value)=>Object.hasOwn(value,'bearer')))
 throw new Error('Missing protected Phase 5 readiness contract');
const module=readFileSync('apps/api/src/module.ts','utf8');
if(!module.includes('Phase5PostureService')||!module.includes('Phase5PostureController'))
 throw new Error('Phase 5 readiness not mounted');
const service=readFileSync('apps/api/src/phase5/posture.service.ts','utf8');
if(!service.includes('requireStaffMfa(identity)')||
 !service.includes("requireStaffCapability(identity.subject,'audit:read')")||
 !service.includes("st.role='administrator'"))
 throw new Error('Missing administrator readiness authorization policy');
console.info('PASS: protected Phase 5 snapshot OpenAPI and authorization declaration');
