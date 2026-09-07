import assert from 'node:assert/strict';
import http from 'node:http';
import {startOperatingSession,advanceOperatingSession,converse} from '../lib/universal.mjs';
import {registerProvider} from '../lib/platform-v1.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

const blocked=await startOperatingSession({goal:'Improve a measurable external outcome without unsafe assumptions'});
assert.equal(blocked.session.state,'running');
for(let i=0;i<8&&(await get(blocked.session.id)).state!=='awaiting_capabilities';i++)await new WorkerService({workerId:`blocked-stage-${i}`}).tick();
const blockedRecords=await list({companyId:blocked.company.id,limit:100});
assert.equal((await get(blocked.session.id)).state,'awaiting_capabilities');
assert.equal(blockedRecords.filter(x=>x.kind==='capability_access_request').length,1);
assert.equal(blockedRecords.filter(x=>x.kind==='job'&&x.data.operation!=='advance_operating_session').length,0);

const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);res.setHeader('content-type','application/json');res.end(JSON.stringify({baseline:0,current:5,baselineRecordId:'external-baseline-1',currentRecordId:'external-current-5'}))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const session=await startOperatingSession({goal:'Get 5 verified results',context:{currentMetrics:{outcome_metric_1:0}},providers:[{name:'Arbitrary Outcome System',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[{name:'pursue_and_observe',description:'Act on the supplied goal and return externally referenced measurements',endpoint:'/operate',method:'POST',risk:'read',operationKind:'observe',observes:['outcome_metric_1'],changes:['outcome_metric_1'],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object',required:['baseline','current','baselineRecordId','currentRecordId']},measurements:[{metricId:'outcome_metric_1',path:'$.baseline',phase:'baseline',externalRefPath:'$.baselineRecordId'},{metricId:'outcome_metric_1',path:'$.current',phase:'after',externalRefPath:'$.currentRecordId'}],estimatedCost:{type:'fixed',usd:.01}}]}}]});
  assert.equal(session.session.state,'running');
  for(let i=0;i<12&&(await get(session.session.id)).state!=='operating';i++)await new WorkerService({workerId:`universal-stage-${i}`}).tick();
  const ready=await list({companyId:session.company.id,limit:200});
  assert.equal((await get(session.session.id)).state,'operating');
  assert.ok(ready.some(x=>x.kind==='world_model'));
  assert.equal(ready.filter(x=>x.kind==='strategy_option').length,3);
  assert.ok(ready.some(x=>x.kind==='strategy_selection'));
  assert.ok(ready.some(x=>x.kind==='organization_revision'&&x.state==='production'));
  const worked=await new WorkerService({workerId:'universal-worker'}).tick();assert.equal(worked.run.state,'completed');
  const verification=await get(worked.run.data.outcomeVerificationId);assert.equal(verification.data.executionSucceeded,true);assert.equal(verification.data.outcomeAchieved,true);assert.equal(verification.data.results[0].before,0);assert.equal(verification.data.results[0].after,5);
  const corrected=await converse(session.company.id,session.session.id,"Don't perform external side effects without asking me first.");assert.equal(corrected.change.authorityPatch.externalSideEffects,'approval_required');
  const missions=await list({companyId:session.company.id,kind:'mission',limit:20});assert.equal(missions.filter(x=>x.state==='active').length,1);assert.ok(missions.some(x=>x.state==='superseded'));
  const beforeReplan=(await list({companyId:session.company.id,kind:'organization_revision',limit:20})).find(x=>x.state==='production');
  const retargeted=await converse(session.company.id,session.session.id,'Change the target to 10.');assert.equal(retargeted.change.requiresReplan,true);
  const replanned=await new WorkerService({workerId:'conversation-replan-worker'}).tick();assert.ok(replanned.session);
  const afterReplan=await list({companyId:session.company.id,limit:300});
  const newProduction=afterReplan.find(x=>x.kind==='organization_revision'&&x.state==='production');assert.notEqual(newProduction.id,beforeReplan.id);
  const historical=afterReplan.find(x=>x.id===beforeReplan.id);assert.equal(historical.state,'retired');assert.equal(historical.data.status,'production');
  assert.ok(afterReplan.some(x=>x.kind==='job'&&x.data.organizationRevisionId===newProduction.id&&x.data.operatingSessionId===session.session.id));
  console.log('universal-operating-interface: PASS');
}finally{server.close()}
