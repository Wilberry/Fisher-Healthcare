#!/usr/bin/env node
// Offline Phase 6 readiness inventory. NEVER authorizes a release or connects to services.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const REQUIRED=[
 ['clinical_sops','Qualified clinical and laboratory SOP approval'],
 ['privacy_review','Nigerian privacy and lawful-processing review'],
 ['laboratory_partners','Executed laboratory and provider agreements'],
 ['staffing','Named responsible clinical and operational personnel'],
 ['production_infrastructure','Approved environment and network boundaries'],
 ['secrets_and_identity','Managed secrets, identity and least-privilege access'],
 ['backup_recovery','Witnessed production-like restore and accepted RTO/RPO'],
 ['incident_response','Approved paging, escalation and stop authority'],
 ['payments_and_delivery','Authorized providers, reconciliation and notification controls'],
 ['pilot_supervision','Recorded supervised-pilot evidence and owner review']
];
export function evaluatePhase6Inventory(input){
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw new Error('Invalid readiness inventory');
 if(input.schemaVersion!==1||!Array.isArray(input.gates)||
    input.gates.length!==REQUIRED.length)
  throw new Error('Incomplete readiness inventory');
 const received=new Map();
 for(const gate of input.gates){
  if(!gate||typeof gate!=='object'||Array.isArray(gate)||
     typeof gate.id!=='string'||received.has(gate.id)||
     !['open','in_review','evidenced'].includes(gate.status)||
     typeof gate.owner!=='string'||gate.owner.length>120||
     typeof gate.evidenceRef!=='string'||gate.evidenceRef.length>240)
   throw new Error('Malformed readiness gate');
  // References only; forbid URLs, credentials and inline approval statements.
  if(/https?:|@|\n|\r|(?:token|secret|password|bearer)/i.test(gate.evidenceRef)||
     /\n|\r/.test(gate.owner))
   throw new Error('Unsafe evidence reference');
  received.set(gate.id,gate);
 }
 const gates=REQUIRED.map(([id,description])=>{
  const entry=received.get(id);
  if(!entry)throw new Error('Missing required readiness gate');
  const evidencePresent=entry.status==='evidenced' &&
      entry.owner.trim().length>0 && entry.evidenceRef.trim().length>0;
  return {id,description,status:entry.status,
    evidenceReferenced:evidencePresent};
 });
 return {schemaVersion:1,scope:'phase6-offline-readiness-inventory',
  gates,missingEvidence:gates.filter(g=>!g.evidenceReferenced).map(g=>g.id),
  allEvidenceReferenced:gates.every(g=>g.evidenceReferenced),
  // Deliberate hard boundary: references are not independently verified signatures.
  deploymentAuthorized:false,pilotActivationAuthorized:false,
  clinicalReleaseAuthorized:false,livePaymentEnabled:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Pass one local inventory JSON file');
  const report=evaluatePhase6Inventory(JSON.parse(readFileSync(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.allEvidenceReferenced)process.exitCode=2;
 }catch{
  console.error('Phase 6 readiness inventory rejected; no release action taken');
  process.exitCode=2;
 }
}
