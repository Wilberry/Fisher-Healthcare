import {describe,it} from 'node:test';
import {strict as assert} from 'node:assert';
import {buildSyntheticAcceptanceEvidence} from './phase5-acceptance-evidence.mjs';
const sha='a'.repeat(40);
const fixture=()=>({
 commit:sha,
 coreSummary:['Result: PASS','Commit: '+sha,'Final acceptance: PASS',
  'Production dependency audit: PASS','Full dependency audit: PASS'].join('\n'),
 restoreSummary:['Result: PASS','Commit: '+sha','Docker container removed: YES'].join('\n'),
 restoreEvidence:['Migration registry rows matched: 36',
  'Synthetic restore marker matched: YES',
  'Backup encrypted with AES-256-GCM and ephemeral key: YES',
  'Plaintext archive written to disk: NO'].join('\n'),
 probe:{mode:'disposable-loopback-only',pilotAuthorized:false,
  latencyIsAnApprovedSla:false,count:20,healthyResponses:10,
  unauthorizedResponses:10,p95Ms:23,maxMs:50},
 smokePassed:true
});
describe('Phase 5 synthetic acceptance evidence synthesis',()=>{
 it('binds matching verified results to an immutable source commit',()=>{
  const report=buildSyntheticAcceptanceEvidence(fixture());
  assert.equal(report.commit,sha);
  assert.equal(report.engineeringSyntheticAcceptance,'PASS');
  assert.equal(report.pilotActivationAuthorized,false);
  assert.equal(report.productionReleaseAuthorized,false);
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
  assert.throws(()=>buildSyntheticAcceptanceEvidence({...fixture(),smokePassed:false}));
 });
});
