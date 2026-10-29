import {strict as assert} from 'node:assert';
import {randomBytes} from 'node:crypto';
import {describe,it} from 'node:test';
import {encryptArchive,decryptArchive,requireBackupKey} from './phase5-archive-crypto.mjs';
describe('Phase 5 disposable backup authenticated encryption',()=>{
 it('round-trips only with the ephemeral 256-bit key',()=>{
  const key=randomBytes(32),input=Buffer.from('synthetic-only backup marker');
  const encrypted=encryptArchive(input,key);
  assert.equal(encrypted.subarray(0,8).toString('ascii'),'FHRBK001');
  assert.ok(!encrypted.includes(input));
  assert.deepEqual(decryptArchive(encrypted,key),input);
  const wrong=randomBytes(32);
  assert.throws(()=>decryptArchive(encrypted,wrong));
 });
 it('detects archive alteration, truncation and invalid keys',()=>{
  const key=randomBytes(32),blob=encryptArchive(Buffer.from('disposable'),key);
  const altered=Buffer.from(blob);altered[altered.length-1]^=1;
  assert.throws(()=>decryptArchive(altered,key));
  assert.throws(()=>decryptArchive(blob.subarray(0,30),key));
  const encoded=key.toString('base64url');
  assert.deepEqual(requireBackupKey(encoded),key);
  assert.throws(()=>requireBackupKey('not-a-key'));
  assert.throws(()=>requireBackupKey('A'.repeat(44)));
 });
});
