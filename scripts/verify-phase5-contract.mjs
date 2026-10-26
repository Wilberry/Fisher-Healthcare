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
for(const [route,method,id] of [
 ['/api/v1/ops/pilot-readiness/alerts','get','Phase5AlertsController_list'],
 ['/api/v1/ops/pilot-readiness/evaluate','post','Phase5AlertsController_evaluate'],
 ['/api/v1/ops/pilot-readiness/alerts/{code}/acknowledge','post','Phase5AlertsController_acknowledge']
]){
 const op=spec.paths?.[route]?.[method];
 if(!op||op.operationId!==id||!op.security?.some(s=>Object.hasOwn(s,'bearer')))
  throw new Error('Missing protected Phase 5 alert contract: '+method+' '+route);
}
if(!module.includes('Phase5AlertsService')||
 !module.includes('Phase5AlertsController'))
 throw new Error('Phase 5 alert service is not mounted');
const alerts=readFileSync('apps/api/src/phase5/alerts.service.ts','utf8');
if(!alerts.includes('requirePhase5SyntheticMode()')||
 !alerts.includes('requireStaffMfa(identity)')||
 !alerts.includes("st.role='administrator'"))
 throw new Error('Alert service missing fail-closed administrative policy');
const migration=readFileSync(
 'packages/database/drizzle/0035_phase5_synthetic_alert_lifecycle.sql','utf8');
if(!migration.includes('phase5_alert_no_delete')||
 !migration.includes('END; $;\nCREATE TRIGGER phase5_alert_identity_guard'))
 throw new Error('Missing or invalid immutable Phase 5 alert migration');
console.info('PASS: protected Phase 5 snapshot OpenAPI and authorization declaration');
