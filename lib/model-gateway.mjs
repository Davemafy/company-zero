const POLICIES={
  cheap_planner:{provider:'tensormux',modelEnv:'TENSORMUX_PLANNER_MODEL',fallbackModel:'glm-4-7-flash'},
  routine_executor:{provider:'tensormux',modelEnv:'TENSORMUX_EXECUTION_MODEL',fallbackModel:'glm-4-7-flash'},
  specialist_executor:{provider:'agentrouter',modelEnv:'AGENTROUTER_SPECIALIST_MODEL',fallbackModel:'glm-5.3',strictProvider:true},
  frontier_escalation:{provider:'agentrouter',modelEnv:'AGENTROUTER_FRONTIER_MODEL',fallbackModel:'claude-opus-5',strictProvider:true},
  verifier:{provider:'agentrouter',modelEnv:'AGENTROUTER_VERIFIER_MODEL',fallbackModel:'gpt-5.6-sol',strictProvider:true}
};
const now=()=>Date.now();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const strip=s=>String(s||'').replace(/\/$/,'').replace(/\/v1$/,'');
const providerConfig=provider=>provider==='tensormux'?{base:strip(process.env.TENSORMUX_BASE_URL),key:process.env.TENSORMUX_API_KEY,timeout:Number(process.env.TENSORMUX_TIMEOUT_MS||60000)}:{base:strip(process.env.AGENTROUTER_BASE_URL),key:process.env.AGENTROUTER_API_KEY,timeout:Number(process.env.AGENTROUTER_TIMEOUT_MS||60000)};
export function providerConfigured(provider){const c=providerConfig(provider);return Boolean(c.base&&c.key)}
export function modelGatewayConfigured(){return providerConfigured('tensormux')||providerConfigured('agentrouter')}
export function routeForPolicy(policy='specialist_executor'){
  const key=Object.hasOwn(POLICIES,policy)?policy:'specialist_executor',p=POLICIES[key];
  let provider=p.provider;
  // Independent verification is fail-closed: never silently substitute the producer provider.
  if(!p.strictProvider&&!providerConfigured(provider))provider=provider==='tensormux'&&providerConfigured('agentrouter')?'agentrouter':provider==='agentrouter'&&providerConfigured('tensormux')?'tensormux':provider;
  const model=provider===p.provider?String(process.env[p.modelEnv]||p.fallbackModel).trim()||p.fallbackModel:(provider==='tensormux'?String(process.env.TENSORMUX_EXECUTION_MODEL||process.env.TENSORMUX_RUNTIME_MODEL||process.env.TENSORMUX_MODEL||'glm-4-7-flash'):String(process.env.AGENTROUTER_SPECIALIST_MODEL||'glm-5.3'));
  return {policy:key,provider,model,strictProvider:Boolean(p.strictProvider)};
}
export function modelForPolicy(policy='specialist_executor'){return routeForPolicy(policy).model}
function usageOf(body){const u=body?.usage||{},prompt=num(u.prompt_tokens??u.input_tokens),completion=num(u.completion_tokens??u.output_tokens),total=num(u.total_tokens)||(prompt+completion);return {prompt_tokens:prompt,completion_tokens:completion,total_tokens:total}}
function reportedCost(body){for(const value of [body?.usage?.cost,body?.usage?.cost_usd,body?.cost,body?.cost_usd,body?.meta?.cost,body?.meta?.cost_usd]){const n=Number(value);if(Number.isFinite(n)&&n>=0)return n}return null}
function telemetry({provider,policy,role,model,startedAt,body=null,error=null}){return {provider,policy,role:String(role||policy),model,requestId:body?.id||null,usage:usageOf(body),latencyMs:Math.max(0,now()-startedAt),costUsd:reportedCost(body),success:!error,failure:error?{message:String(error?.message||error).slice(0,1000),status:error?.status||null}:null,at:new Date().toISOString()}}

