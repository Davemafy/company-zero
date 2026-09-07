import {list} from '../lib/store.mjs';

// Read-only verification of durable runtime evidence and its matching Scrapy job.
const companyId=process.argv[2];
if(!companyId)throw Error('company_id_required');
const rows=await list({companyId,limit:3000});
const kinds=kind=>rows.filter(x=>x.kind===kind);
const providers=kinds('capability_provider');
const caps=kinds('capability');
const observations=kinds('external_observation');
const summary={
  checkedAt:new Date().toISOString(),companyId,
  sessions:kinds('operating_session').map(x=>({id:x.id,state:x.state,...x.data})),
  providers:providers.map(x=>({id:x.id,adapter:x.data.adapter})),
  capabilities:caps.map(x=>({id:x.id,name:x.data.name,providerId:x.data.providerId})),
  worlds:kinds('world_model').map(x=>({id:x.id,capabilities:x.data.capabilities,factCounts:x.data.factCounts})),
  strategies:kinds('strategy_selection').map(x=>({id:x.id,state:x.state,requiredCapabilityIds:x.data.requiredCapabilityIds})),
  plans:kinds('operation_plan').map(x=>({id:x.id,state:x.state,...x.data})),
  runs:kinds('run').map(x=>({id:x.id,state:x.state,jobId:x.data.jobId,traceIds:x.data.traceIds})),
  traces:kinds('trace').map(x=>({id:x.id,state:x.state,capabilityId:x.data.capabilityId,error:x.data.error,responseMetadata:x.data.responseMetadata})),
  observations:observations.map(x=>({id:x.id,classification:x.data.classification,capabilityId:x.data.capabilityId,traceId:x.data.traceId,requestedUrl:x.data.requestedUrl,responseMetadata:x.data.responseMetadata,textLength:x.data.extractedObservation?.text?.length})),
  facts:kinds('world_fact').filter(x=>x.data.classification==='EXTERNAL_OBSERVATION').map(x=>({id:x.id,sourceRef:x.data.sourceRef,classification:x.data.classification})),
};
const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`};
const queueResponse=await fetch(`${process.env.SUPABASE_URL}/rest/v1/cz_queue?company_id=eq.${encodeURIComponent(companyId)}&select=id,job_id,state,lease_owner,last_error,created_at`,{headers});
if(!queueResponse.ok)throw Error(`queue_read_${queueResponse.status}`);
summary.queue=await queueResponse.json();
summary.scrapy=[];
if(process.env.SCRAPY_CLOUD_API_KEY&&process.env.SCRAPY_CLOUD_PROJECT_ID){
  const url=new URL('https://app.zyte.com/api/jobs/list.json');
  url.searchParams.set('project',process.env.SCRAPY_CLOUD_PROJECT_ID);
  url.searchParams.set('count','5');
  const response=await fetch(url,{headers:{authorization:`Basic ${Buffer.from(`${process.env.SCRAPY_CLOUD_API_KEY}:`).toString('base64')}`}});
  if(!response.ok)throw Error(`scrapy_jobs_${response.status}`);
  const body=await response.json();
  summary.recentScrapyJobs=body.jobs?.map(x=>({id:x.id,spider:x.spider,state:x.state,closeReason:x.close_reason,started:x.started_time,updated:x.updated_time,finished:x.finished_time,items:x.items_scraped,errors:x.errors_count}));
}
for(const observation of observations){
  const metadata=observation.data.responseMetadata;
  const jobId=metadata?.responseMetadata?.jobId||metadata?.jobId;
  if(!jobId)continue;
  const auth={authorization:`Basic ${Buffer.from(`${process.env.SCRAPY_CLOUD_API_KEY}:`).toString('base64')}`};
  const url=new URL('https://app.zyte.com/api/jobs/list.json');
  url.searchParams.set('project',process.env.SCRAPY_CLOUD_PROJECT_ID);
  url.searchParams.set('job',jobId);
  const response=await fetch(url,{headers:auth});
  if(!response.ok)throw Error(`scrapy_jobs_${response.status}`);
  const body=await response.json();
  const job=body.jobs?.find(x=>String(x.id)===jobId);
  const itemsResponse=await fetch(`https://storage.zyte.com/items/${jobId}?count=5`,{headers:auth});
  if(!itemsResponse.ok)throw Error(`scrapy_items_${itemsResponse.status}`);
  const items=await itemsResponse.json();
  summary.scrapy.push({jobId,job,itemCount:items.length,sourceUrls:items.map(x=>x.source_url),matchesPersistedText:items.some(x=>x.text===observation.data.extractedObservation?.text)});
}
console.log(JSON.stringify(summary,null,2));
