import assert from 'node:assert/strict';
import http from 'node:http';
import {createCompany,registerProvider,synthesize,launch,submitJob} from '../lib/platform-v1.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {governProductionRun} from '../lib/governor-service.mjs';
import {list,get} from '../lib/store.mjs';

const server=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify({decision:'reject'}))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const company=await createCompany({name:'Governor convergence',outcome:'Meet an independently checked contract',metrics:[{id:'decision',evaluator:{type:'expected_field',outputPath:'$.decision',expectedPath:'$.expectedDecision'}}],constraints:{dailyBudgetUsd:10,governor:{minimumSampleSize:3,recurringFailureCount:2,failureRateThreshold:.66}}});
  await registerProvider(company.id,{name:'Evaluator input',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[{name:'decide',endpoint:'/decide',risk:'read',inputSchema:{type:'object'},outputSchema:{type:'object'},estimatedCost:{type:'fixed',usd:.01}}]}});
  const org=await synthesize(company.id);await launch(company.id,org.id);
  const outcomes=[];
  for(let i=0;i<3;i++){await submitJob(company.id,{case:i,expectedDecision:'approve'});outcomes.push(await new WorkerService({workerId:`governor-${i}`}).tick())}
  assert.equal(outcomes[0].governor.data.action,'CONTINUE');
  assert.equal(outcomes[2].governor.data.action,'RESTRUCTURE');
  const lastRun=outcomes[2].run.id;
  await Promise.all([governProductionRun(company.id,lastRun),governProductionRun(company.id,lastRun),governProductionRun(company.id,lastRun)]);
  const datasets=await list({companyId:company.id,kind:'experiment_dataset',limit:20}),experiments=await list({companyId:company.id,kind:'experiment',limit:20}),diagnoses=await list({companyId:company.id,kind:'diagnosis',limit:20});
  assert.equal(datasets.length,1,'dedupe must create one frozen dataset');
  assert.equal(experiments.length,1,'dedupe must create one remediation experiment');
  assert.equal(diagnoses.length,1,'dedupe must create one diagnosis');
  assert.deepEqual(new Set(datasets[0].data.sourceJobIds),new Set(outcomes.map(x=>x.run.data.jobId)));
  assert.equal((await get(experiments[0].id)).data.datasetId,datasets[0].id);
  console.log('control-plane-convergence: PASS');
}finally{server.close()}
