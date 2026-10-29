import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
import {validatePhase6StagingPlan} from './phase6-staging-preflight.mjs';
const valid=()=>({
 environment:'restricted-synthetic-staging',sourceCommit:'a'.repeat(40),
 imageDigest:'sha256:'+'b'.repeat(64),region:'region-test-1',
 ingressHostname:'staging.fisher.test',databaseNetwork:'private-only',
 identityMode:'sandbox-only',databaseMode:'synthetic-only',
 outboundNotifications:false,livePayments:false,clinicalWorkflows:false,
 publicIngress:false,secretReferences:['ref:staging/oidc-client','ref:staging/database'],
 operator:'Staging operator',changeTicket:'STAGE-1001'
});
describe('Phase 6 restricted staging preflight',()=>{
 it('accepts an offline synthetic plan without authorizing deployment',()=>{
  const result=validatePhase6StagingPlan(valid());
  assert.equal(result.isolationValidated,true);
  assert.equal(result.deploymentAuthorized,false);
  assert.equal(result.pilotActivationAuthorized,false);
  assert.equal(JSON.stringify(result).includes('oidc-client'),false);
 });
 it('rejects unfrozen images and mutable source revisions',()=>{
  for(const key of ['sourceCommit','imageDigest']){
   const plan=valid();plan[key]='latest';
   assert.throws(()=>validatePhase6StagingPlan(plan));
  }
 });
 it('refuses all live or externally reachable service switches',()=>{
  for(const key of ['outboundNotifications','livePayments','clinicalWorkflows','publicIngress']){
   const plan=valid();plan[key]=true;
   assert.throws(()=>validatePhase6StagingPlan(plan));
  }
  for(const [key,value] of [['databaseNetwork','public'],['identityMode','production'],
    ['databaseMode','clinical']]){
   const plan=valid();plan[key]=value;
   assert.throws(()=>validatePhase6StagingPlan(plan));
  }
 });
 it('refuses unknown fields, hostname bypasses and inline credentials',()=>{
  assert.throws(()=>validatePhase6StagingPlan({...valid(),releaseAuthorized:true}));
  for(const hostname of ['fisher.example.com','staging.fisher.test.evil.com',
    'https://staging.fisher.test','localhost']){
   assert.throws(()=>validatePhase6StagingPlan({...valid(),ingressHostname:hostname}));
  }
  assert.throws(()=>validatePhase6StagingPlan({...valid(),secretReferences:['password=123']}));
 });
 it('requires an accountable operator, approved change token and unique references',()=>{
  assert.throws(()=>validatePhase6StagingPlan({...valid(),operator:''}));
  assert.throws(()=>validatePhase6StagingPlan({...valid(),changeTicket:''}));
  assert.throws(()=>validatePhase6StagingPlan({...valid(),
   secretReferences:['ref:staging/database','ref:staging/database']}));
 });
});
