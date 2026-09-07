import assert from 'node:assert/strict';
import http from 'node:http';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';
import {assessCapabilitySufficiency} from '../lib/grounding.mjs';

let latency=180,measureCalls=0,changeCalls=0;
const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const input=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  res.setHeader('content-type','application/json');
  if(req.url==='/measure'){measureCalls++;return res.end(JSON.stringify({phase:input.phase||'observation',metrics:{outcome_metric_1:latency},sourceUrl:'http://test.invalid',observedAt:new Date().toISOString(),recordId:`measure-${measureCalls}`}))}
  if(req.url==='/change'){changeCalls++;latency=80;return res.end(JSON.stringify({changed:true,revision:`rev-${changeCalls}`}))}
  res.statusCode=404;res.end('{}');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  const session=await startOperatingSession({
    goal:'Improve webpage latency below 100 ms',
    context:{operationPlan:[
      {capabilityName:'measure_webpage_latency',args:{phase:'baseline'},purpose:'Record independent baseline.'},
      {capabilityName:'change_webpage_state',args:{target:'latency'},purpose:'Apply one bounded reversible change.'},
      {capabilityName:'measure_webpage_latency',args:{phase:'after'},purpose:'Independently verify the deployed result.'}
    ]},
    providers:[{name:'Production-shaped webpage control',type:'http',baseUrl,manifest:{capabilities:[
      {name:'measure_webpage_latency',endpoint:'/measure',method:'POST',risk:'read',operationKind:'verify',stateDomains:['software.webpage'],observes:['software.webpage.performance'],inputSchema:{type:'object',required:['phase'],properties:{phase:{type:'string'}}},outputSchema:{type:'object'},measurements:[{metricId:'outcome_metric_1',path:'$.metrics.outcome_metric_1',phase:'observation',externalRefPath:'$.recordId',observedAtPath:'$.observedAt'}]},
      {name:'change_webpage_state',endpoint:'/change',method:'POST',risk:'read',operationKind:'change',stateDomains:['software.webpage'],changes:['software.webpage.performance'],inputSchema:{type:'object'},outputSchema:{type:'object'}}
    ]}}]
  });
  for(let i=0;i<20&&(await get(session.session.id)).state!=='operating';i++)await new WorkerService({workerId:`e2e-stage-${i}`}).tick();
  assert.equal((await get(session.session.id)).state,'operating');
  const result=await new WorkerService({workerId:'e2e-operation'}).tick();
  assert.equal(result.run.state,'completed');
  assert.equal(measureCalls,2,'same verification capability must run twice, baseline and after');
  assert.equal(changeCalls,1,'bounded external change must execute exactly once');
  const rows=await list({companyId:session.company.id,limit:2000});
  const obs=rows.filter(x=>x.kind==='outcome_observation'&&x.data.classification==='EXTERNAL_OBSERVATION');
  assert.equal(obs.length,2);assert.deepEqual([...obs].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(x=>x.data.phase),['baseline','after']);
  const verification=await get(result.run.data.outcomeVerificationId);assert.equal(verification.data.outcomeAchieved,true);assert.equal(verification.data.results[0].before,180);assert.equal(verification.data.results[0].after,80);
  assert.equal(result.governor.data.action,'OUTCOME_ACHIEVED');

  const unrelated=assessCapabilitySufficiency({desiredState:'Get five serious clients',successCriteria:[{metricId:'clients',description:'Five serious clients',target:5}]},[
    {id:'weather',data:{name:'change_weather_station_temperature',description:'Change a weather station',operationKind:'change',changes:['weather.temperature'],stateDomains:['weather'],measurements:[]}},
    {id:'client-observe',data:{name:'observe_client_market',description:'Observe client market',operationKind:'observe',observes:['client.market'],stateDomains:['client'],measurements:[]}},
    {id:'client-verify',data:{name:'verify_clients',description:'Verify acquired clients',operationKind:'verify',observes:['client.acquisition'],stateDomains:['client'],measurements:[{metricId:'clients',path:'$.clients'}]}}
  ]);
  assert.equal(unrelated.sufficient,false);assert.ok(unrelated.missing.some(x=>x.kind==='act'),'unrelated change capability incorrectly satisfied action requirement');
  console.log('end-to-end-completion: PASS');
}finally{server.close()}
