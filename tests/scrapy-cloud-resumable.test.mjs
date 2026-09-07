import assert from 'node:assert/strict';
import http from 'node:http';
import {createCompany,registerProvider,synthesize,launch,submitJob} from '../lib/platform-v1.mjs';
import {createScrapyCloudProvider} from '../lib/scrapy-cloud.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list,put} from '../lib/store.mjs';

let launchCalls=0,pollCalls=0,itemCalls=0,finished=false,remoteTag=null;
const jobId='877155/1/late';
const server=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
  res.setHeader('content-type','application/json');
  if(req.url.startsWith('/api/run.json')){launchCalls++;const body=new URLSearchParams(Buffer.concat(chunks).toString());remoteTag=body.get('add_tag');return res.end(JSON.stringify({status:'ok',jobid:jobId}))}
  if(req.url.startsWith('/api/jobs/list.json')){const url=new URL(req.url,'http://test');if(url.searchParams.has('has_tag'))return res.end(JSON.stringify({status:'ok',jobs:remoteTag?[job()]:[]}));pollCalls++;return res.end(JSON.stringify({status:'ok',jobs:[job()]}))}
  if(req.url.startsWith(`/items/${jobId}`)){itemCalls++;return res.end(JSON.stringify([{source_url:'https://example.com/',observed_at:'2026-09-07T10:00:01Z',status:200,title:'Example',text:'Late grounded result',links:[],content_type:'text/html'}]))}
  res.statusCode=404;res.end('{}');
})});
const job=()=>({id:jobId,tags:[remoteTag],state:finished?'finished':'running',close_reason:finished?'finished':null,items_scraped:finished?1:0,responses_received:finished?1:0,errors_count:0,started_time:'2026-09-07T10:00:00Z',updated_time:finished?'2026-09-07T10:02:01Z':'2026-09-07T10:00:01Z'});

await new Promise(r=>server.listen(0,'127.0.0.1',r));
const saved=Object.fromEntries(['SCRAPY_CLOUD_API_KEY','SCRAPY_CLOUD_PROJECT_ID','SCRAPY_CLOUD_RUN_URL','SCRAPY_CLOUD_JOBS_URL','SCRAPY_CLOUD_ITEMS_BASE_URL','SCRAPY_CLOUD_POLL_WINDOW_MS','SCRAPY_CLOUD_POLL_MS'].map(k=>[k,process.env[k]]));
try{
  const base=`http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env,{SCRAPY_CLOUD_API_KEY:'test-key',SCRAPY_CLOUD_PROJECT_ID:'877155',SCRAPY_CLOUD_RUN_URL:`${base}/api/run.json`,SCRAPY_CLOUD_JOBS_URL:`${base}/api/jobs/list.json`,SCRAPY_CLOUD_ITEMS_BASE_URL:`${base}/items/`,SCRAPY_CLOUD_POLL_WINDOW_MS:'10',SCRAPY_CLOUD_POLL_MS:'1'});
  const company=await createCompany({name:'Resumable Scrapy',outcome:'Record public page content',metrics:[{id:'completed',source:'run.status',operator:'=',target:'completed'}],constraints:{dailyBudgetUsd:1}});
  const registered=await registerProvider(company.id,createScrapyCloudProvider());const capability=registered.capabilities[0];
  const organization=await synthesize(company.id);await launch(company.id,organization.id);
  const selectionId=crypto.randomUUID(),plan={id:crypto.randomUUID(),company_id:company.id,kind:'operation_plan',state:'validated',version:0,data:{missionVersion:1,strategySelectionId:selectionId,organizationRevisionId:organization.id,operations:[{capabilityId:capability.id,args:{url:'https://example.com',maxPages:1},strategySelectionId:selectionId,purpose:'Observe the public page'}]},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};await put(plan);
  const queued=await submitJob(company.id,{goalContract:{desiredState:'Record public page content'},strategySelectionId:selectionId,operationPlanId:plan.id,operationPlan:plan.data.operations},{idempotencyKey:'late-scrapy-operation',source:'resumable-regression'});
  queued.data.operatingSessionId=crypto.randomUUID();await put(queued,{expectedVersion:queued.version});

  const first=await new WorkerService({workerId:'scrapy-first-window'}).tick();
  assert.equal(first.error,'scrapy_cloud_job_still_running',JSON.stringify(first));assert.equal(first.queue.state,'retry_scheduled');assert.equal(launchCalls,1);
  let invocation=(await list({companyId:company.id,kind:'invocation',limit:10}))[0];
  assert.equal(invocation.state,'dispatched');assert.equal(invocation.data.output.remoteJobId,jobId);assert.ok(invocation.data.output.remoteJobTag);

  finished=true;let queue=await get(first.queue.id);queue.data.availableAt=new Date(0).toISOString();await put(queue,{expectedVersion:queue.version});
  const second=await new WorkerService({workerId:'scrapy-resume-window'}).tick();
  assert.equal(second.run.state,'completed');assert.equal(launchCalls,1,'poll retry launched a duplicate Scrapy job');assert.ok(pollCalls>=2);assert.equal(itemCalls,1);
  invocation=(await list({companyId:company.id,kind:'invocation',limit:10}))[0];assert.equal(invocation.state,'confirmed');
  const observations=await list({companyId:company.id,kind:'external_observation',limit:10});assert.equal(observations.length,1);assert.equal(observations[0].data.classification,'EXTERNAL_OBSERVATION');assert.equal(observations[0].data.responseMetadata.responseMetadata.jobId,jobId);assert.equal(observations[0].data.extractedObservation.text,'Late grounded result');
  assert.equal((await list({companyId:company.id,kind:'world_fact',limit:10})).filter(x=>x.data.classification==='EXTERNAL_OBSERVATION').length,1);
  const {invokeScrapyCloudCapability}=await import('../lib/scrapy-cloud.mjs');const beforeRecoveryLaunches=launchCalls;await invokeScrapyCloudCapability(capability.data,{url:'https://example.com'},{executionState:{remoteJobTag:remoteTag},pollWindowMs:10});assert.equal(launchCalls,beforeRecoveryLaunches,'tag recovery relaunched work after losing the launch response');
  console.log('scrapy-cloud-resumable: PASS');
}finally{
  server.close();for(const [key,value] of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
}
