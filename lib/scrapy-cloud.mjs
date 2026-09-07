import {DomainError,validateSchema} from './contracts.mjs';
import {safeUrl} from './capabilities.mjs';
import {createHash} from 'node:crypto';

const RUN_URL=()=>process.env.SCRAPY_CLOUD_RUN_URL||'https://app.zyte.com/api/run.json';
const JOBS_URL=()=>process.env.SCRAPY_CLOUD_JOBS_URL||'https://app.zyte.com/api/jobs/list.json';
const ITEMS_BASE=()=>process.env.SCRAPY_CLOUD_ITEMS_BASE_URL||'https://storage.zyte.com/items/';
const MAX_PAGES=5,MAX_TEXT_CHARS=200_000,MAX_LINKS=50,MAX_ITEMS=5;
const pollWindowMs=override=>{if(override!=null)return Math.max(1,Number(override)||1);const configured=Number(process.env.SCRAPY_CLOUD_POLL_WINDOW_MS||0);if(configured>0)return Math.min(300000,Math.max(1,configured));const legacy=Number(process.env.SCRAPY_CLOUD_JOB_TIMEOUT_MS||0);return Math.min(300000,Math.max(120000,legacy||0))};

export function scrapyCloudConfigured(){return Boolean(process.env.SCRAPY_CLOUD_API_KEY&&process.env.SCRAPY_CLOUD_PROJECT_ID)}

export function createScrapyCloudProvider(){
  return {name:'Scrapy Cloud public-web observation',type:'http',adapter:'scrapy-cloud',baseUrl:'https://app.zyte.com',headers:{},manifest:{capabilities:[{
    name:'observe_public_web',
    description:'Run a bounded generic Scrapy Cloud spider against an explicitly requested public URL and return source-backed observations. This is read-only evidence, not outcome proof by itself.',
    endpoint:'/api/run.json',method:'POST',risk:'read',operationKind:'observe',
    observes:['public_webpage_content','public_webpage_metadata'],changes:[],stateDomains:['public_web','software.webpage'],
    permissions:['public_web.read','bounded_crawl','same_domain_default'],acceptsMissionEnvelope:false,
    inputSchema:{type:'object',required:['url'],additionalProperties:false,properties:{url:{type:'string',minLength:8,maxLength:2048},maxPages:{type:'number',minimum:1,maximum:5},allowedDomains:{type:'array',maxItems:10,items:{type:'string',minLength:1,maxLength:255}}}},
    outputSchema:{type:'object',required:['sourceUrl','observedAt','content','responseMetadata'],properties:{sourceUrl:{type:'string'},observedAt:{type:'string'},content:{type:'object'},responseMetadata:{type:'object'}}},
    estimatedCost:{type:'per_call',usd:Number(process.env.SCRAPY_CLOUD_ESTIMATED_COST_USD||0)},
    timeoutMs:Number(process.env.SCRAPY_CLOUD_TIMEOUT_MS||30000),retry:{maxAttempts:2},reversibility:'read-only'
  }]}};
}

export function scrapyExecutionTag(idempotencyKey){return idempotencyKey?`cz-${createHash('sha256').update(String(idempotencyKey)).digest('hex').slice(0,32)}`:null}

