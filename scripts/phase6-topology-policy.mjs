#!/usr/bin/env node
// Offline topology policy: does NOT provision, inspect or authorize infrastructure.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const components=['api','patient-web','operations-web','field-pwa','worker','postgres','migrations'];
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&
 Object.keys(x).sort().join('|')===[...keys].sort().join('|');
export function validateRestrictedStagingTopology(input){
 if(!exact(input,['schemaVersion','scope','network','services','backup','publicAccessEnabled'])||
    input.schemaVersion!==1||input.scope!=='synthetic-restricted-staging'||
    input.publicAccessEnabled!==false)
   throw new Error('Unexpected topology or public access request');
 const n=input.network;
 if(!exact(n,['isolation','ingress','databaseExposure','egress'])||
    n.isolation!=='private-only'||n.ingress!=='internal-only'||
    n.databaseExposure!=='none'||n.egress!=='deny-by-default')
   throw new Error('Staging network controls missing');
 if(!Array.isArray(input.services)||input.services.length!==components.length)
   throw new Error('Incomplete workload inventory');
 const seen=new Set();
 for(const s of input.services){
  if(!exact(s,['name','imageDigestRef','network','publishedPorts','runsAsNonRoot','readOnlyRootFilesystem','secretRef','resourceLimit'])||
    !components.includes(s.name)||seen.has(s.name)||
    typeof s.imageDigestRef!=='string'||!/^ref:images\/[a-z][a-z-]{2,30}$/.test(s.imageDigestRef)||
    s.network!=='private'||
    !Array.isArray(s.publishedPorts)||s.publishedPorts.length!==0||
    s.runsAsNonRoot!==true||s.readOnlyRootFilesystem!==true||
    !/^ref:secrets\/[a-z][a-z-]{2,30}$/.test(s.secretRef)||
    !exact(s.resourceLimit,['cpuMillicores','memoryMiB'])||
    !Number.isInteger(s.resourceLimit.cpuMillicores)||s.resourceLimit.cpuMillicores<100||
    s.resourceLimit.cpuMillicores>4000||
    !Number.isInteger(s.resourceLimit.memoryMiB)||s.resourceLimit.memoryMiB<128||
    s.resourceLimit.memoryMiB>8192)
   throw new Error('Invalid or unsafe staging workload declaration');
  seen.add(s.name);
 }
 if(!exact(input.backup,['mode','encryption','offsite','restoreEvidenceRef','credentialSource'])||
    input.backup.mode!=='planning-only'||
    input.backup.encryption!=='authenticated-required'||
    input.backup.offsite!=='approval-pending'||
    input.backup.credentialSource!=='managed-reference-only'||
    !/^ref:recovery\/[a-z][a-z-]{2,60}$/.test(input.backup.restoreEvidenceRef))
   throw new Error('Recovery plan cannot be treated as operational backup');
 return {schemaVersion:1,validatedWorkloadDeclarations:seen.size,
   scope:'offline-staging-topology-policy',networkPolicyDeclared:true,
   infrastructureVerified:false,backupVerified:false,artifactVerified:false,
   deploymentAuthorized:false,pilotActivationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Expected one local topology file');
  const result=validateRestrictedStagingTopology(JSON.parse(readFileSync(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch{
  console.error('Restricted staging topology rejected; no infrastructure accessed');
  process.exitCode=2;
 }
}
