import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {basename,isAbsolute,join} from 'node:path';
import {ServiceUnavailableException} from '@nestjs/common';
import {requirePhase4SyntheticMode} from './phase4-mode';

const documentKey=/^synthetic\/results\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.pdf$/;
const maxBytes=2*1024*1024;
function unavailable():never{throw new ServiceUnavailableException('Secure document not available');}
export function syntheticDocumentModeEnabled(){
 return process.env.NODE_ENV!=='production'&&
   process.env.FISHER_PHASE4_DOCUMENT_MODE==='synthetic-only'&&
   process.env.FISHER_PHASE4_OPERATION_MODE==='synthetic-only'&&
   process.env.FISHER_DISPOSABLE_DB_ACK==='disposable-test-only';
}
export async function readSyntheticResultDocument(key:string,sha256:string):Promise<Buffer>{
 requirePhase4SyntheticMode();
 if(!syntheticDocumentModeEnabled())unavailable();
 const root=process.env.FISHER_PHASE4_PRIVATE_DOCUMENT_DIR;
 if(!root||!isAbsolute(root)||!root.startsWith('/tmp/fisher-healthcare-phase4-private-'))
   unavailable();
 const match=documentKey.exec(key);
 if(!match||!/^[0-9a-f]{64}$/.test(sha256))unavailable();
 try{
  const realRoot=await realpath(root);
  if(realRoot!==root||!realRoot.startsWith('/tmp/fisher-healthcare-phase4-private-'))
    unavailable();
  const filename=match[1]+'.pdf';
  if(basename(filename)!==filename)unavailable();
  const file=join(realRoot,filename);
  // Resolve symbolic links and reject any path escaping the private fixture root.
  const realFile=await realpath(file);
  if(realFile!==file)unavailable();
  const bytes=await readFile(realFile);
  if(bytes.length===0||bytes.length>maxBytes||
    bytes.subarray(0,5).toString('ascii')!=='%PDF-'||
    !bytes.subarray(Math.max(0,bytes.length-64)).toString('ascii').includes('%%EOF'))
    unavailable();
  const actual=createHash('sha256').update(bytes).digest();
  const expected=Buffer.from(sha256,'hex');
  if(!timingSafeEqual(actual,expected))unavailable();
  return bytes;
 }catch{return unavailable();}
}
