import {completeJson,routeForPolicy,sanitizeProviderError} from './model-gateway.mjs';

const ROLE_POLICY={verification:'verifier',verifier:'verifier',quality:'verifier',evaluation:'verifier',research:'routine_executor',execution:'routine_executor',product:'routine_executor',brand:'routine_executor',offer_design:'routine_executor',channel_strategy:'routine_executor',go_to_market:'routine_executor',finance:'specialist_executor',economics:'specialist_executor',market_strategy:'specialist_executor',venture_strategy:'specialist_executor'};
const safeName=name=>String(name||'role-output.md').replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'role-output.md';
const bounded=(v,fallback,min=8000,max=60000)=>Math.max(min,Math.min(max,Number(v||fallback)));
const timeoutMs=policy=>policy==='routine_executor'
  ?bounded(process.env.ROLE_ROUTINE_TIMEOUT_MS||process.env.ROLE_EXECUTION_TIMEOUT_MS,24000)
  :policy==='frontier_escalation'
    ?bounded(process.env.ROLE_FRONTIER_TIMEOUT_MS||process.env.ROLE_EXECUTION_TIMEOUT_MS,30000)
    :bounded(process.env.ROLE_SPECIALIST_TIMEOUT_MS||process.env.ROLE_EXECUTION_TIMEOUT_MS,45000);
const emit=async(onProgress,event)=>{try{await onProgress?.(event)}catch{}};
export function policyForRole(role){return ROLE_POLICY[String(role||'').toLowerCase()]||'routine_executor'}
function normalizeRoleOutput(role,r){const raw=r?.json||{},files=[];for(const f of Array.isArray(raw.files)?raw.files.slice(0,4):[]){const content=String(f?.content||'').trim();if(content.length<80)continue;files.push({name:safeName(f?.name||`${role}.md`),mimeType:String(f?.mimeType||'text/markdown'),content:content.slice(0,100000),role})}return {role,summary:String(raw.summary||'').slice(0,1000),findings:Array.isArray(raw.findings)?raw.findings.map(String).slice(0,12):[],files,provider:r.provider,model:r.model,policy:r.policy,telemetry:r.telemetry}}
async function callRole({role,policy,request,plan,context,publicEvidence,upstream,telemetry}){
  const r=await completeJson({policy,role,timeoutMs:timeoutMs(policy),temperature:0,onTelemetry:call=>telemetry.push(call),system:`You are the ${role.replaceAll('_',' ')} function inside a real operating organization. Work only on your function. Return strict JSON {"summary":string,"findings":string[],"files":[{"name":string,"mimeType":string,"content":string}]}. Produce concrete material another function can use. Respect the mission contract and budget. Label assumptions and estimates locally. Never invent external facts. Use supplied public evidence only when it supports the claim. Do not narrate workflow.`,user:JSON.stringify({request,missionKind:plan.kind,objective:plan.objective,contract:plan.contract,role,context,publicEvidence,upstream})});
  const normalizedRoleOutput=normalizeRoleOutput(role,r);
  if(!normalizedRoleOutput.files.length)throw Object.assign(Error('role_no_artifacts'),{status:422,provider:r.provider,model:r.model,policy:r.policy,role,telemetry:r.telemetry});
  return {...r,normalizedRoleOutput};
}
function roleNeedsStrategy(role){return /^(brand|offer_design|channel_strategy|go_to_market|finance|economics)$/i.test(role)}
const sameRoute=(a,b)=>a?.provider===b?.provider&&a?.model===b?.model;
const roleErrorCode=(error,provider)=>String(error?.message||error)==='role_no_artifacts'?'role_no_artifacts':sanitizeProviderError(error,provider);

