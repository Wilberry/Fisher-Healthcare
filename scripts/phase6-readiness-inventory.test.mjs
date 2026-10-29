import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
import {evaluatePhase6Inventory} from './phase6-readiness-inventory.mjs';
const ids=['clinical_sops','privacy_review','laboratory_partners','staffing',
 'production_infrastructure','secrets_and_identity','backup_recovery',
 'incident_response','payments_and_delivery','pilot_supervision'];
const inventory=(status='open')=>({schemaVersion:1,
 gates:ids.map(id=>({id,status,owner:'',evidenceRef:''}))});
describe('Phase 6 offline launch-readiness inventory',()=>{
 it('lists every required blocker and never authorizes activation',()=>{
  const result=evaluatePhase6Inventory(inventory());
  assert.equal(result.missingEvidence.length,10);
  for(const field of ['deploymentAuthorized','pilotActivationAuthorized',
   'clinicalReleaseAuthorized','livePaymentEnabled'])
   assert.equal(result[field],false);
 });
 it('an evidenced checklist is not an independently authorized release',()=>{
  const doc=inventory('evidenced');
  for(const gate of doc.gates){gate.owner='Named owner';gate.evidenceRef='register/item-'+String(doc.gates.indexOf(gate)+1);}
  const report=evaluatePhase6Inventory(doc);
  assert.equal(report.allEvidenceReferenced,true);
  assert.equal(report.deploymentAuthorized,false);
  assert.equal(report.pilotActivationAuthorized,false);
 });
 it('rejects missing, duplicate or unknown gate identifiers',()=>{
  const doc=inventory();
  assert.throws(()=>evaluatePhase6Inventory({...doc,gates:doc.gates.slice(1)}));
  assert.throws(()=>evaluatePhase6Inventory({...doc,gates:[...doc.gates.slice(1),doc.gates[1]]}));
  assert.throws(()=>evaluatePhase6Inventory({...doc,gates:[...doc.gates.slice(1),{...doc.gates[0],id:'new_gate'}]}));
 });
 it('rejects free-text secrets and URLs in evidence references',()=>{
  for(const value of ['https://example.test/approval','Bearer secret',
   'password=abc','hello\nworld']){
   const doc=inventory();
   doc.gates[0].evidenceRef=value;
   assert.throws(()=>evaluatePhase6Inventory(doc));
  }
 });
 it('fails closed on unrecognized statuses and malformed owners',()=>{
  const doc=inventory();
  doc.gates[0].status='approved';
  assert.throws(()=>evaluatePhase6Inventory(doc));
  doc.gates[0].status='evidenced';
  doc.gates[0].owner='\nmalformed';
  assert.throws(()=>evaluatePhase6Inventory(doc));
 });
});
