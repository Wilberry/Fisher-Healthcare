import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {describe,it} from 'node:test';
import {fileURLToPath} from 'node:url';
const script=readFileSync(fileURLToPath(new URL('./run-phase5-acceptance.sh',import.meta.url)),'utf8');
describe('Phase 5 acceptance source isolation',()=>{
 it('rejects dirty source checkouts and supports a caller-supplied SHA pin',()=>{
  assert.match(script,/status --porcelain --untracked-files=all/);
  assert.match(script,/FISHER_PHASE5_EXPECTED_SHA/);
  assert.match(script,/worktree add --detach/);
 });
 it('never publishes or deploys as an acceptance side effect',()=>{
  assert.doesNotMatch(script,/\bgit\s+(?:push|merge)\b|\bvercel\s+deploy\b/);
 });
});
