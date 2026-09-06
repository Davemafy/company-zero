import {DomainError,validateSchema} from './contracts.mjs';

const METHODS=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD']);
const SECRET_HEADER=/authorization|api[-_]?key|token|secret/i;
const SIDE_EFFECT=new Set(['write','financial','external_side_effect']);
const TRANSIENT=new Set(['ECONNRESET','ETIMEDOUT','EAI_AGAIN']);

export function normalizeProviderInput(input={}){
  if(!input.name)throw new DomainError('provider_name_required');
  if(!['http','mcp','human'].includes(input.type))throw new DomainError('unsupported_provider_type');
  const provider={name:String(input.name),type:input.type,baseUrl:null,status:'registered',config:{}};
  if(input.type==='http'){
    if(!input.baseUrl)throw new DomainError('provider_base_url_required');
    const u=safeUrl(input.baseUrl,'/');
    if(u.username||u.password)throw new DomainError('provider_url_credentials_forbidden');
    provider.baseUrl=u.toString();
    provider.config.headers=normalizeHeaders(input.headers||input.config?.headers||{});
  }
  return provider;
}

export function normalizeCapability(providerId,raw={}){
  if(!raw.name)throw new DomainError('capability_name_required');
  const method=String(raw.method||'POST').toUpperCase();
  if(!METHODS.has(method))throw new DomainError('capability_method_not_allowed',422,{method});
  const risk=raw.risk||'read';
  if(!['read','write','financial','external_side_effect'].includes(risk))throw new DomainError('invalid_capability_risk',422,{risk});
  return {
    providerId,
    name:String(raw.name).slice(0,120),
    description:String(raw.description||'').slice(0,1000),
    inputSchema:raw.inputSchema||{type:'object'},
    outputSchema:raw.outputSchema||null,
    permissions:Array.isArray(raw.permissions)?raw.permissions.map(String):[],
    estimatedCost:normalizeCost(raw.estimatedCost),
    risk,
    timeoutMs:Math.max(100,Math.min(30000,Number(raw.timeoutMs)||10000)),
    retry:{maxAttempts:Math.max(1,Math.min(4,Number(raw.retry?.maxAttempts)||1))},
    endpoint:raw.endpoint||null,
    method,
    headers:normalizeHeaders(raw.headers||{}),
    shadowOutput:raw.shadowOutput??null
  };
}

export function capabilityCost(cap){
  const m=cap.estimatedCost||{};
  if(['fixed','per_call'].includes(m.type))return Number(m.usd)||0;
  return 0;
}

export function isSideEffecting(cap){return SIDE_EFFECT.has(cap.risk)}

export async function invokeHttpCapability(cap,provider,input,{attempt=1,idempotencyKey=null}={}){
  const errors=validateSchema(cap.inputSchema,input);
  if(errors.length)throw new DomainError('invalid_capability_arguments',422,errors);
  if(provider?.type==='human')throw new DomainError('human_approval_required',409);
  if(provider?.type!=='http'||!provider.baseUrl||!cap.endpoint)throw new DomainError('provider_not_executable',422);
  const url=safeUrl(provider.baseUrl,cap.endpoint);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cap.timeoutMs);
  const started=Date.now();
  try{
    const method=cap.method;
    const headers={'content-type':'application/json',...resolveHeaders(provider.config?.headers),...resolveHeaders(cap.headers)};if(idempotencyKey)headers['idempotency-key']=idempotencyKey;
    const response=await fetch(url,{method,headers,body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(input),signal:controller.signal});
    const text=await response.text();
    if(text.length>1_000_000)throw new DomainError('provider_response_too_large',502);
    let output=null;
    if(text){try{output=JSON.parse(text)}catch{output={text:text.slice(0,5000)}}}
    if(!response.ok){const e=new DomainError(`provider_http_${response.status}`,response.status>=500?502:422,{status:response.status});e.code=response.status>=500?'HTTP_5XX':'HTTP_4XX';throw e}
    const outErrors=validateSchema(cap.outputSchema,output);
    if(outErrors.length)throw new DomainError('invalid_capability_output',502,outErrors);
    return{output,cost:capabilityCost(cap),latencyMs:Date.now()-started};
  }catch(e){
    const transient=e?.name==='AbortError'||e instanceof TypeError||TRANSIENT.has(e?.code)||TRANSIENT.has(e?.cause?.code)||e?.code==='HTTP_5XX';
    if(transient&&isSideEffecting(cap)){e.uncertainSideEffect=true;throw e}
    if(transient&&attempt<cap.retry.maxAttempts)return invokeHttpCapability(cap,provider,input,{attempt:attempt+1,idempotencyKey});
    if(e?.name==='AbortError')throw new DomainError('tool_timeout',504);
    throw e;
  }finally{clearTimeout(timer)}
}

export function safeUrl(base,path=''){
  let url;try{url=new URL(path,base)}catch{throw new DomainError('invalid_provider_url',422)}
  if(!['http:','https:'].includes(url.protocol))throw new DomainError('provider_protocol_not_allowed',422);
  if(process.env.NODE_ENV==='production'){
    if(url.protocol!=='https:')throw new DomainError('https_required',422);
    const h=url.hostname.toLowerCase();
    if(isPrivateHost(h))throw new DomainError('private_network_blocked',422);
  }
  return url;
}

export function normalizeHeaders(headers={}){
  const out={};
  for(const [k,v] of Object.entries(headers||{})){
    if(v&&typeof v==='object'&&typeof v.env==='string'){out[k]={env:v.env};continue}
    if(SECRET_HEADER.test(k))throw new DomainError('raw_secret_header_forbidden',422,{header:k});
    if(typeof v==='string')out[k]=v;
  }
  return out;
}

export function resolveHeaders(headers={}){
  const out={};
  for(const [k,v] of Object.entries(headers||{})){
    if(v&&typeof v==='object'&&v.env){const value=process.env[v.env];if(value!=null)out[k]=value}
    else if(typeof v==='string'&&!SECRET_HEADER.test(k))out[k]=v;
  }
  return out;
}

function normalizeCost(raw){const m=raw&&typeof raw==='object'?raw:{type:'fixed',usd:0};return{type:['fixed','per_call'].includes(m.type)?m.type:'fixed',usd:Math.max(0,Number(m.usd)||0)}}
function isPrivateHost(h){return h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0'||h==='::1'||/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||h.endsWith('.local')}
