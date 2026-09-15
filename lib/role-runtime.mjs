import {completeJson,routeForPolicy} from './model-gateway.mjs';

const ROLE_POLICY={verification:'verifier',verifier:'verifier',quality:'verifier',evaluation:'verifier',research:'routine_executor',execution:'routine_executor',product:'routine_executor',brand:'routine_executor',offer_design:'routine_executor',channel_strategy:'routine_executor',go_to_market:'routine_executor',finance:'specialist_executor',economics:'specialist_executor',market_strategy:'specialist_executor',venture_strategy:'specialist_executor'};
const safeName=name=>String(name||'role-output.md').replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'role-output.md';
const timeoutMs=()=>Math.max(8000,Math.min(60000,Number(process.env.ROLE_EXECUTION_TIMEOUT_MS||36000)));
const emit=async(onProgress,event)=>{try{await onProgress?.(event)}catch{}};
export function policyForRole(role){return ROLE_POLICY[String(role||'').toLowerCase()]||'routine_executor'}
function normalizeRoleOutput(role,r){const raw=r?.json||{},files=[];for(const f of Array.isArray(raw.files)?raw.files.slice(0,4):[]){const content=String(f?.content||'').trim();if(content.length<80)continue;files.push({name:safeName(f?.name||`${role}.md`),mimeType:String(f?.mimeType||'text/markdown'),content:content.slice(0,100000),role})}return {role,summary:String(raw.summary||'').slice(0,1000),findings:Array.isArray(raw.findings)?raw.findings.map(String).slice(0,12):[],files,provider:r.provider,model:r.model,policy:r.policy,telemetry:r.telemetry}}
async function callRole({role,policy,request,plan,context,publicEvidence,upstream,telemetry}){return completeJson({policy,role,timeoutMs:timeoutMs(),temperature:0,onTelemetry:call=>telemetry.push(call),system:`You are the ${role.replaceAll('_',' ')} function inside a real operating organization. Work only on your function. Return strict JSON {"summary":string,"findings":string[],"files":[{"name":string,"mimeType":string,"content":string}]}. Produce concrete material another function can use. Respect the mission contract and budget. Label assumptions and estimates locally. Never invent external facts. Use supplied public evidence only when it supports the claim. Do not narrate workflow.`,user:JSON.stringify({request,missionKind:plan.kind,objective:plan.objective,contract:plan.contract,role,context,publicEvidence,upstream})})}
function roleNeedsStrategy(role){return /^(brand|offer_design|channel_strategy|go_to_market|finance|economics)$/i.test(role)}

