import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {describe,it} from 'node:test';
const source=readFileSync(new URL('./verify-phase6-offline.sh',import.meta.url),'utf8');
describe('Phase 6 acceptance script invariants',()=>{
 it('requires pinned detached clean source',()=>{
  assert.match(source,/FISHER_PHASE6_EXPECTED_SHA/);
  assert.match(source,/git symbolic-ref/);
  assert.match(source,/git status --porcelain/);
 });
 it('runs all phase6 suites and denies an all-clear readiness result',()=>{
  for(const name of ['readiness-inventory','staging-preflight',
    'rollback-preflight','operations-preflight'])
   assert.ok(source.includes('phase6-'+name+'.test.mjs'));
  assert.match(source,/Readiness inventory unexpectedly clear/);
 });
 it('never invokes deployment or cloud CLIs',()=>{
  assert.doesNotMatch(source,/\b(?:terraform|kubectl|docker|aws|gcloud|az)\s/);
 });
});