export async function completeJson({system,user,policy='specialist_executor',role=null,timeoutMs=null,temperature=0,model=null,provider=null,onTelemetry=null}={}){
  const route=routeForPolicy(policy),chosenProvider=provider||route.provider,chosenModel=String(model||route.model).trim()||route.model,cfg=providerConfig(chosenProvider);
  if(route.strictProvider&&chosenProvider!==route.provider)throw Object.assign(Error(`${policy}_provider_override_forbidden`),{status:503,provider:chosenProvider,requiredProvider:route.provider,policy});
  if(!cfg.base||!cfg.key)throw Object.assign(Error(route.strictProvider?`${policy}_${chosenProvider}_required_not_configured`:`${chosenProvider}_not_configured`),{status:503,provider:chosenProvider,requiredProvider:route.strictProvider?route.provider:null,policy});
  const startedAt=now(),controller=new AbortController(),limit=timeoutMs==null?cfg.timeout:Math.min(180000,Math.max(1000,Number(timeoutMs)||cfg.timeout)),timer=setTimeout(()=>controller.abort(),Math.min(180000,Math.max(1000,limit)));
  let body=null;
  try{
    const response=await fetch(`${cfg.base}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${cfg.key}`},signal:controller.signal,body:JSON.stringify({model:chosenModel,temperature,response_format:{type:'json_object'},messages:[{role:'system',content:String(system||'Return strict JSON.')},{role:'user',content:String(user||'{}')}]})});
    const text=await response.text();try{body=text?JSON.parse(text):{}}catch{body={raw:text.slice(0,5000)}}if(!response.ok)throw Object.assign(Error(`${chosenProvider}_http_${response.status}`),{status:response.status,details:body});
    const content=body?.choices?.[0]?.message?.content??'{}';let json;try{json=JSON.parse(content)}catch{throw Object.assign(Error(`${chosenProvider}_invalid_json`),{details:{content:String(content).slice(0,5000)}})}
    const call=telemetry({provider:chosenProvider,policy,role,model:chosenModel,startedAt,body});try{await onTelemetry?.(call)}catch{}return {json,usage:call.usage,id:call.requestId,model:chosenModel,provider:chosenProvider,policy,role:call.role,latencyMs:call.latencyMs,costUsd:call.costUsd,telemetry:call};
  }catch(raw){const error=raw?.name==='AbortError'?Object.assign(Error(`${chosenProvider}_timeout`),{status:504}):raw;error.model=error.model||chosenModel;error.provider=chosenProvider;error.policy=policy;error.role=String(role||policy);const call=telemetry({provider:chosenProvider,policy,role,model:chosenModel,startedAt,body,error});error.telemetry=call;try{await onTelemetry?.(call)}catch{}throw error}finally{clearTimeout(timer)}
}

export async function auditWithVerifier({mission,organization,job,run,traces,evaluation,onTelemetry=null}={}){
  if(!modelGatewayConfigured())return {configured:false,skipped:true,reason:'model_gateway_not_configured'};
  const r=await completeJson({policy:'verifier',role:'independent_verifier',temperature:0,onTelemetry,system:'You are the independent verification layer for Company Zero. You cannot promote or modify the organization. Inspect only supplied persisted evidence. Return strict JSON with keys summary, anomalies (array), recommendations (array), confidence (0 to 1). Do not invent external facts.',user:JSON.stringify({mission:{outcome:mission?.outcome||'',metrics:mission?.metrics||[]},organization:{revision:organization?.revision,roles:(organization?.roles||[]).map(x=>({name:x.name,purpose:x.purpose}))},job:{id:job?.id,payload:job?.payload},run:{id:run?.id,status:run?.status,costUsd:run?.costUsd,latencyMs:run?.latencyMs,output:run?.output},evaluation:{passed:evaluation?.passed,results:evaluation?.results||[]},traces:(traces||[]).map(t=>({role:t.data?.roleName,capability:t.data?.capabilityName,status:t.data?.status,input:t.data?.input,output:t.data?.output,error:t.data?.error,latencyMs:t.data?.latencyMs,costUsd:t.data?.costUsd}))})});
  return {configured:true,skipped:false,provider:r.provider,model:r.model,audit:r.json,usage:r.usage,id:r.id,latencyMs:r.latencyMs,costUsd:r.costUsd,telemetry:r.telemetry};
}