export async function executeOrganizationRoles({request,plan,context=null,publicEvidence=null,onProgress=null}={}){
  const roles=(plan?.organization?.functions||[]).filter(role=>role&&!/^(verification|verifier|quality|evaluation)$/i.test(role));
  const telemetry=[],outputs=[];
  // DAG wave 1: independent functions start together. Venture/market strategy may feed dependent commercial roles.
  const roots=roles.filter(role=>!roleNeedsStrategy(role)||!roles.some(x=>/^(venture_strategy|market_strategy)$/i.test(x)));
  const dependents=roles.filter(role=>!roots.includes(role));
  const runRole=async(role,upstream=[])=>{
    const policy=policyForRole(role),route=routeForPolicy(policy);await emit(onProgress,{type:'ROLE_STARTED',message:`${role.replaceAll('_',' ')} started · ${route.provider}/${route.model}`,data:{role,policy,provider:route.provider,model:route.model}});
    try{let r;try{r=await callRole({role,policy,request,plan,context,publicEvidence,upstream,telemetry})}catch(first){if(policy!=='routine_executor')throw first;const escalation='specialist_executor',next=routeForPolicy(escalation);await emit(onProgress,{type:'ROLE_ESCALATED',message:`${role.replaceAll('_',' ')} failed on ${first.provider||route.provider}; escalating to ${next.provider}/${next.model}.`,data:{role,from:{policy,provider:first.provider||route.provider,model:first.model||route.model},to:{policy:escalation,provider:next.provider,model:next.model},failure:first.telemetry||null}});r=await callRole({role,policy:escalation,request,plan,context,publicEvidence,upstream,telemetry})}
      const out=normalizeRoleOutput(role,r);outputs.push(out);await emit(onProgress,{type:'ROLE_COMPLETED',message:`${role.replaceAll('_',' ')} completed · ${r.provider}/${r.model} · ${out.files.length} artifact${out.files.length===1?'':'s'}`,data:{role,policy:r.policy,provider:r.provider,model:r.model,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd,fileNames:out.files.map(f=>f.name)}});
      // Progressive artifacts are explicitly drafts. READY remains reserved for post-verifier output.
      for(const file of out.files)await emit(onProgress,{type:'DRAFT_ARTIFACT_AVAILABLE',message:`Draft available · ${file.name} · ${role.replaceAll('_',' ')}`,data:{role,name:file.name,mimeType:file.mimeType,content:file.content,state:'draft',verified:false}});
      return out;
    }catch(error){if(error?.telemetry&&!telemetry.includes(error.telemetry))telemetry.push(error.telemetry);await emit(onProgress,{type:'ROLE_FAILED',message:`${role.replaceAll('_',' ')} failed · ${error.provider||route.provider}/${error.model||route.model}. Continuing with completed functions.`,data:{role,policy,error:String(error?.message||error),provider:error?.provider||route.provider,model:error?.model||route.model,telemetry:error?.telemetry||null}});return null}
  };
  await emit(onProgress,{type:'ROLE_DAG_STARTED',message:`Organization executing ${roots.length} independent function${roots.length===1?'':'s'} in parallel.`,data:{roots,dependents}});
  const rootResults=(await Promise.all(roots.map(role=>runRole(role)))).filter(Boolean);
  const upstream=rootResults.map(out=>({role:out.role,summary:out.summary,findings:out.findings,files:out.files.map(f=>({name:f.name,content:f.content.slice(0,12000)}))}));
  if(dependents.length)await Promise.all(dependents.map(role=>runRole(role,upstream)));
  return {outputs:roles.map(role=>outputs.find(x=>x.role===role)).filter(Boolean),telemetry};
}

export async function synthesizeRoleOutputs({request,plan,roleRun,context=null,publicEvidence=null,onProgress=null}={}){
  if(!roleRun?.outputs?.length)return null;
  // Normal synthesis is specialist-tier. Frontier is reserved for a later quality/escalation decision.
  const policy='specialist_executor',route=routeForPolicy(policy);await emit(onProgress,{type:'ROLE_SYNTHESIS_STARTED',message:`Organization synthesis started · ${route.provider}/${route.model}`,data:{role:'organization_synthesizer',policy,provider:route.provider,model:route.model,inputRoles:roleRun.outputs.map(x=>x.role)}});
  try{const r=await completeJson({policy,role:'organization_synthesizer',timeoutMs:timeoutMs(),temperature:0,onTelemetry:call=>roleRun.telemetry.push(call),system:'You are Company Zero organization synthesizer. Return strict JSON {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. Merge the independent role outputs into coherent user-facing deliverables. Preserve disagreements as labelled uncertainty. Do not invent facts or claim actions not evidenced. Cover the mission contract, not the internal workflow.',user:JSON.stringify({request,executionPlan:plan,context,publicEvidence,roleOutputs:roleRun.outputs})});await emit(onProgress,{type:'ROLE_SYNTHESIS_COMPLETED',message:`Organization synthesis completed · ${r.provider}/${r.model}`,data:{role:'organization_synthesizer',policy:r.policy,provider:r.provider,model:r.model,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd}});return r}catch(error){await emit(onProgress,{type:'ROLE_SYNTHESIS_FAILED',message:`Organization synthesis failed · ${error.provider||route.provider}/${error.model||route.model}. Falling back to completed role artifacts.`,data:{error:String(error?.message||error),telemetry:error?.telemetry||null}});return null}
}
