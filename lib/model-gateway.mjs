const POLICY_MODELS={
  cheap_planner:'deepseek-v4-flash',
  specialist_executor:'glm-5.3',
  frontier_escalation:'claude-opus-5',
  verifier:'gpt-5.6-sol'
};

const ENV_MODELS={
  cheap_planner:'AGENTROUTER_CHEAP_PLANNER_MODEL',
  specialist_executor:'AGENTROUTER_SPECIALIST_MODEL',
  frontier_escalation:'AGENTROUTER_FRONTIER_MODEL',
  verifier:'AGENTROUTER_VERIFIER_MODEL'
};

const now=()=>Date.now();
const base=()=>String(process.env.AGENTROUTER_BASE_URL||'').replace(/\/$/,'').replace(/\/v1$/,'');
const endpoint=()=>`${base()}/v1/chat/completions`;
const configuredTimeout=()=>{const n=Number(process.env.AGENTROUTER_TIMEOUT_MS||60000);return Number.isFinite(n)?Math.min(180000,Math.max(5000,n)):60000};
const num=v=>Number.isFinite(Number(v))?Number(v):0;

export function modelGatewayConfigured(){return Boolean(process.env.AGENTROUTER_BASE_URL&&process.env.AGENTROUTER_API_KEY)}
export function modelForPolicy(policy='specialist_executor'){
  const key=Object.hasOwn(POLICY_MODELS,policy)?policy:'specialist_executor';
  return String(process.env[ENV_MODELS[key]]||POLICY_MODELS[key]).trim()||POLICY_MODELS[key];
}

function usageOf(body){
  const u=body?.usage||{};
  const prompt=num(u.prompt_tokens??u.input_tokens);
  const completion=num(u.completion_tokens??u.output_tokens);
  const total=num(u.total_tokens)||(prompt+completion);
  return {prompt_tokens:prompt,completion_tokens:completion,total_tokens:total};
}

function reportedCost(body){
  const candidates=[body?.usage?.cost,body?.usage?.cost_usd,body?.cost,body?.cost_usd,body?.meta?.cost,body?.meta?.cost_usd];
  for(const value of candidates){const n=Number(value);if(Number.isFinite(n)&&n>=0)return n}
  return null;
}

function telemetry({policy,role,model,startedAt,body=null,error=null}){
  return {
    provider:'agentrouter',policy,role:String(role||policy),model,
    requestId:body?.id||null,usage:usageOf(body),latencyMs:Math.max(0,now()-startedAt),
    costUsd:reportedCost(body),success:!error,
    failure:error?{message:String(error?.message||error).slice(0,1000),status:error?.status||null}:null,
    at:new Date().toISOString()
  };
}

export async function completeJson({system,user,policy='specialist_executor',role=null,timeoutMs=null,temperature=0,model=null,onTelemetry=null}={}){
  if(!modelGatewayConfigured())throw Object.assign(Error('agentrouter_not_configured'),{status:503,provider:'agentrouter'});
  const chosenModel=String(model||modelForPolicy(policy)).trim()||modelForPolicy(policy);
  const startedAt=now();
  const controller=new AbortController();
  const limit=timeoutMs==null?configuredTimeout():Math.min(180000,Math.max(1000,Number(timeoutMs)||configuredTimeout()));
  const timer=setTimeout(()=>controller.abort(),limit);
  let body=null;
  try{
    const response=await fetch(endpoint(),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.AGENTROUTER_API_KEY}`},signal:controller.signal,body:JSON.stringify({model:chosenModel,temperature,response_format:{type:'json_object'},messages:[{role:'system',content:String(system||'Return strict JSON.')},{role:'user',content:String(user||'{}')}]})});
    const text=await response.text();try{body=text?JSON.parse(text):{}}catch{body={raw:text.slice(0,5000)}}
    if(!response.ok)throw Object.assign(Error(`agentrouter_http_${response.status}`),{status:response.status,details:body});
    const content=body?.choices?.[0]?.message?.content??'{}';let json;try{json=JSON.parse(content)}catch{throw Object.assign(Error('agentrouter_invalid_json'),{details:{content:String(content).slice(0,5000)}})}
    const call=telemetry({policy,role,model:chosenModel,startedAt,body});
    try{await onTelemetry?.(call)}catch{}
    return {json,usage:call.usage,id:call.requestId,model:chosenModel,provider:'agentrouter',policy,role:call.role,latencyMs:call.latencyMs,costUsd:call.costUsd,telemetry:call};
  }catch(raw){
    const error=raw?.name==='AbortError'?Object.assign(Error('agentrouter_timeout'),{status:504}):raw;
    error.model=error.model||chosenModel;error.provider='agentrouter';error.policy=policy;error.role=String(role||policy);
    const call=telemetry({policy,role,model:chosenModel,startedAt,body,error});error.telemetry=call;
    try{await onTelemetry?.(call)}catch{}
    throw error;
  }finally{clearTimeout(timer)}
}

export async function auditWithVerifier({mission,organization,job,run,traces,evaluation,onTelemetry=null}={}){
  if(!modelGatewayConfigured())return {configured:false,skipped:true,reason:'agentrouter_not_configured'};
  const r=await completeJson({policy:'verifier',role:'independent_verifier',temperature:0,onTelemetry,
    system:'You are the independent verification layer for Company Zero. You cannot promote or modify the organization. Inspect only supplied persisted evidence. Return strict JSON with keys summary, anomalies (array), recommendations (array), confidence (0 to 1). Do not invent external facts.',
    user:JSON.stringify({mission:{outcome:mission?.outcome||'',metrics:mission?.metrics||[]},organization:{revision:organization?.revision,roles:(organization?.roles||[]).map(x=>({name:x.name,purpose:x.purpose}))},job:{id:job?.id,payload:job?.payload},run:{id:run?.id,status:run?.status,costUsd:run?.costUsd,latencyMs:run?.latencyMs,output:run?.output},evaluation:{passed:evaluation?.passed,results:evaluation?.results||[]},traces:(traces||[]).map(t=>({role:t.data?.roleName,capability:t.data?.capabilityName,status:t.data?.status,input:t.data?.input,output:t.data?.output,error:t.data?.error,latencyMs:t.data?.latencyMs,costUsd:t.data?.costUsd}))})});
  return {configured:true,skipped:false,model:r.model,audit:r.json,usage:r.usage,id:r.id,latencyMs:r.latencyMs,costUsd:r.costUsd,telemetry:r.telemetry};
}
