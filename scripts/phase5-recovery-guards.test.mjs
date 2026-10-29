import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {describe,it} from 'node:test';
import {fileURLToPath} from 'node:url';
const source=readFileSync(fileURLToPath(new URL('./phase5-disposable-restore-drill.sh',import.meta.url)),'utf8');
describe('Disposable recovery source-level safeguards',()=>{
 it('uses a per-execution identifier to scope Docker resource cleanup',()=>{
  assert.match(source,/CONTAINER="fisher-phase5-restore-\$\{UID\}-\$\{BASHPID\}"/);
  assert.match(source,/RUN_LABEL="fisher\.phase5\.disposable=\$\{UID\}-\$\{BASHPID\}"/);
  assert.match(source,/docker ps -a --filter "label=\$RUN_LABEL"/);
  assert.match(source,/docker rm -f "\$CONTAINER"/);
 });
 it('uses a fresh disposable database credential without printing it',()=>{
  assert.match(source,/DB_PASSWORD=.*randomBytes\(24\)/);
  assert.doesNotMatch(source,/fisher_phase5_disposable/);
  assert.match(source,/unset FISHER_PHASE5_BACKUP_KEY_B64 DB_PASSWORD DATABASE_URL/);
 });
 it('checks the exact disposable source over TCP before migration',()=>{
  assert.match(source,/PGCONNECT_TIMEOUT=3 psql "\$DATABASE_URL"/);
  assert.match(source,/DB_READY=yes/);
  assert.match(source,/Disposable source DB TCP unavailable/);
 });
 it('requires a tampered backup to fail without output before restoring',()=>{
  assert.match(source,/source\[source\.length-1\]\^=1/);
  assert.match(source,/Tampered archive was accepted/);
  assert.match(source,/Tamper exposed plaintext/);
  assert.match(source,/Tampered encrypted archive rejected: YES/);
  assert.match(source,/set -Eeuo pipefail/);
 });
});
