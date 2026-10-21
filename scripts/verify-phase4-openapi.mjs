import {readFileSync} from 'node:fs';
const doc=JSON.parse(readFileSync('docs/api/openapi.json','utf8'));
const required=[
  ['get','/api/v1/ops/results/intake-readiness'],
  ['get','/api/v1/ops/results/pending'],
  ['post','/api/v1/ops/results/intake'],
  ['post','/api/v1/ops/results/{resultId}/release'],
  ['get','/api/v1/patients/{patientId}/result-email-preference'],
  ['post','/api/v1/patients/{patientId}/result-email-preference'],
  ['get','/api/v1/patients/{patientId}/results'],
  ['get','/api/v1/results/{resultId}'],
  ['get','/api/v1/results/{resultId}/document'],
  ['get','/api/v1/finance/transactions'],
  ['get','/api/v1/finance/reconciliation'],
  ['post','/api/v1/finance/reconciliation/runs'],
  ['get','/api/v1/finance/refunds'],
  ['post','/api/v1/finance/refunds'],
  ['post','/api/v1/finance/refunds/{id}/review'],
  ['get','/api/v1/finance/lab-payables'],
  ['post','/api/v1/finance/lab-payables'],
  ['get','/api/v1/finance/lab-settlements'],
  ['post','/api/v1/finance/lab-settlements'],
  ['post','/api/v1/finance/lab-settlements/{id}/review'],
  ['get','/api/v1/patients/{patientId}/physical-copies'],
  ['post','/api/v1/patients/{patientId}/physical-copies'],
  ['post','/api/v1/patients/{patientId}/physical-copies/{id}/cancel'],
  ['get','/api/v1/finance/physical-copies'],
  ['post','/api/v1/finance/physical-copies/{id}/quote']
];
for(const [method,path] of required){
  const operation=doc.paths?.[path]?.[method];
  if(!operation||!operation.security?.some(value=>Object.hasOwn(value,'bearer')))
    throw new Error('Phase 4 authenticated API contract missing: '+method+' '+path);
}

// Source-to-contract check: never rely only on a previously hand-edited
// generated JSON snapshot. Runtime OpenAPI generation is still required at
// exact-commit acceptance.
const controllers=[
  ['results','apps/api/src/phase4/results.controller.ts',''],
  ['finance','apps/api/src/phase4/finance.controller.ts',''],
  ['refund','apps/api/src/phase4/refund.controller.ts','finance/refunds'],
  ['lab-settlement','apps/api/src/phase4/lab-settlement.controller.ts','finance'],
  ['physical-copy','apps/api/src/phase4/physical-copy.controller.ts','']
];
const declared=new Set(required.map(([method,path])=>method+' '+path));
const scanned=new Set();
for(const [name,filename,prefix] of controllers){
 const source=readFileSync(filename,'utf8');
 const className=source.match(/export class (Phase4\w+Controller)/)?.[1];
 if(!className)throw new Error('Phase 4 controller not found: '+name);
 const root=source.match(/@Controller\('([^']+)'\)/)?.[1]??prefix;
 const methods=[...source.matchAll(/@(Get|Post)\((?:'([^']+)')?\)\s*(?:@Header\([^\n]+\)\s*)*(?:async\s+)?(\w+)\s*\(/g)];
 if(!methods.length)throw new Error('No Phase 4 routes found: '+name);
 for(const [,verb,fragment,handler] of methods){
   const method=verb.toLowerCase();
   const path='/api/v1/'+[root,fragment??''].filter(Boolean).join('/')
      .replace(/:([a-zA-Z]+)/g,'{$1}');
   const key=method+' '+path;
   if(!declared.has(key))throw new Error('Undeclared source route: '+key);
   if(scanned.has(key))throw new Error('Duplicate Phase 4 operation: '+key);
   scanned.add(key);
   const operation=doc.paths?.[path]?.[method];
   if(operation?.operationId!==className+'_'+handler)
      throw new Error('Generated operation name differs from handler: '+key);
   if(!operation.security?.some(v=>Object.hasOwn(v,'bearer')))
      throw new Error('Phase 4 source route lacks bearer contract: '+key);
 }
}
for(const key of declared){
 if(!scanned.has(key))throw new Error('Phase 4 tracked contract has no source route: '+key);
}
console.log('PASS: Phase 4 controller routes align with tracked OpenAPI operations');

console.log('PASS: Phase 4 results API contract');
