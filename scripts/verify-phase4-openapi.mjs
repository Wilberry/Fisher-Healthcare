import {readFileSync} from 'node:fs';
const doc=JSON.parse(readFileSync('docs/api/openapi.json','utf8'));
const required=[
  ['post','/api/v1/ops/results/intake'],
  ['post','/api/v1/ops/results/{resultId}/release'],
  ['get','/api/v1/patients/{patientId}/results'],
  ['get','/api/v1/results/{resultId}'],
  ['get','/api/v1/finance/transactions'],
  ['get','/api/v1/finance/reconciliation'],
  ['post','/api/v1/finance/reconciliation/runs']
];
for(const [method,path] of required){
  const operation=doc.paths?.[path]?.[method];
  if(!operation||!operation.security?.some(value=>Object.hasOwn(value,'bearer')))
    throw new Error('Phase 4 authenticated API contract missing: '+method+' '+path);
}
console.log('PASS: Phase 4 results API contract');
