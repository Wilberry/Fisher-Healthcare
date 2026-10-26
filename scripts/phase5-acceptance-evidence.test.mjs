import {describe,it} from 'node:test';
import {strict as assert} from 'node:assert';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSyntheticAcceptanceEvidence} from './phase5-acceptance-evidence.mjs';
const sha='a'.repeat(40);
const lockfileSha256='c'.repeat(64);
const fixture=()=>({
 commit:sha,lockfileSha256,
 coreSummary:['Result: PASS','Commit: '+sha,'Final acceptance: PASS',
  'Production dependency audit: PASS','Full dependency audit: PASS',
  'Lockfile: '+lockfileSha256,'Lockfile committed at tested revision: yes'].join('\n'),
 restoreSummary:['Result: PASS','Commit: '+sha,'Docker container removed: YES'].join('\n'),
 restoreEvidence:['Migration registry rows matched: 36',
  'Synthetic restore marker matched: YES',
  'Backup encrypted with AES-256-GCM and ephemeral key: YES',
  'Plaintext archive written to disk: NO'].join('\n'),
 probe:{mode:'disposable-loopback-only',pilotAuthorized:false,
  latencyIsAnApprovedSla:false,count:20,healthyResponses:10,
  unauthorizedResponses:10,p95Ms:23,maxMs:50},
 smokeSummary:['Result: PASS','Commit: '+sha,
  'API denied-access checks: PASS','Web origin checks: PASS'].join('\n')
});
describe('Phase 5 synthetic acceptance evidence synthesis',()=>{
 it('binds matching verified results to an immutable source commit',()=>{
  const report=buildSyntheticAcceptanceEvidence(fixture());
  assert.equal(report.commit,sha);
  assert.equal(report.engineeringSyntheticAcceptance,'PASS');
  assert.equal(report.pilotActivationAuthorized,false);
  assert.equal(report.productionReleaseAuthorized,false);
 });
 it('rejects contradictory summaries and stale smoke or lockfile evidence',()=>{
  for(const key of ['coreSummary','restoreSummary','smokeSummary']){
   const input=fixture();input[key]+='\nResult: FAIL';
   assert.throws(()=>buildSyntheticAcceptanceEvidence(input));
  }
  assert.throws(()=>buildSyntheticAcceptanceEvidence({
   ...fixture(),lockfileSha256:'d'.repeat(64)}));
  assert.throws(()=>buildSyntheticAcceptanceEvidence({
   ...fixture(),smokeSummary:fixture().smokeSummary.replace(sha,'b'.repeat(40))}));
 });
 it('requires explicit acknowledgment and real smoke evidence through the CLI',()=>{
  const dir=mkdtempSync(join(tmpdir(),'fisher-evidence-'));
  try{
   const input=fixture();
   const files=['coreSummary','restoreSummary','restoreEvidence','probe','smokeSummary']
    .map(key=>{
     const path=join(dir,key);
     writeFileSync(path,key==='probe'?JSON.stringify(input[key]):input[key]);
     return path;
    });
   const script=fileURLToPath(new URL('./phase5-acceptance-evidence.mjs',import.meta.url));
   const invoke=ack=>spawnSync(process.execPath,[script,sha,...files,lockfileSha256],{
    encoding:'utf8',env:{...process.env,FISHER_PHASE5_LOCAL_ACK:ack}
   });
   const accepted=invoke('synthetic-only');
   assert.equal(accepted.status,0,accepted.stderr);
   assert.equal(JSON.parse(accepted.stdout).lockfileSha256,lockfileSha256);
   assert.notEqual(invoke('').status,0);
   writeFileSync(files[4],'Result: PASS\nCommit: '+'b'.repeat(40));
   const denied=invoke('synthetic-only');
   assert.notEqual(denied.status,0);
   assert.equal(denied.stdout,'');
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('rejects reused core results from a different commit',()=>{
  assert.throws(()=>buildSyntheticAcceptanceEvidence({...fixture(),commit:'b'.repeat(40)}));
 });
 it('denies absent restoration, container cleanup or encryption integrity',()=>{
  for(const key of ['restoreSummary','restoreEvidence']){
   assert.throws(()=>buildSyntheticAcceptanceEvidence({...fixture(),[key]:''}));
  }
  const missing={...fixture(),restoreSummary:'Result: PASS\nCommit: '+sha};
  assert.throws(()=>buildSyntheticAcceptanceEvidence(missing));
 });
 it('rejects skipped, incomplete or unauthorized probe evidence',()=>{
  const skipped={...fixture(),probe:{...fixture().probe,unauthorizedResponses:0}};
  assert.throws(()=>buildSyntheticAcceptanceEvidence(skipped));
  assert.throws(()=>buildSyntheticAcceptanceEvidence({...fixture(),smokeSummary:''}));
 });
});
