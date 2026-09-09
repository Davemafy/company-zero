import assert from 'node:assert/strict';
import http from 'node:http';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

let metric=180,measureCalls=0,changeCalls=0;
const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');res.setHeader('content-type','application/json');
  if(req.url==='/measure'){measureCalls++;return res.end(JSON.stringify({phase:body.phase||'observation',metrics:{outcome_metric_1:metric},sourceUrl:'http://fixture.invalid',observedAt:new Date().toISOString(),recordId:`m-${measureCalls}`}))}
  if(req.url==='/change'){changeCalls++;metric=80;return res.end(JSON.stringify({changed:true,externalRef:`change-${changeCalls}`}))}
  res.statusCode=404;res.end('{}');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const baseUrl=`http://127.0.0.1:${server.address().port}`;
  const started=await startOperatingSession({goal:'Improve webpage latency below 100 ms',context:{operationPlan:[
    {capabilityName:'measure_webpage_latency',args:{phase:'baseline'},purpose:'Measure baseline'},
    {capabilityName:'change_webpage_state',args:{},purpose:'Apply bounded change'},
    {capabilityName:'measure_webpage_latency',args:{phase:'after'},purpose:'Verify result'}
  ]},providers:[{name:'Outcome control fixture',type:'http',baseUrl,manifest:{capabilities:[
    {name:'measure_webpage_latency',endpoint:'/measure',method:'POST',risk:'read',operationKind:'verify',stateDomains:['software.webpage','latency'],observes:['software.webpage.performance'],inputSchema:{type:'object',required:['phase'],properties:{phase:{type:'string'}}},outputSchema:{type:'object'},measurements:[{metricId:'outcome_metric_1',path:'$.metrics.outcome_metric_1',phase:'observation',externalRefPath:'$.recordId',observedAtPath:'$.observedAt'}]},
    {name:'change_webpage_state',endpoint:'/change',method:'POST',risk:'read',operationKind:'change',stateDomains:['software.webpage','latency'],changes:['software.webpage.performance'],inputSchema:{type:'object'},outputSchema:{type:'object'}}
  ]}}]});
  for(let i=0;i<30&&(await get(started.session.id)).state!=='operating';i++)await new WorkerService({workerId:`oc-stage-${i}`}).tick();
  assert.equal((await get(started.session.id)).state,'operating');
  const result=await new WorkerService({workerId:'oc-run'}).tick();assert.equal(result.run.state,'completed');
  const rows=await list({companyId:started.company.id,limit:5000}),graph=rows.find(x=>x.kind==='deliverable_graph');assert.ok(graph,'deliverable graph missing');
  const ds=rows.filter(x=>x.kind==='deliverable'&&x.data.graphId===graph.id),byKey=new Map(ds.map(x=>[x.data.key,x]));
  assert.ok(byKey.get('baseline').data.evidenceIds.length,'baseline lacks evidence');
  assert.ok(byKey.get('execute').data.evidenceIds.length,'action deliverable lacks evidence');
  assert.ok(byKey.get('verify').data.evidenceIds.length,'verification deliverable lacks evidence');
  assert.ok(['verified','observed','evaluated'].includes(byKey.get('baseline').state));
  assert.equal(byKey.get('execute').state,'executed');
  assert.equal(byKey.get('verify').state,'verified');
  const events=rows.filter(x=>x.kind==='runtime_event');assert.ok(events.some(x=>x.data.type==='DELIVERABLE_GRAPH_CREATED'));assert.ok(events.some(x=>x.data.type==='RUN_EVALUATED'));
  const plan=rows.find(x=>x.kind==='operation_plan');assert.ok(plan.data.operations.every(x=>x.deliverableId),'every operation must link to a deliverable');
  assert.equal(measureCalls,2);assert.equal(changeCalls,1);
  console.log('outcome-control-e2e: PASS');
}finally{server.close()}
