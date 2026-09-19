import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
process.env.CZ_STORE_MODE='memory';
const {put,get}=await import('../lib/store.mjs');
const {syncArtifactMetadata}=await import('../lib/mission-service.mjs');

const now=new Date().toISOString(),companyId=crypto.randomUUID(),sessionId=crypto.randomUUID(),contractId=crypto.randomUUID(),readyArtifactId=crypto.randomUUID(),partialArtifactId=crypto.randomUUID();
let session={id:sessionId,company_id:companyId,kind:'operating_session',state:'running',version:0,data:{goal:'make a food brand',state:'running',currentStage:'first_value'},created_at:now,updated_at:now};
let contract={id:contractId,company_id:companyId,kind:'deliverable_contract',state:'building',version:0,data:{sessionId,status:'building',latestVersion:0,completedArtifactKeys:[]},created_at:now,updated_at:now};
session=await put(session);contract=await put(contract);

const readyArtifact={id:readyArtifactId,company_id:companyId,kind:'artifact',state:'ready',version:0,data:{sessionId,readiness:'READY',deliverableVersion:1},created_at:now,updated_at:now};
const partialArtifact={id:partialArtifactId,company_id:companyId,kind:'artifact',state:'partial',version:0,data:{sessionId,readiness:'PARTIAL',deliverableVersion:1},created_at:now,updated_at:now};

await Promise.all([
  syncArtifactMetadata({contractId,sessionId,artifact:readyArtifact,jobId:'ready-job',evidenceCount:0,ready:true}),
  (async()=>{await new Promise(r=>setTimeout(r,0));return syncArtifactMetadata({contractId,sessionId,artifact:partialArtifact,jobId:'partial-job',evidenceCount:0,ready:false})})()
]);

const finalContract=await get(contractId),finalSession=await get(sessionId);
assert.equal(finalContract.state,'ready','PARTIAL metadata must never downgrade a READY contract');
assert.equal(finalContract.data.readiness,'READY');
assert.equal(finalContract.data.latestArtifactId,readyArtifactId);
assert.equal(finalSession.data.readiness,'READY','PARTIAL metadata must never downgrade a READY session');
assert.equal(finalSession.data.latestArtifactId,readyArtifactId);
assert.equal(finalSession.data.resultQuality,'ready');
console.log('persistence-monotonicity: PASS');
