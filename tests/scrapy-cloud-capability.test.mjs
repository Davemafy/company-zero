import assert from 'node:assert/strict';
import http from 'node:http';
import {createScrapyCloudProvider,invokeScrapyCloudCapability} from '../lib/scrapy-cloud.mjs';
import {normalizeProviderInput,normalizeCapability,invokeHttpCapability} from '../lib/capabilities.mjs';

let runCalls=0,jobCalls=0,itemCalls=0,lastRunBody='';
const server=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{const body=Buffer.concat(chunks).toString();res.setHeader('content-type','application/json');if(req.url.startsWith('/api/run.json')){runCalls++;lastRunBody=body;res.end(JSON.stringify({status:'ok',jobid:'877155/1/42'}));return}if(req.url.startsWith('/api/jobs/list.json')){jobCalls++;res.end(JSON.stringify({status:'ok',jobs:[{id:'877155/1/42',state:'finished',close_reason:'finished',items_scraped:1,responses_received:1,errors_count:0,started_time:'2026-09-07T10:00:00Z',updated_time:'2026-09-07T10:00:01Z'}]}));return}if(req.url.startsWith('/items/877155/1/42')){itemCalls++;res.end(JSON.stringify([{source_url:'https://example.com/',observed_at:'2026-09-07T10:00:01Z',status:200,title:'Example',text:'Grounded public text',links:['https://example.com/a'],content_type:'text/html'}]));return}res.statusCode=404;res.end('{}')})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const port=server.address().port;process.env.SCRAPY_CLOUD_API_KEY='test-key';process.env.SCRAPY_CLOUD_PROJECT_ID='877155';process.env.SCRAPY_CLOUD_RUN_URL=`http://127.0.0.1:${port}/api/run.json`;process.env.SCRAPY_CLOUD_JOBS_URL=`http://127.0.0.1:${port}/api/jobs/list.json`;process.env.SCRAPY_CLOUD_ITEMS_BASE_URL=`http://127.0.0.1:${port}/items/`;
  const def=createScrapyCloudProvider(),provider=normalizeProviderInput(def),cap=normalizeCapability('provider-test',def.manifest.capabilities[0]);
  assert.equal(provider.adapter,'scrapy-cloud');assert.equal(cap.risk,'read');assert.equal(cap.operationKind,'observe');
  const result=await invokeScrapyCloudCapability(cap,{url:'https://example.com/',maxPages:2});
  assert.equal(result.output.content.title,'Example');assert.equal(result.output.responseMetadata.provider,'scrapy-cloud');assert.equal(result.output.responseMetadata.jobId,'877155/1/42');assert.match(lastRunBody,/project=877155/);assert.match(lastRunBody,/spider=generic_observer/);assert.match(lastRunBody,/max_pages=2/);assert.equal(runCalls,1);assert.equal(jobCalls,1);assert.equal(itemCalls,1);
  const viaGeneric=await invokeHttpCapability(cap,{...provider,adapter:'scrapy-cloud'},{url:'https://example.com/'});assert.equal(viaGeneric.output.content.text,'Grounded public text');
  await assert.rejects(()=>invokeScrapyCloudCapability(cap,{url:'https://example.com/',allowedDomains:['other.example']}),/target_outside_allowed_domains/);
  delete process.env.SCRAPY_CLOUD_API_KEY;await assert.rejects(()=>invokeScrapyCloudCapability(cap,{url:'https://example.com/'}),/scrapy_cloud_credentials_not_configured/);
  console.log('scrapy-cloud-capability: PASS');
}finally{server.close();for(const k of ['SCRAPY_CLOUD_API_KEY','SCRAPY_CLOUD_PROJECT_ID','SCRAPY_CLOUD_RUN_URL','SCRAPY_CLOUD_JOBS_URL','SCRAPY_CLOUD_ITEMS_BASE_URL'])delete process.env[k]}
