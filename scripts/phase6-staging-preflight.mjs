#!/usr/bin/env node
// Offline preflight only. Never connects, mutates infrastructure, or authorizes deployment.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const sha=/^[a-f0-9]{40}$/;
const digest=/^sha256:[a-f0-9]{64}$/;
const host=/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.(?!-)[a-z0-9-]+)+$/;
const fields=['environment','sourceCommit','imageDigest','region','ingressHostname',
 'databaseNetwork','identityMode','databaseMode','outboundNotifications',
 'livePayments','clinicalWorkflows','publicIngress','secretReferences',
 'operator','changeTicket'];
export function validatePhase6StagingPlan(plan){
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||
    Object.keys(plan).sort().join('|')!==[...fields].sort().join('|'))
  throw new Error('Staging plan must use exact reviewed fields');
 if(plan.environment!=='restricted-synthetic-staging'||
    !sha.test(plan.sourceCommit)||!digest.test(plan.imageDigest))
  throw new Error('Staging identity and immutable artifacts required');
 if(typeof plan.region!=='string'||!/^[-a-z0-9]{3,48}$/.test(plan.region)||
    typeof plan.ingressHostname!=='string'||
    !host.test(plan.ingressHostname)||!plan.ingressHostname.endsWith('.test'))
  throw new Error('Staging domain/region must be explicitly synthetic');
 if(plan.databaseNetwork!=='private-only'||
    plan.identityMode!=='sandbox-only'||plan.databaseMode!=='synthetic-only'||
    plan.outboundNotifications!==false||plan.livePayments!==false||
    plan.clinicalWorkflows!==false||plan.publicIngress!==false)
  throw new Error('Staging isolation or external activation boundary violated');
 if(!Array.isArray(plan.secretReferences)||plan.secretReferences.length===0||
    plan.secretReferences.length>30||new Set(plan.secretReferences).size!==plan.secretReferences.length||
    plan.secretReferences.some(x=>typeof x!=='string'||
       !/^ref:[a-z0-9][a-z0-9/_-]{3,100}$/.test(x)))
  throw new Error('Only unique non-sensitive secret reference identifiers accepted');
 if(typeof plan.operator!=='string'||!/^[-a-zA-Z0-9 _]{3,80}$/.test(plan.operator)||
    typeof plan.changeTicket!=='string'||!/^[-A-Z0-9]{4,50}$/.test(plan.changeTicket))
  throw new Error('Named operator and change identifier required');
 return {schemaVersion:1,scope:'offline-synthetic-staging-preflight',
  sourceCommit:plan.sourceCommit,imageDigest:plan.imageDigest,
  isolationValidated:true,secretReferencesCount:plan.secretReferences.length,
  deploymentAuthorized:false,productionReady:false,pilotActivationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('Expected one plan file');
  const report=validatePhase6StagingPlan(JSON.parse(readFileSync(process.argv[2],'utf8')));
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  console.error('Restricted staging preflight refused; no deployment attempted');
  process.exitCode=2;
 }
}