export async function executeOrganizationRoles({request,plan,context=null,publicEvidence=null,onProgress=null}={}){
 const roles=(plan?.organization?.functions||[]).filter(role=>role&&!/^(verification|verifier|quality|evaluation)$/i.test(role)),telemetry=[],outputs=[];
 const roots=roles.filter(role=>!roleNeedsStrategy(role)||!roles.some(x=>/^(venture_strategy|market_strategy)$/i.test(x))),dependents=roles.filter(role=>!roots.includes(role));
 const runRole=async(role,upstream=[])=>{
  const primaryPolicy=policyForRole(role),policies=primaryPolicy==='routine_executor'?['routine_executor','specialist_executor','frontier_escalation']:primaryPolicy==='specialist_executor'?['specialist_executor','frontier_escalation']:[primaryPolicy];
  let lastError=null,recovered=false;
  for(let index=0;index<policies.length;index++){
    const attemptPolicy=policies[index],route=routeForPolicy(attemptPolicy),limit=timeoutMs(attemptPolicy);
    if(index===0)await emit(onProgress,{type:'ROLE_STARTED',message:`${role.replaceAll('_',' ')} started · ${route.provider}/${route.model} · ${Math.round(limit/1000)}s timeout`,data:{role,policy:attemptPolicy,provider:route.provider,model:route.model,timeoutMs:limit}});
    else{
      const previous=routeForPolicy(policies[index-1]),failureCode=roleErrorCode(lastError,lastError?.provider||previous.provider);
      if(sameRoute(previous,route)){await emit(onProgress,{type:'ROLE_ESCALATION_UNAVAILABLE',message:`${role.replaceAll('_',' ')} failed · ${failureCode} · next recovery resolves to the same ${route.provider}/${route.model}.`,data:{role,errorCode:failureCode,from:previous,to:route,failure:lastError?.telemetry||null}});continue}
      await emit(onProgress,{type:'ROLE_ESCALATED',message:`${role.replaceAll('_',' ')} failed · ${failureCode} · escalating to ${route.provider}/${route.model}.`,data:{role,errorCode:failureCode,from:{policy:policies[index-1],provider:lastError?.provider||previous.provider,model:lastError?.model||previous.model},to:{policy:attemptPolicy,provider:route.provider,model:route.model,timeoutMs:limit},failure:lastError?.telemetry||null}});
    }
    try{
      const r=await callRole({role,policy:attemptPolicy,request,plan,context,publicEvidence,upstream,telemetry});
      recovered=index>0;
      if(recovered)await emit(onProgress,{type:'ROLE_RECOVERED',message:`${role.replaceAll('_',' ')} recovered · ${r.provider}/${r.model}`,data:{role,provider:r.provider,model:r.model,policy:r.policy,latencyMs:r.latencyMs,costUsd:r.costUsd}});
      const out={...(r.normalizedRoleOutput||normalizeRoleOutput(role,r)),recovered};outputs.push(out);
      await emit(onProgress,{type:'ROLE_COMPLETED',message:`${role.replaceAll('_',' ')} completed · ${r.provider}/${r.model} · ${out.files.length} artifact${out.files.length===1?'':'s'}${recovered?' · recovered':''}`,data:{role,policy:r.policy,provider:r.provider,model:r.model,recovered,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd,fileNames:out.files.map(f=>f.name)}});
      for(const file of out.files)await emit(onProgress,{type:'DRAFT_ARTIFACT_AVAILABLE',message:`Draft available · ${file.name} · ${role.replaceAll('_',' ')}`,data:{role,name:file.name,mimeType:file.mimeType,content:file.content,state:'draft',verified:false}});
      return out;
    }catch(error){lastError=error;if(error?.telemetry&&!telemetry.includes(error.telemetry))telemetry.push(error.telemetry)}
  }
  const finalRoute=routeForPolicy(policies.at(-1)),error=lastError||Object.assign(Error('role_failed'),{provider:finalRoute.provider,model:finalRoute.model,policy:policies.at(-1)}),errorCode=roleErrorCode(error,error?.provider||finalRoute.provider);
  await emit(onProgress,{type:'ROLE_FAILED',message:`${role.replaceAll('_',' ')} failed · ${error.provider||finalRoute.provider}/${error.model||finalRoute.model} · ${errorCode}.`,data:{role,policy:error?.policy||policies.at(-1),errorCode,error:String(error?.message||error),provider:error?.provider||finalRoute.provider,model:error?.model||finalRoute.model,telemetry:error?.telemetry||null}});
  return null;
 };
 await emit(onProgress,{type:'ROLE_DAG_STARTED',message:`Organization executing ${roots.length} independent function${roots.length===1?'':'s'} in parallel.`,data:{roots,dependents}});
 const rootResults=(await Promise.all(roots.map(role=>runRole(role)))).filter(Boolean),upstream=rootResults.map(out=>({role:out.role,summary:out.summary,findings:out.findings,files:out.files.map(f=>({name:f.name,content:f.content.slice(0,12000)}))}));if(dependents.length)await Promise.all(dependents.map(role=>runRole(role,upstream)));
 const calls=telemetry.filter(Boolean),completedRoles=outputs.length,recoveredRoles=outputs.filter(x=>x.recovered).length,summary={calls:calls.length,successful:calls.filter(x=>x.success).length,failed:calls.filter(x=>!x.success).length,expectedRoles:roles.length,completedRoles,recoveredRoles,completionRate:roles.length?Number((completedRoles/roles.length).toFixed(4)):1,totalTokens:calls.reduce((n,x)=>n+Number(x?.usage?.total_tokens||0),0),totalCostUsd:calls.reduce((n,x)=>n+Number(x?.costUsd||0),0),totalModelLatencyMs:calls.reduce((n,x)=>n+Number(x?.latencyMs||0),0)};
 await emit(onProgress,{type:'ROLE_TELEMETRY_SUMMARY',message:`Role telemetry · ${summary.completedRoles}/${summary.expectedRoles} roles completed · ${summary.recoveredRoles} recovered · ${summary.successful}/${summary.calls} model calls succeeded · ${summary.totalTokens} tokens · ${summary.totalCostUsd.toFixed(4)} reported cost`,data:summary});
 return {outputs:roles.map(role=>outputs.find(x=>x.role===role)).filter(Boolean),telemetry,telemetrySummary:summary};
}

