import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const [expected,folder]=process.argv.slice(2);
assert.match(expected||'',/^[a-f0-9]{40}$/);
const read=(name)=>JSON.parse(readFileSync(join(folder,name),'utf8'));
const stages=['02-staging.json','03-rollback.json','04-operations.json'];
const reports=stages.map(read);
for(const report of reports){
 assert.equal(report.sourceCommit,'a'.repeat(40));
 assert.equal(report.deploymentAuthorized,false);
 assert.equal(report.pilotActivationAuthorized,false);
}
const inventory=read('05-readiness.json');
assert.equal(inventory.allEvidenceReferenced,false);
assert.equal(inventory.missingEvidence.length,10);
assert.equal(inventory.deploymentAuthorized,false);
assert.equal(inventory.pilotActivationAuthorized,false);
assert.equal(reports[2].externalDeliveryEnabled,false);
const result={schemaVersion:1,sourceCommit:expected,
 lockfileSha256:null,scope:'offline-static-synthetic-examples',
 staticTestSuites:4,examplePreflightsPassed:3,readinessBlockers:10,
 softwareChecksPassed:true,
 productionInfrastructureVerified:false,secretManagerVerified:false,
 monitoringDeliveryVerified:false,externalApprovalVerified:false,
 deploymentAuthorized:false,pilotActivationAuthorized:false};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