export async function invokeScrapyCloudCapability(cap,input,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),idempotencyKey=null,executionState=null,onProgress=async()=>{},pollWindowMs:windowOverride=null}={}){
  const errors=validateSchema(cap.inputSchema,input);if(errors.length)throw new DomainError('invalid_capability_arguments',422,errors);
  if(!scrapyCloudConfigured())throw new DomainError('scrapy_cloud_credentials_not_configured',503);
  const target=safeUrl(input.url);if(target.username||target.password)throw new DomainError('target_url_credentials_forbidden',422);
  const maxPages=Math.max(1,Math.min(MAX_PAGES,Number(input.maxPages)||1));
  const allowedDomains=normalizeAllowedDomains(input.allowedDomains,target.hostname);
  const auth=`Basic ${Buffer.from(`${process.env.SCRAPY_CLOUD_API_KEY}:`).toString('base64')}`;
  const project=String(process.env.SCRAPY_CLOUD_PROJECT_ID),spider=process.env.SCRAPY_CLOUD_SPIDER||'generic_observer';
  const persistProgress=typeof onProgress==='function'?onProgress:async()=>{};
  const remoteJobTag=executionState?.remoteJobTag||scrapyExecutionTag(idempotencyKey),startedAt=executionState?.launchedAt||new Date().toISOString();let jobId=executionState?.remoteJobId||null,job=null;
  if(!jobId&&remoteJobTag){await persistProgress({adapter:'scrapy-cloud',phase:'recovering_or_launching',remoteJobTag,launchedAt:startedAt,targetUrl:target.toString()});try{job=await readJobByTag(remoteJobTag,project,auth,fetchImpl)}catch(error){if(error.status>=500||error instanceof TypeError)throw pendingError(null,remoteJobTag,'scrapy_cloud_recovery_lookup_pending',{cause:error.message});throw error}if(job)jobId=String(job.id)}
  if(!jobId){
    const runBody=new URLSearchParams({project,spider,url:target.toString(),max_pages:String(maxPages),allowed_domains:allowedDomains.join(','),units:String(Math.max(1,Math.min(1,Number(process.env.SCRAPY_CLOUD_UNITS)||1)))});if(remoteJobTag)runBody.set('add_tag',remoteJobTag);
    let runResponse;try{runResponse=await fetchImpl(RUN_URL(),{method:'POST',headers:{authorization:auth,'content-type':'application/x-www-form-urlencoded'},body:runBody})}catch(error){throw pendingError(null,remoteJobTag,'scrapy_cloud_launch_outcome_pending',{cause:error.message})}
    const runText=await runResponse.text();let run;try{run=JSON.parse(runText)}catch{if(runResponse.status>=500)throw pendingError(null,remoteJobTag,'scrapy_cloud_launch_outcome_pending',{status:runResponse.status});throw new DomainError('scrapy_cloud_run_malformed_response',502)}
    if(!runResponse.ok||run?.status!=='ok'||!run?.jobid){if(remoteJobTag){try{job=await readJobByTag(remoteJobTag,project,auth,fetchImpl)}catch(error){if(error.status>=500||error instanceof TypeError)throw pendingError(null,remoteJobTag,'scrapy_cloud_recovery_lookup_pending',{cause:error.message,launchStatus:runResponse.status});throw error}if(job)jobId=String(job.id)}if(!jobId&&runResponse.status>=500)throw pendingError(null,remoteJobTag,'scrapy_cloud_launch_outcome_pending',{status:runResponse.status,response:run});if(!jobId)throw new DomainError(`scrapy_cloud_run_http_${runResponse.status}`,runResponse.status>=500?502:422,{status:runResponse.status,response:run,statusText:runResponse.statusText||null})}
    if(!jobId)jobId=String(run.jobid);
  }
  await persistProgress({adapter:'scrapy-cloud',phase:'polling',remoteJobId:jobId,remoteJobTag,launchedAt:startedAt,targetUrl:target.toString()});
  const deadline=Date.now()+pollWindowMs(windowOverride);
  while(Date.now()<deadline){
    try{job=await readJob(jobId,project,auth,fetchImpl)}catch(error){if(error.status>=500||error instanceof TypeError)throw pendingError(jobId,remoteJobTag,'scrapy_cloud_poll_pending',{cause:error.message});throw error}
    if(job?.state==='finished')break;
    if(job?.state==='deleted')throw new DomainError('scrapy_cloud_job_deleted',502,{jobId});
    await sleep(Math.max(250,Math.min(5000,Number(process.env.SCRAPY_CLOUD_POLL_MS)||1000)));
  }
  if(!job||job.state!=='finished'){await persistProgress({adapter:'scrapy-cloud',phase:'polling',remoteJobId:jobId,remoteJobTag,remoteJobState:job?.state||'unknown',launchedAt:startedAt,lastPolledAt:new Date().toISOString(),targetUrl:target.toString()});throw pendingError(jobId,remoteJobTag,'scrapy_cloud_job_still_running',{state:job?.state||null})}
  if(job.close_reason&&job.close_reason!=='finished'&&job.close_reason!=='closespider_pagecount')throw new DomainError('scrapy_cloud_job_failed',502,{jobId,closeReason:job.close_reason,errorsCount:job.errors_count||0});
  await persistProgress({adapter:'scrapy-cloud',phase:'retrieving',remoteJobId:jobId,remoteJobTag,remoteJobState:job.state,launchedAt:startedAt,lastPolledAt:new Date().toISOString(),targetUrl:target.toString()});
  let items;try{items=await readItems(jobId,auth,fetchImpl)}catch(error){if(error.status>=500||error instanceof TypeError)throw pendingError(jobId,remoteJobTag,'scrapy_cloud_item_retrieval_pending',{cause:error.message});throw error}
  if(!items.length&&Number(job.items_scraped||0)>0)throw pendingError(jobId,remoteJobTag,'scrapy_cloud_items_pending',{itemsScraped:Number(job.items_scraped)});
  if(!items.length)throw new DomainError('scrapy_cloud_no_items',502,{jobId});
  const normalizedItems=items.slice(0,MAX_ITEMS).map(normalizeItem);const first=normalizedItems[0];
  const combinedText=normalizedItems.map(x=>x.text).filter(Boolean).join('\n\n').slice(0,MAX_TEXT_CHARS);
  const links=[...new Set(normalizedItems.flatMap(x=>x.links||[]))].slice(0,MAX_LINKS);
  const output={sourceUrl:first.sourceUrl,observedAt:first.observedAt||new Date().toISOString(),content:{title:first.title||'',text:combinedText,links,pages:normalizedItems},responseMetadata:{provider:'scrapy-cloud',projectId:project,spider,jobId,state:job.state,closeReason:job.close_reason||null,itemsScraped:Number(job.items_scraped||items.length),responsesReceived:Number(job.responses_received||0),errorsCount:Number(job.errors_count||0),startedAt:job.started_time||startedAt,completedAt:job.updated_time||new Date().toISOString(),boundedMaxPages:maxPages,allowedDomains}};
  const outErrors=validateSchema(cap.outputSchema,output);if(outErrors.length)throw new DomainError('invalid_capability_output',502,outErrors);
  return{output,metadata:{provider:'scrapy-cloud',sourceUrl:output.sourceUrl,observedAt:output.observedAt,responseMetadata:output.responseMetadata},latencyMs:Date.now()-Date.parse(startedAt)};
}

