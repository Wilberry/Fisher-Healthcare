#!/usr/bin/env node
// Offline readiness contract, not a secret manager or notification dispatcher.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validatePhase6RollbackPlan} from './phase6-rollback-preflight.mjs';
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).sort().join('|')===[...keys].sort().join('|');
const ref=/^ref:[a-z0-9][a-z0-9/_-]{3,100}$/;
const person=/^[-a-zA-Z0-9 _]{3,80}$/;
const signalNames=['api_unavailable','db_connection_failure','queue_dead_letters',
 'unauthorized_access_spike','restore_integrity_failure'];
export function validatePhase6OperationsPlan(input){
 if(!exact(input,['deploymentPlan','secretLifecycle','monitoring']))
  throw new Error('Unknown or missing operations plan sections');
 const deployment=validatePhase6RollbackPlan(input.deploymentPlan);
 const secrets=input.secretLifecycle;
 if(!exact(secrets,['manager','references','rotationOwner','rotationProcedureRef',
  'emergencyRevocationRef','auditLogging'])||
  secrets.manager!=='externally-managed-reference-only'||
  !person.test(secrets.rotationOwner)||
  !ref.test(secrets.rotationProcedureRef)||
  !ref.test(secrets.emergencyRevocationRef)||
  secrets.auditLogging!==true||!Array.isArray(secrets.references))
  throw new Error('Secret lifecycle evidence missing');
 const required=input.deploymentPlan.staging.secretReferences;
 if(secrets.references.length!==required.length||
   new Set(secrets.references).size!==required.length||
   secrets.references.some(x=>!ref.test(x))||
   required.some(x=>!secrets.references.includes(x)))
  throw new Error('Secret references do not match staging manifest');
 const monitoring=input.monitoring;
 if(!exact(monitoring,['mode','externalDeliveryEnabled','owner','escalationRef','signals'])||
  monitoring.mode!=='offline-synthetic-review'||
  monitoring.externalDeliveryEnabled!==false||
  !person.test(monitoring.owner)||!ref.test(monitoring.escalationRef)||
  !Array.isArray(monitoring.signals)||monitoring.signals.length!==signalNames.length)
  throw new Error('Monitoring contract incomplete');
 const seen=new Set();
 for(const signal of monitoring.signals){
  if(!exact(signal,['name','severity','playbookRef','owner'])||
    !signalNames.includes(signal.name)||seen.has(signal.name)||
    !['warning','critical'].includes(signal.severity)||
    !person.test(signal.owner)||!ref.test(signal.playbookRef))
   throw new Error('Unknown or unowned monitoring signal');
  seen.add(signal.name);
 }
 return {schemaVersion:1,scope:'phase6-offline-operations-review',
  sourceCommit:deployment.sourceCommit,monitoringSignalCount:seen.size,
  secretsReferenced:secrets.references.length,
  monitoringOwnerRecorded:true,secretRotationOwnerRecorded:true,
  externalDeliveryEnabled:false,secretsVerified:false,
  notificationsTested:false,deploymentAuthorized:false,
  pilotActivationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Expected one local JSON plan');
  process.stdout.write(JSON.stringify(validatePhase6OperationsPlan(
   JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2)+'\n');
 }catch{
  console.error('Phase 6 operational preflight refused; no external action taken');
  process.exitCode=2;
 }
}
