#!/usr/bin/env node
// Static plan validation only; no network access, credentials or deployment.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validatePhase6StagingPlan} from './phase6-staging-preflight.mjs';

const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join('|')===[...keys].sort().join('|');
const sha=/^[0-9a-f]{40}$/;
const digest=/^sha256:[0-9a-f]{64}$/;
export function validatePhase6RollbackPlan(input){
 if(!exact(input,['staging','deployment']))throw new Error('Unexpected deployment plan fields');
 const staging=validatePhase6StagingPlan(input.staging);
 const d=input.deployment;
 if(!exact(d,['artifactDigest','sourceCommit','previousArtifactDigest',
  'migrationStrategy','rollbackStrategy','databaseRestoreStrategy',
  'backupEvidenceRef','rollbackOwner','incidentOwner','changeTicket',
  'stagingOnly','externalTrafficEnabled','releaseWindowApproved']))
  throw new Error('Incomplete or unexpected deployment controls');
 if(!digest.test(d.artifactDigest)||d.artifactDigest!==staging.imageDigest||
    !sha.test(d.sourceCommit)||d.sourceCommit!==staging.sourceCommit||
    !digest.test(d.previousArtifactDigest)||
    d.previousArtifactDigest===d.artifactDigest)
  throw new Error('Unpinned or inconsistent rollback artifacts');
 if(d.migrationStrategy!=='forward-only-reviewed'||
    d.rollbackStrategy!=='previous-compatible-image-only'||
    d.databaseRestoreStrategy!=='manual-witnessed-separate'||
    d.stagingOnly!==true||d.externalTrafficEnabled!==false||
    d.releaseWindowApproved!==false)
  throw new Error('Unsafe rollback or activation configuration');
 if(typeof d.changeTicket!=='string'||d.changeTicket!==input.staging.changeTicket||
    typeof d.rollbackOwner!=='string'||!/^[-a-zA-Z0-9 _]{3,80}$/.test(d.rollbackOwner)||
    typeof d.incidentOwner!=='string'||!/^[-a-zA-Z0-9 _]{3,80}$/.test(d.incidentOwner)||
    typeof d.backupEvidenceRef!=='string'||
    !/^ref:[a-z0-9][a-z0-9/_-]{3,100}$/.test(d.backupEvidenceRef))
  throw new Error('Missing accountable owners or safe recovery reference');
 return {schemaVersion:1,scope:'phase6-offline-deployment-safety',
  sourceCommit:staging.sourceCommit,artifactDigest:staging.imageDigest,
  migrationStrategy:d.migrationStrategy,rollbackStrategy:d.rollbackStrategy,
  rollbackEvidenceReferenced:true,externalTrafficEnabled:false,
  deploymentAuthorized:false,productionReleaseAuthorized:false,
  pilotActivationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Expected a single JSON plan');
  process.stdout.write(JSON.stringify(validatePhase6RollbackPlan(
   JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2)+'\n');
 }catch{
  console.error('Unsafe or incomplete deployment/rollback plan; no action taken');
  process.exitCode=2;
 }
}
