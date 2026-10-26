import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const sha=/^[0-9a-f]{40}$/;
function lineEquals(body,value){
 if(typeof body!=='string')return false;
 const prefix=value.slice(0,value.indexOf(':')+1);
 const entries=body.split(/\r?\n/).filter(line=>line.startsWith(prefix));
 return entries.length===1&&entries[0]===value;
}
export function buildSyntheticAcceptanceEvidence(input){
 const {commit,coreSummary,restoreSummary,restoreEvidence,probe,smokeSummary,lockfileSha256}=input;
 if(typeof commit!=='string'||!sha.test(commit))
  throw new Error('Invalid pinned source commit');
 if(!lineEquals(coreSummary,'Result: PASS')||
    !lineEquals(coreSummary,'Commit: '+commit)||
    !lineEquals(coreSummary,'Final acceptance: PASS')||
    !lineEquals(coreSummary,'Production dependency audit: PASS')||
    !lineEquals(coreSummary,'Full dependency audit: PASS'))
  throw new Error('Incomplete or mismatched core acceptance');
 if(!lineEquals(restoreSummary,'Result: PASS')||
    !lineEquals(restoreSummary,'Commit: '+commit)||
    !lineEquals(restoreSummary,'Docker container removed: YES'))
  throw new Error('Restoration or scoped cleanup not proven');
 for(const evidence of [
  'Synthetic restore marker matched: YES',
  'Backup encrypted with AES-256-GCM and ephemeral key: YES',
  'Plaintext archive written to disk: NO'
 ]){
  if(!lineEquals(restoreEvidence,evidence))
   throw new Error('Incomplete authenticated restore evidence');
 }
 const rows=restoreEvidence.split(/\r?\n/)
  .filter(v=>v.startsWith('Migration registry rows matched: '));
 if(rows.length!==1||!/^[0-9]+$/.test(rows[0].slice(33))||
    Number(rows[0].slice(33))<36)
  throw new Error('Migration count below Phase 5 baseline');
 if(!probe||probe.mode!=='disposable-loopback-only'||
    probe.pilotAuthorized!==false||probe.latencyIsAnApprovedSla!==false||
    probe.healthyResponses!==10||probe.unauthorizedResponses!==10||
    probe.count!==20||!Number.isFinite(probe.p95Ms)||
    !Number.isFinite(probe.maxMs)||probe.p95Ms<0||probe.maxMs<probe.p95Ms)
  throw new Error('Incomplete synthetic denied-access probe');
 if(!lineEquals(smokeSummary,'Result: PASS')||
    !lineEquals(smokeSummary,'Commit: '+commit)||
    !lineEquals(smokeSummary,'API denied-access checks: PASS')||
    !lineEquals(smokeSummary,'Web origin checks: PASS'))
  throw new Error('Phase 5 API/UI smoke not accepted');
 if(typeof lockfileSha256!=='string'||!/^[0-9a-f]{64}$/.test(lockfileSha256)||
    !lineEquals(coreSummary,'Lockfile: '+lockfileSha256)||
    !lineEquals(coreSummary,'Lockfile committed at tested revision: yes'))
  throw new Error('Pinned dependency lockfile not proven');
 return {
  schemaVersion:2,commit,lockfileSha256,engineeringSyntheticAcceptance:'PASS',
  coreQualityChecks:'PASS',securityAuditGates:'PASS',
  disposableMigrationsRestored:Number(rows[0].slice(33)),
  encryptedRecoveryAndCleanup:'PASS',apiAndWebSmoke:'PASS',
  boundedProbe:{requestCount:probe.count,p95Ms:probe.p95Ms,maxMs:probe.maxMs},
  sensitiveInformationIncluded:false,
  externalPagingEnabled:false,
  clinicalSignoffRecorded:false,privacySignoffRecorded:false,
  productionReleaseAuthorized:false,pilotActivationAuthorized:false,
  mergePerformed:false
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.FISHER_PHASE5_LOCAL_ACK!=='synthetic-only')
   throw new Error('Synthetic acceptance only');
  if(process.argv.length!==9)
   throw new Error('Usage: commit core restore evidence probe smoke lockfile-sha256');
  const [commit,core,restore,restoreEvidence,probe,smoke,lockfileSha256]=process.argv.slice(2);
  const read=path=>readFileSync(path,'utf8');
  const report=buildSyntheticAcceptanceEvidence({
   commit,coreSummary:read(core),restoreSummary:read(restore),
   restoreEvidence:read(restoreEvidence),probe:JSON.parse(read(probe)),
   smokeSummary:read(smoke),lockfileSha256
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch{
  console.error('Phase 5 acceptance evidence was not independently coherent');
  process.exitCode=2;
 }
}
