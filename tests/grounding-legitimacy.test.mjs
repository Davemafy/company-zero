import assert from 'node:assert/strict';
import http from 'node:http';
import {createCompany,registerProvider} from '../lib/platform-v1.mjs';
import {startOperatingSession,recordObservation} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list,put} from '../lib/store.mjs';
import {verifyOutcomeChange} from '../lib/outcome-verifier.mjs';
import {assessRelevance} from '../lib/grounding.mjs';

const inferred=verifyOutcomeChange({goalContract:{successCriteria:[{metricId:'x',target:5,operator:'>='}]},executionStatus:'completed',observations:[{id:'before',data:{classification:'MODEL_INFERENCE',phase:'baseline',metrics:{x:1},evidenceIds:['model'] }},{id:'after',data:{classification:'MODEL_INFERENCE',phase:'after',metrics:{x:10},evidenceIds:['model']}}]});assert.equal(inferred.outcomeAchieved,false,'model inference became outcome proof');
const dinner=assessRelevance({mission:{id:'mission',goalContract:{desiredState:'Resolve customer support tickets'},evaluationPolicy:{enforceMissionRelevance:true}},job:{data:{source:'operating_session:test',missionVersion:1,payload:{goalContract:{desiredState:'make dinner'},operationPlan:[]}}},organization:{id:'org',data:{}},capabilities:[]});assert.equal(dinner.state,'IRRELEVANT','unrelated work was not rejected by mission relevance');

let calls=0,discoveries=0;
const server=http.createServer(async(req,res)=>{
  if(req.url==='/.well-known/company-zero-capabilities'){discoveries++;res.setHeader('content-type','application/json');return res.end(JSON.stringify({capabilities:[{name:'inspect_unknown_system',endpoint:'/inspect',method:'POST',risk:'read',operationKind:'discover',observes:['system_metadata'],inputSchema:{type:'object'},outputSchema:{type:'object'}}]}))}
  calls++;for await(const _ of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify({metrics:{outcome_metric_1:999},baseline:30,current:10,baselineRef:'baseline-30',currentRef:'current-10',recordId:'external-but-undeclared-metric'}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  const discoveredCompany=await createCompany({name:'Protocol discovery',outcome:'Inspect an unfamiliar permitted system'});
  const discovered=await registerProvider(discoveredCompany.id,{name:'Self describing provider',type:'http',baseUrl});
  assert.equal(discoveries,1);assert.equal(discovered.capabilities.length,1);
  const discoveryEvidence=await list({companyId:discoveredCompany.id,kind:'capability_discovery'});assert.equal(discoveryEvidence.length,1);assert.equal(discoveryEvidence[0].state,'completed');

  const session=await startOperatingSession({goal:'Reach 5 verified units',context:{currentMetrics:{outcome_metric_1:999}},providers:[{name:'Unmeasured provider',type:'http',baseUrl,manifest:{capabilities:[{name:'return_unmapped_numbers',endpoint:'/operate',risk:'read',operationKind:'observe',acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object',required:['metrics','recordId']}}]}}]});
  for(let i=0;i<12&&(await get(session.session.id)).state==='running';i++)await new WorkerService({workerId:`grounding-stage-${i}`}).tick();
  assert.equal((await get(session.session.id)).state,'awaiting_capabilities','unmeasured read-only provider must not be treated as sufficient outcome execution');
  const before=calls;const idle=await new WorkerService({workerId:'grounding-operation'}).tick();assert.equal(idle,null);assert.equal(calls,before,'insufficient capability set reached an external provider');
  const rows=await list({companyId:session.company.id,limit:500});assert.equal(rows.filter(x=>x.kind==='outcome_observation'&&x.data.classification==='EXTERNAL_OBSERVATION').length,0,'undeclared provider metrics became external outcome evidence');
  assert.ok(rows.some(x=>x.kind==='capability_access_request'&&x.state==='open'),'missing action/verification coverage was not surfaced');
  const reported=await recordObservation(session.company.id,{sessionId:session.session.id,phase:'after',metrics:{outcome_metric_1:999},evidenceIds:['user-upload-label-only']});assert.equal(reported.observation.data.classification,'USER_CLAIM');assert.equal(reported.verification.data.outcomeAchieved,false,'user report was promoted into outcome proof');

  const gated=await startOperatingSession({goal:'Keep an arbitrary measured value below 20',providers:[{name:'Relevance provider',type:'http',baseUrl,manifest:{capabilities:[{name:'measure_value',endpoint:'/operate',risk:'read',operationKind:'observe',changes:['outcome_metric_1'],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'},measurements:[{metricId:'outcome_metric_1',path:'$.metrics.outcome_metric_1',phase:'after',externalRefPath:'$.recordId'}]}]}}]});
  for(let i=0;i<12&&(await get(gated.session.id)).state!=='operating';i++)await new WorkerService({workerId:`relevance-stage-${i}`}).tick();
  const gatedRows=await list({companyId:gated.company.id,limit:500}),job=gatedRows.find(x=>x.kind==='job'&&x.data.operatingSessionId===gated.session.id&&!x.data.operation);job.data.payload.goalContract={...job.data.payload.goalContract,desiredState:'A different unrelated outcome'};await put(job,{expectedVersion:job.version});
  const beforeGate=calls,result=await new WorkerService({workerId:'relevance-gate'}).tick();assert.equal(result.run.state,'blocked');assert.equal(calls,beforeGate,'irrelevant work reached an external capability');assert.equal((await get(result.run.data.relevanceId)).data.state,'IRRELEVANT');

  const second=await startOperatingSession({goal:'Keep an arbitrary measured value below 20',providers:[{name:'Second arbitrary measurement',type:'http',baseUrl,manifest:{capabilities:[{name:'observe_unfamiliar_value',endpoint:'/operate',risk:'read',operationKind:'observe',observes:['outcome_metric_1'],changes:['outcome_metric_1'],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object',required:['baseline','current','baselineRef','currentRef']},measurements:[{metricId:'outcome_metric_1',path:'$.baseline',phase:'baseline',externalRefPath:'$.baselineRef'},{metricId:'outcome_metric_1',path:'$.current',phase:'after',externalRefPath:'$.currentRef'}]}]}}]});
  for(let i=0;i<12&&(await get(second.session.id)).state!=='operating';i++)await new WorkerService({workerId:`second-goal-stage-${i}`}).tick();
  const secondResult=await new WorkerService({workerId:'second-goal-operation'}).tick(),secondVerification=await get(secondResult.run.data.outcomeVerificationId);assert.equal(secondVerification.data.outcomeAchieved,true);assert.equal(secondVerification.data.results[0].before,30);assert.equal(secondVerification.data.results[0].after,10);
  console.log('grounding-legitimacy: PASS');
}finally{server.close()}