export async function synthesizeRoleOutputs({request,plan,roleRun,onProgress=null}={}){
 if(!roleRun?.outputs?.length)return null;
 const seen=new Set(),files=[];for(const out of roleRun.outputs){for(const f of out.files||[]){let name=safeName(f.name),n=2;while(seen.has(name)){const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';name=`${base}-${n++}${ext}`}seen.add(name);files.push({name,mimeType:f.mimeType||'text/markdown',content:f.content})}}
 if(!files.length){await emit(onProgress,{type:'ROLE_ASSEMBLY_EMPTY',message:'Deterministic assembly found no publishable role artifacts.',data:{role:'organization_synthesizer',provider:'local',model:'deterministic',inputRoles:roleRun.outputs.map(x=>x.role)}});return null}
 const title=String(plan?.objective||request||'Company Zero result').slice(0,120),summary=roleRun.outputs.map(x=>x.summary).filter(Boolean).join(' ').slice(0,400)||`${files.length} artifact${files.length===1?'':'s'} produced by the operating organization.`;
 await emit(onProgress,{type:'ROLE_ARTIFACTS_ASSEMBLED',message:`Synthesizer completed locally · ${files.length} artifact${files.length===1?'':'s'} assembled without another model call.`,data:{role:'organization_synthesizer',provider:'local',model:'deterministic',fileCount:files.length,inputRoles:roleRun.outputs.map(x=>x.role)}});
 return {json:{title,summary,files},provider:'local',model:'deterministic',policy:'deterministic_synthesis',usage:null,costUsd:0,latencyMs:0,telemetry:null};
}