async function readJob(jobId,project,auth,fetchImpl){const url=new URL(JOBS_URL());url.searchParams.set('project',project);url.searchParams.set('job',jobId);url.searchParams.set('count','1');const response=await fetchImpl(url,{headers:{authorization:auth}});const text=await response.text();let body;try{body=JSON.parse(text)}catch{throw new DomainError('scrapy_cloud_job_malformed_response',502)}if(!response.ok||body?.status!=='ok')throw new DomainError(`scrapy_cloud_job_http_${response.status}`,response.status>=500?502:422);return body.jobs?.find(x=>String(x.id)===jobId)||body.jobs?.[0]||null}
async function readJobByTag(tag,project,auth,fetchImpl){const url=new URL(JOBS_URL());url.searchParams.set('project',project);url.searchParams.set('has_tag',tag);url.searchParams.set('count','10');const response=await fetchImpl(url,{headers:{authorization:auth}});const text=await response.text();let body;try{body=JSON.parse(text)}catch{throw new DomainError('scrapy_cloud_job_malformed_response',502)}if(!response.ok||body?.status!=='ok')throw new DomainError(`scrapy_cloud_job_http_${response.status}`,response.status>=500?502:422);return body.jobs?.find(x=>Array.isArray(x.tags)&&x.tags.includes(tag))||null}
async function readItems(jobId,auth,fetchImpl){const url=new URL(String(ITEMS_BASE()).replace(/\/+$/,'/')+jobId);url.searchParams.set('count',String(MAX_ITEMS));const response=await fetchImpl(url,{headers:{authorization:auth,accept:'application/json'}});const text=await response.text();if(Buffer.byteLength(text)>1_000_000)throw new DomainError('scrapy_cloud_items_too_large',502);let body;try{body=JSON.parse(text)}catch{throw new DomainError('scrapy_cloud_items_malformed_response',502)}if(!response.ok)throw new DomainError(`scrapy_cloud_items_http_${response.status}`,response.status>=500?502:422);return Array.isArray(body)?body:[]}
function pendingError(jobId,tag,message,details={}){const error=new DomainError(message,503,{jobId,tag,...details});error.resumable=true;error.remoteJobId=jobId;error.remoteJobTag=tag;return error}
function normalizeItem(item){return{sourceUrl:String(item.source_url||item.sourceUrl||'').slice(0,2048),observedAt:String(item.observed_at||item.observedAt||new Date().toISOString()),status:Number(item.status||0),title:String(item.title||'').slice(0,500),text:String(item.text||'').slice(0,MAX_TEXT_CHARS),links:Array.isArray(item.links)?item.links.map(String).slice(0,MAX_LINKS):[],contentType:String(item.content_type||item.contentType||'').slice(0,200)}}
function normalizeAllowedDomains(input,host){const values=Array.isArray(input)?input.map(x=>String(x).trim().toLowerCase()).filter(Boolean):[];if(!values.length)return[host.toLowerCase()];if(!values.some(x=>host===x||host.endsWith(`.${x}`)))throw new DomainError('target_outside_allowed_domains',422);return[...new Set(values)].slice(0,10)}
