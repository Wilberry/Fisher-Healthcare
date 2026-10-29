import {strict as assert} from 'node:assert';
import {describe,it} from 'node:test';
import {readFileSync} from 'node:fs';
import {validateRestrictedStagingTopology} from './phase6-topology-policy.mjs';
const sample=JSON.parse(readFileSync(new URL('../infra/staging/topology.example.json',import.meta.url)));
const fresh=()=>structuredClone(sample);
describe('Restricted staging topology declaration',()=>{
 it('reports policy compliance without claiming a real deployment',()=>{
  const r=validateRestrictedStagingTopology(fresh());
  assert.equal(r.validatedWorkloadDeclarations,7);
  for(const key of ['infrastructureVerified','backupVerified','artifactVerified',
    'deploymentAuthorized','pilotActivationAuthorized'])
   assert.equal(r[key],false);
 });
 it('requires all workloads exactly once',()=>{
  const p=fresh();p.services.pop();assert.throws(()=>validateRestrictedStagingTopology(p));
  const q=fresh();q.services[0].name=q.services[1].name;
  assert.throws(()=>validateRestrictedStagingTopology(q));
 });
 it('denies published ports and public database access',()=>{
  const p=fresh();p.services[0].publishedPorts=[4000];
  assert.throws(()=>validateRestrictedStagingTopology(p));
  const q=fresh();q.network.databaseExposure='public';
  assert.throws(()=>validateRestrictedStagingTopology(q));
  const r=fresh();r.publicAccessEnabled=true;
  assert.throws(()=>validateRestrictedStagingTopology(r));
 });
 it('rejects privileged or mutable workloads',()=>{
  for(const key of ['runsAsNonRoot','readOnlyRootFilesystem']){
   const p=fresh();p.services[0][key]=false;
   assert.throws(()=>validateRestrictedStagingTopology(p));
  }
  const p=fresh();p.services[0].imageDigestRef='latest';
  assert.throws(()=>validateRestrictedStagingTopology(p));
  const q=fresh();q.services[0].resourceLimit.memoryMiB=0;
  assert.throws(()=>validateRestrictedStagingTopology(q));
 });
 it('disallows unreviewed backup activation or unexpected fields',()=>{
  const p=fresh();p.backup.offsite='enabled';
  assert.throws(()=>validateRestrictedStagingTopology(p));
  const q=fresh();q.livePaymentsEnabled=true;
  assert.throws(()=>validateRestrictedStagingTopology(q));
 });
});
