import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
import {validatePhase6OperationsPlan} from './phase6-operations-preflight.mjs';
import {readFileSync} from 'node:fs';
const example=JSON.parse(readFileSync(new URL('../docs/operations/phase-6-operations-example.json',import.meta.url)));
const fresh=()=>structuredClone(example);
describe('Phase 6 offline secret and monitoring controls',()=>{
 it('records ownership while prohibiting any actual release or delivery',()=>{
  const r=validatePhase6OperationsPlan(fresh());
  assert.equal(r.monitoringSignalCount,5);
  assert.equal(r.externalDeliveryEnabled,false);
  assert.equal(r.secretsVerified,false);
  assert.equal(r.notificationsTested,false);
  assert.equal(r.deploymentAuthorized,false);
 });
 it('rejects mismatched secret references and unsafe inline values',()=>{
  for(const references of [[],['ref:staging/identity','ref:unknown/path'],
   ['password=foo'],['ref:staging/identity','ref:staging/identity']]){
   const p=fresh();p.secretLifecycle.references=references;
   assert.throws(()=>validatePhase6OperationsPlan(p));
  }
 });
 it('enforces rotation and revocation ownership',()=>{
  for(const [key,value] of [['rotationOwner',''],['auditLogging',false],
    ['rotationProcedureRef','https://unsafe.test'],['emergencyRevocationRef','']]){
   const p=fresh();p.secretLifecycle[key]=value;
   assert.throws(()=>validatePhase6OperationsPlan(p));
  }
 });
 it('rejects external alerts, missing coverage and duplicate signals',()=>{
  const p=fresh();p.monitoring.externalDeliveryEnabled=true;
  assert.throws(()=>validatePhase6OperationsPlan(p));
  const p2=fresh();p2.monitoring.signals.pop();
  assert.throws(()=>validatePhase6OperationsPlan(p2));
  const p3=fresh();p3.monitoring.signals[0].name=p3.monitoring.signals[1].name;
  assert.throws(()=>validatePhase6OperationsPlan(p3));
 });
 it('rejects unowned signals and unexpected activation fields',()=>{
  const p=fresh();p.monitoring.signals[0].owner='';
  assert.throws(()=>validatePhase6OperationsPlan(p));
  const p2=fresh();p2.productionApproved=true;
  assert.throws(()=>validatePhase6OperationsPlan(p2));
 });
});
