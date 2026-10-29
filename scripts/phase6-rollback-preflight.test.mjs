import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
import {validatePhase6RollbackPlan} from './phase6-rollback-preflight.mjs';
const plan=()=>({
 staging:{environment:'restricted-synthetic-staging',sourceCommit:'a'.repeat(40),
  imageDigest:'sha256:'+'b'.repeat(64),region:'region-test-1',
  ingressHostname:'staging.fisher.test',databaseNetwork:'private-only',
  identityMode:'sandbox-only',databaseMode:'synthetic-only',
  outboundNotifications:false,livePayments:false,clinicalWorkflows:false,
  publicIngress:false,secretReferences:['ref:staging/identity'],
  operator:'Staging operator',changeTicket:'STAGE-1001'},
 deployment:{artifactDigest:'sha256:'+'b'.repeat(64),sourceCommit:'a'.repeat(40),
  previousArtifactDigest:'sha256:'+'c'.repeat(64),
  migrationStrategy:'forward-only-reviewed',
  rollbackStrategy:'previous-compatible-image-only',
  databaseRestoreStrategy:'manual-witnessed-separate',
  backupEvidenceRef:'ref:recovery/verified-drill',
  rollbackOwner:'Rollback owner',incidentOwner:'Incident owner',
  changeTicket:'STAGE-1001',stagingOnly:true,
  externalTrafficEnabled:false,releaseWindowApproved:false}
});
describe('Phase 6 offline deployment and rollback controls',()=>{
 it('accepts a declared synthetic plan without authorizing release',()=>{
  const out=validatePhase6RollbackPlan(plan());
  assert.equal(out.rollbackEvidenceReferenced,true);
  for(const key of ['deploymentAuthorized','productionReleaseAuthorized',
   'pilotActivationAuthorized','externalTrafficEnabled'])
    assert.equal(out[key],false);
 });
 it('rejects inconsistent source/image pins and missing previous artifact',()=>{
  for(const key of ['sourceCommit','artifactDigest','previousArtifactDigest']){
   const p=plan();p.deployment[key]='latest';
   assert.throws(()=>validatePhase6RollbackPlan(p));
  }
  const p=plan();p.deployment.previousArtifactDigest=p.deployment.artifactDigest;
  assert.throws(()=>validatePhase6RollbackPlan(p));
 });
 it('blocks destructive schema rollback and unreviewed database restores',()=>{
  for(const [key,value] of [['migrationStrategy','down-migrate'],
   ['rollbackStrategy','restore-snapshot'],
   ['databaseRestoreStrategy','automatic']]){
   const p=plan();p.deployment[key]=value;
   assert.throws(()=>validatePhase6RollbackPlan(p));
  }
 });
 it('refuses release toggles, missing owners and plan tampering',()=>{
  for(const key of ['externalTrafficEnabled','releaseWindowApproved']){
   const p=plan();p.deployment[key]=true;
   assert.throws(()=>validatePhase6RollbackPlan(p));
  }
  const p=plan();p.deployment.incidentOwner='';
  assert.throws(()=>validatePhase6RollbackPlan(p));
  assert.throws(()=>validatePhase6RollbackPlan({...plan(),approval:true}));
 });
});
