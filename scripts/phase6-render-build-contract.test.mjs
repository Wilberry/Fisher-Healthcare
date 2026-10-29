import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {describe,it} from 'node:test';
import {inspectRenderBuild} from './phase6-render-build-contract.mjs';
const runner=readFileSync(new URL('./verify-render-build.sh',import.meta.url),'utf8');
describe('Render build and migrations acceptance contract',()=>{
 it('finds migration files but reports no migrations applied',()=>{
  const out=inspectRenderBuild(new URL('..',import.meta.url).pathname);
  assert.ok(out.migrationFilesDiscovered>0);
  assert.equal(out.migrationsApplied,false);
  assert.equal(out.liveDatabaseConnected,false);
 });
 it('requires a pinned clean detached checkout',()=>{
  for(const phrase of ['FISHER_RENDER_ACCEPTED_SHA','git symbolic-ref','git status --porcelain'])
   assert.ok(runner.includes(phrase));
 });
 it('builds image only, never runs an API or migration container',()=>{
  assert.ok(runner.includes('docker build'));
  assert.doesNotMatch(runner,/docker (?:run|compose up|push)/);
  assert.doesNotMatch(runner,/migrate[.]js apply/);
 });
});
