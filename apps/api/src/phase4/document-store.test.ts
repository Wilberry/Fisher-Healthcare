import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile,symlink} from 'node:fs/promises';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {readSyntheticResultDocument} from './document-store';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let root='';
afterEach(async()=>{vi.unstubAllEnvs();if(root)await rm(root,{recursive:true,force:true});root='';});
describe('disposable private synthetic PDF verification',()=>{
 async function prepared(){
  const pdf=Buffer.from('%PDF-1.4\nSynthetic testing only\n%%EOF\n');
  root=await mkdtemp('/tmp/fisher-healthcare-phase4-private-');
  vi.stubEnv('NODE_ENV','test');
  vi.stubEnv('FISHER_PHASE4_OPERATION_MODE','synthetic-only');
  vi.stubEnv('FISHER_PHASE4_DOCUMENT_MODE','synthetic-only');
  vi.stubEnv('FISHER_DISPOSABLE_DB_ACK','disposable-test-only');
  vi.stubEnv('DATABASE_URL','postgres://tester@localhost:5432/fisher_test');
  vi.stubEnv('FISHER_PHASE4_PRIVATE_DOCUMENT_DIR',root);
  await writeFile(root+'/'+id+'.pdf',pdf);
  const sha=createHash('sha256').update(pdf).digest('hex');
  return {pdf,sha};
 }
 it('reads only a checksum-matching, local synthetic PDF',async()=>{
  const {pdf,sha}=await prepared();
  expect(await readSyntheticResultDocument('synthetic/results/'+id+'.pdf',sha))
    .toEqual(pdf);
  await expect(readSyntheticResultDocument('synthetic/results/'+id+'.pdf','b'.repeat(64)))
    .rejects.toThrow();
  await expect(readSyntheticResultDocument('../secret.pdf',sha)).rejects.toThrow();
  vi.stubEnv('NODE_ENV','production');
  await expect(readSyntheticResultDocument('synthetic/results/'+id+'.pdf',sha))
    .rejects.toThrow();
 });
 it('refuses fixture symlinks and non-private directories',async()=>{
  const {sha}=await prepared();
  await symlink(root+'/'+id+'.pdf',root+'/'+other+'.pdf');
  await expect(readSyntheticResultDocument('synthetic/results/'+other+'.pdf',sha))
    .rejects.toThrow();
  vi.stubEnv('FISHER_PHASE4_PRIVATE_DOCUMENT_DIR','/tmp');
  await expect(readSyntheticResultDocument('synthetic/results/'+id+'.pdf',sha))
    .rejects.toThrow();
 });
});
