const POLICIES={
  cheap_planner:{provider:'tensormux',modelEnv:'TENSORMUX_PLANNER_MODEL',fallbackModel:'glm-4-7-flash'},
  routine_executor:{provider:'tensormux',modelEnv:'TENSORMUX_EXECUTION_MODEL',fallbackModel:'glm-4-7-flash'},
  specialist_executor:{provider:'tensormux',modelEnv:'TENSORMUX_SPECIALIST_MODEL',fallbackModel:'glm-4-7-flash',strictProvider:true},
  frontier_escalation:{provider:'tensormux',modelEnv:'TENSORMUX_FRONTIER_MODEL',fallbackModel:'glm-4-7-flash',strictProvider:true},
  verifier:{provider:'tensormux',modelEnv:'TENSORMUX_VERIFIER_MODEL',fallbackModel:'glm-4-7-flash',strictProvider:true}
};
const now=()=>Date.now();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const strip=s=>String(s||'').replace(/\/$/,'').replace(/\/v1$/,'');
const providerConfig=provider=>provider==='tensormux'?{base:strip(process.env.TENSORMUX_BASE_URL),key:process.env.TENSORMUX_API_KEY,timeout:Number(process.env.TENSORMUX_TIMEOUT_MS||60000)}:{base:'',key:'',timeout:60000};
const defaultModelFor=policy=>{
  const p=POLICIES[policy]||POLICIES.specialist_executor;
  const explicit=String(process.env[p.modelEnv]||'').trim();
  if(explicit)return explicit;
  if(policy==='cheap_planner')return String(process.env.TENSORMUX_PLANNER_MODEL||process.env.TENSORMUX_EXECUTION_MODEL||process.env.TENSORMUX_RUNTIME_MODEL||process.env.TENSORMUX_MODEL||p.fallbackModel).trim()||p.fallbackModel;
  return String(process.env.TENSORMUX_EXECUTION_MODEL||process.env.TENSORMUX_RUNTIME_MODEL||process.env.TENSORMUX_MODEL||p.fallbackModel).trim()||p.fallbackModel;
};
export function providerConfigured(provider){if(provider!=='tensormux')return false;const c=providerConfig(provider);return Boolean(c.base&&c.key)}
export function modelGatewayConfigured(){return providerConfigured('tensormux')}
export function providerConfigSnapshot(){const tensor=providerConfig('tensormux');return {tensormux:{configured:Boolean(tensor.base&&tensor.key),base:tensor.base||null,plannerModel:defaultModelFor('cheap_planner'),executionModel:defaultModelFor('routine_executor'),specialistModel:defaultModelFor('specialist_executor'),frontierModel:defaultModelFor('frontier_escalation'),verifierModel:defaultModelFor('verifier')}}}
function detailText(value){try{return JSON.stringify(value||{}).slice(0,3000).toLowerCase()}catch{return String(value||'').slice(0,3000).toLowerCase()}}
export function sanitizeProviderError(error,provider=error?.provider||'provider'){
  const p=String(provider||'provider').toLowerCase(),message=String(error?.message||error||'').toLowerCase(),status=Number(error?.status||0),details=detailText(error?.details);
  if(message.includes('_not_configured')||message.includes('_required_not_configured'))return `${p}_not_configured`;
  if(message.includes('_timeout')||error?.name==='AbortError'||status===504)return `${p}_timeout`;
  if(message.includes('_invalid_response_shape'))return `${p}_invalid_response_shape`;
  if(message.includes('_invalid_json'))return `${p}_invalid_json`;
  if((status===400||status===404)&&/model.{0,80}(unavailable|not found|unknown|invalid|unsupported)|no such model/.test(details))return `${p}_model_unavailable`;
  if(status>=400&&status<=599)return `${p}_http_${status}`;
  if(error instanceof TypeError||/network|fetch failed|econn|etimedout|eai_again|connect/.test(message))return `${p}_network_error`;
  return `${p}_request_failed`;
}
export function routeForPolicy(policy='specialist_executor'){const key=Object.hasOwn(POLICIES,policy)?policy:'specialist_executor',p=POLICIES[key];return {policy:key,provider:'tensormux',model:defaultModelFor(key),strictProvider:Boolean(p.strictProvider)}}
export function modelForPolicy(policy='specialist_executor'){return routeForPolicy(policy).model}
function usageOf(body){const u=body?.usage||{},prompt=num(u.prompt_tokens??u.input_tokens),completion=num(u.completion_tokens??u.output_tokens),total=num(u.total_tokens)||(prompt+completion);return {prompt_tokens:prompt,completion_tokens:completion,total_tokens:total}}
function reportedCost(body){for(const value of [body?.usage?.cost,body?.usage?.cost_usd,body?.cost,body?.cost_usd,body?.meta?.cost,body?.meta?.cost_usd]){const n=Number(value);if(Number.isFinite(n)&&n>=0)return n}return null}
function telemetry({provider,policy,role,model,startedAt,body=null,error=null}){return {provider,policy,role:String(role||policy),model,requestId:body?.id||null,usage:usageOf(body),latencyMs:Math.max(0,now()-startedAt),costUsd:reportedCost(body),success:!error,failure:error?{code:sanitizeProviderError(error,provider),message:sanitizeProviderError(error,provider),status:error?.status||null}:null,at:new Date().toISOString()}}
function contentText(body){const raw=body?.choices?.[0]?.message?.content;if(typeof raw==='string')return raw.trim();if(Array.isArray(raw))return raw.map(part=>typeof part==='string'?part:String(part?.text||part?.content||'')).join('').trim();return ''}
function responseShape(body){return {keys:Object.keys(body&&typeof body==='object'?body:{}).slice(0,20),hasChoices:Array.isArray(body?.choices),hasId:Boolean(body?.id)}}
export async function completeJson({system,user,policy='specialist_executor',role=null,timeoutMs=null,temperature=0,model=null,provider=null,onTelemetry=null}={}){
  const route=routeForPolicy(policy),chosenProvider=provider||route.provider,chosenModel=String(model||route.model).trim()||route.model;
  if(chosenProvider!=='tensormux')throw Object.assign(Error('provider_not_supported'),{status:503,provider:chosenProvider,requiredProvider:'tensormux',policy});
  if(route.strictProvider&&chosenProvider!==route.provider)throw Object.assign(Error(`${policy}_provider_override_forbidden`),{status:503,provider:chosenProvider,requiredProvider:route.provider,policy});
  const cfg=providerConfig(chosenProvider);if(!cfg.base||!cfg.key)throw Object.assign(Error('tensormux_not_configured'),{status:503,provider:'tensormux',requiredProvider:'tensormux',policy});
  const startedAt=now(),controller=new AbortController(),limit=timeoutMs==null?cfg.timeout:Math.min(180000,Math.max(1000,Number(timeoutMs)||cfg.timeout)),timer=setTimeout(()=>controller.abort(),Math.min(180000,Math.max(1000,limit)));let body=null;
  try{
    const response=await fetch(`${cfg.base}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${cfg.key}`},signal:controller.signal,body:JSON.stringify({model:chosenModel,temperature,response_format:{type:'json_object'},messages:[{role:'system',content:String(system||'Return strict JSON.')},{role:'user',content:String(user||'{}')}]})});
    const text=await response.text();try{body=text?JSON.parse(text):{}}catch{body={raw:text.slice(0,5000)}}if(!response.ok)throw Object.assign(Error(`tensormux_http_${response.status}`),{status:response.status,details:body});
    const content=contentText(body);if(!content)throw Object.assign(Error('tensormux_invalid_response_shape'),{details:responseShape(body)});
    let json;try{json=JSON.parse(content)}catch{throw Object.assign(Error('tensormux_invalid_json'),{details:{content:String(content).slice(0,5000)}})}
    const call=telemetry({provider:'tensormux',policy,role,model:chosenModel,startedAt,body});try{await onTelemetry?.(call)}catch{}return {json,usage:call.usage,id:call.requestId,model:chosenModel,provider:'tensormux',policy,role:call.role,latencyMs:call.latencyMs,costUsd:call.costUsd,telemetry:call};
  }catch(raw){const original=raw?.name==='AbortError'?Object.assign(Error('tensormux_timeout'),{status:504}):raw;const code=sanitizeProviderError(original,'tensormux');const error=Object.assign(Error(code),{status:original?.status||null,details:original?.details||null,model:original?.model||chosenModel,provider:'tensormux',policy,role:String(role||policy),providerFailureCode:code});const call=telemetry({provider:'tensormux',policy,role,model:chosenModel,startedAt,body,error});error.telemetry=call;try{await onTelemetry?.(call)}catch{}throw error}finally{clearTimeout(timer)}
}
export async function auditWithVerifier({mission,organization,job,run,traces,evaluation,onTelemetry=null}={}){
  if(!modelGatewayConfigured())return {configured:false,skipped:true,reason:'model_gateway_not_configured'};
  const r=await completeJson({policy:'verifier',role:'independent_verifier',temperature:0,onTelemetry,system:'You are the independent verification layer for Company Zero. You cannot promote or modify the organization. Inspect only supplied persisted evidence. Return strict JSON with keys summary, anomalies (array), recommendations (array), confidence (0 to 1). Do not invent external facts.',user:JSON.stringify({mission:{outcome:mission?.outcome||'',metrics:mission?.metrics||[]},organization:{revision:organization?.revision,roles:(organization?.roles||[]).map(x=>({name:x.name,purpose:x.purpose}))},job:{id:job?.id,payload:job?.payload},run:{id:run?.id,status:run?.status,costUsd:run?.costUsd,latencyMs:run?.latencyMs,output:run?.output},evaluation:{passed:evaluation?.passed,results:evaluation?.results||[]},traces:(traces||[]).map(t=>({role:t.data?.roleName,capability:t.data?.capabilityName,status:t.data?.status,input:t.data?.input,output:t.data?.output,error:t.data?.error,latencyMs:t.data?.latencyMs,costUsd:t.data?.costUsd}))})});
  return {configured:true,skipped:false,provider:r.provider,model:r.model,audit:r.json,usage:r.usage,id:r.id,latencyMs:r.latencyMs,costUsd:r.costUsd,telemetry:r.telemetry};
}
