import assert from 'node:assert/strict';
import http from 'node:http';
import {createCompany,registerProvider,synthesize,launch,submitJob,promotion} from '../lib/platform-v1.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  res.setHeader('content-type','application/json');
  if(req.url==='/decide')return res.end(JSON.stringify({caseId:input.caseId,decision:'reject',verificationPass:0}));
  if(req.url==='/verify'){const verificationPass=Number(input.verificationPass||0)+1;return res.end(JSON.stringify({...input,verificationPass,decision:verificationPass>=2?'approve':'reject'}))}
  res.statusCode=404;res.end('{}');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  const company=await createCompany({name:'Unknown Capability Company',outcome:'Return the independently expected decision',metrics:[{id:'decision_contract',evaluator:{type:'expected_field',outputPath:'$.decision',expectedPath:'$.expectedDecision'}}],constraints:{dailyBudgetUsd:10,qualityFloor:.9,latencyLimitMs:30000,governor:{minimumSampleSize:3,recurringFailureCount:3,failureRateThreshold:1}}});
  await registerProvider(company.id,{name:'Unfamiliar Decision Protocol',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[
    {name:'derive_provisional_result',endpoint:'/decide',risk:'read',inputSchema:{type:'object'},outputSchema:{type:'object',required:['decision','verificationPass']},estimatedCost:{type:'fixed',usd:.01}},
    {name:'verify_result_contract',endpoint:'/verify',risk:'read',inputSchema:{type:'object'},outputSchema:{type:'object',required:['decision','verificationPass']},estimatedCost:{type:'fixed',usd:0}}
  ]}});
  const initial=await synthesize(company.id);await launch(company.id,initial.id);
  const production=[];
  for(let i=0;i<3;i++){await submitJob(company.id,{caseId:`case-${i}`,expectedDecision:'approve'});production.push(await new WorkerService({workerId:`production-${i}`}).tick())}
  assert.ok(production.every(x=>x.run.state==='completed'));
  assert.ok(production.every(x=>x.governor));
  assert.equal(production.at(-1).governor.data.action,'RESTRUCTURE');
  const experimentId=production.at(-1).governor.data.remediation.experimentId;assert.ok(experimentId);

  for(let i=0;i<40;i++){const experiment=await get(experimentId);if(['awaiting_decision','promoted'].includes(experiment.state))break;const work=await new WorkerService({workerId:`learning-${i}`}).tick();assert.ok(work,`learning queue drained before experiment completed at step ${i}`)}
  const experiment=await get(experimentId);assert.ok(['awaiting_decision','promoted'].includes(experiment.state));
  assert.equal(experiment.data.results.length,3);assert.ok(experiment.data.results.every(x=>x.requiredCases===3));
  const winner=experiment.data.results.find(x=>x.qualityDelta>0&&x.policyStatus==='PASS');assert.ok(winner,`no candidate produced a real measured improvement: ${JSON.stringify(experiment.data.results)}`);
  const candidate=await get(winner.candidateRevisionId);assert.equal(candidate.data.mutation.type,'AddVerifier');
  assert.equal(winner.qualityDelta,1);assert.equal(winner.costDelta,0);

  if(experiment.state==='awaiting_decision')await promotion(company.id,experimentId,winner.candidateRevisionId);
  const promotedCompany=await get(company.id);assert.equal(promotedCompany.data.activeOrganizationRevisionId,winner.candidateRevisionId);
  assert.equal((await get(initial.id)).state,'retired');
  assert.equal((await list({companyId:company.id,kind:'lesson'})).length,1);

  const next=await submitJob(company.id,{caseId:'post-promotion',expectedDecision:'approve'});assert.equal(next.data.organizationRevisionId,winner.candidateRevisionId);
  const operated=await new WorkerService({workerId:'post-promotion'}).tick();assert.equal(operated.run.data.output.decision,'approve');
  const evaluation=await get(operated.run.data.evaluationId);assert.equal(evaluation.data.passed,true);
  console.log('full-autonomous-lifecycle: PASS');
}finally{server.close()}
