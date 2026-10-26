import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const magic=Buffer.from('FHRBK001','ascii');
const aad=Buffer.from('fisher-phase5-disposable-restore-v1','utf8');
const MAX_BYTES=64*1024*1024;
export function requireBackupKey(raw){
 if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw))
  throw new Error('Synthetic backup encryption key missing');
 const key=Buffer.from(raw,'base64url');
 if(key.length!==32||key.toString('base64url')!==raw)
  throw new Error('Synthetic backup key must be 256-bit canonical base64url');
 return key;
}
export function encryptArchive(bytes,key){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>MAX_BYTES)
  throw new Error('Invalid synthetic backup stream');
 if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('Invalid encryption key');
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([magic,nonce,cipher.getAuthTag(),ciphertext]);
}
export function decryptArchive(record,key){
 if(!Buffer.isBuffer(record)||record.length<=36||
   record.length>MAX_BYTES+36||!record.subarray(0,8).equals(magic))
   throw new Error('Invalid encrypted backup format');
 if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('Invalid decryption key');
 const nonce=record.subarray(8,20);
 const tag=record.subarray(20,36);
 const cipherText=record.subarray(36);
 const decipher=createDecipheriv('aes-256-gcm',key,nonce);
 decipher.setAAD(aad);decipher.setAuthTag(tag);
 const plain=Buffer.concat([decipher.update(cipherText),decipher.final()]);
 if(!plain.length)throw new Error('Restored backup is empty');
 return plain;
}
async function readBoundedStdin(){
 const chunks=[];let count=0;
 for await(const input of process.stdin){
  const piece=Buffer.isBuffer(input)?input:Buffer.from(input);
  count+=piece.length;
  if(count>MAX_BYTES)throw new Error('Synthetic backup exceeds bounded size');
  chunks.push(piece);
 }
 if(!count)throw new Error('Empty synthetic backup stream');
 return Buffer.concat(chunks);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.FISHER_PHASE5_RESTORE_ACK!=='new-disposable-only')
   throw new Error('Synthetic-only acknowledgment required');
  const mode=process.argv[2];
  if(mode!=='encrypt'&&mode!=='decrypt')
   throw new Error('Usage: encrypt|decrypt');
  const key=requireBackupKey(process.env.FISHER_PHASE5_BACKUP_KEY_B64);
  const input=await readBoundedStdin();
  const output=mode==='encrypt'?encryptArchive(input,key):decryptArchive(input,key);
  process.stdout.write(output);
 }catch{
  // Never print key material or backup contents.
  console.error('Synthetic backup encryption/verification failed');
  process.exitCode=2;
 }
}
