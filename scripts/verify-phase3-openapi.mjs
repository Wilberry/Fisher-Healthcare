import { readFileSync } from 'node:fs';
const doc = JSON.parse(readFileSync('docs/api/openapi.json','utf8'));
const methods = [
  ['post','/api/v1/bookings'], ['post','/api/v1/payments/checkout'],
  ['get','/api/v1/me/bookings'], ['get','/api/v1/ops/work-queue/support'],
  ['get','/api/v1/ops/assignments/queue'],
  ['get','/api/v1/ops/assignments/eligible-shifts/{orderId}'],
  ['get','/api/v1/ops/assignments'],
  ['post','/api/v1/ops/assignments'],['get','/api/v1/field/assignments'],
  ['get','/api/v1/field/assignments/{id}'],
  ['post','/api/v1/field/assignments/{id}/events'],
  ['post','/api/v1/field/specimens/{id}/events'],
  ['post','/api/v1/field/specimens/{id}/label-check'],
  ['post','/api/v1/field/specimens/{id}/incident'],
  ['post','/api/v1/field/events/sync'],
  ['get','/api/v1/field/handoff-offers'],
  ['get','/api/v1/field/handoff-offers/{id}'],
  ['get','/api/v1/field/assignments/{id}/eligible-couriers'],
  ['post','/api/v1/field/assignments/{id}/handoff-offers'],
  ['post','/api/v1/field/handoff-offers/{id}/ack'],
  ['get','/api/v1/ops/exceptions'],
  ['post','/api/v1/ops/exceptions/{id}/resolve'],
  ['get','/api/v1/ops/lab-manifests'],
  ['get','/api/v1/ops/lab-manifests/{id}'],
  ['post','/api/v1/ops/lab-manifests'],
  ['post','/api/v1/ops/lab-manifests/{id}/receipt'],
  ['post','/api/v1/ops/labs/access-requests'],
  ['post','/api/v1/ops/labs/access-requests/{id}/approve'],
  ['post','/api/v1/ops/labs/access/{labId}/staff/{staffId}/revoke']
];
for (const [method,path] of methods) {
  const operation=doc.paths?.[path]?.[method];
  if (!operation) throw new Error('Missing API contract: '+method+' '+path);
  if (!operation.security?.some(s=>Object.hasOwn(s,'bearer')))
    throw new Error('Bearer security missing: '+method+' '+path);
}
if (!doc.components?.securitySchemes?.bearer) throw new Error('Bearer scheme missing');
console.log('PASS: Phase 2 and Phase 3 bearer route parity');
