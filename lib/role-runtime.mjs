import {completeJson,modelForPolicy,routeForPolicy} from './model-gateway.mjs';

const ROLE_POLICY={
  verification:'verifier',verifier:'verifier',quality:'verifier',evaluation:'verifier',
  // Routine/reversible organization work burns the existing TensorMux pool first.
  research:'routine_executor',execution:'routine_executor',product:'routine_executor',brand:'routine_executor',offer_design:'routine_executor',channel_strategy:'routine_executor',go_to_market:'routine_executor',
  // Numerically/strategically consequential functions start on AgentRouter specialists.
  finance:'specialist_executor',economics:'specialist_executor',market_strategy:'specialist_executor',venture_strategy:'specialist_executor'
};
const safeName=name=>String(name||'role-output.md').replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'role-output.md';
const timeoutMs=()=>Math.max(8000,Math.min(60000,Number(process.env.ROLE_EXECUTION_TIMEOUT_MS||36000)));
export function policyForRole(role){return ROLE_POLICY[String(role||'').toLowerCase()]||'routine_executor'}
function normalizeRoleOutput(role,r){const raw=r?.json||{},files=[];for(const f of Array.isArray(raw.files)?raw.files.slice(0,4):[]){const content=String(f?.content||'').trim();if(content.length<80)continue;files.push({name:safeName(f?.name||`${role}.md`),mimeType:String(f?.mimeType||'text/markdown'),content:content.slice(0,100000),role})}return {role,summary:String(raw.summary||'').slice(0,1000),findings:Array.isArray(raw.findings)?raw.findings.map(String).slice(0,12):[],files,provider:r.provider,model:r.model,policy:r.policy,telemetry:r.telemetry}}
async function callRole({role,policy,request,plan,context,publicEvidence,shared,telemetry}){return completeJson({policy,role,timeoutMs:timeoutMs(),temperature:0,onTelemetry:call=>telemetry.push(call),system:`You are the ${role.replaceAll('_',' ')} function inside a real operating organization. Work only on your function. Return strict JSON {"summary":string,"findings":string[],"files":[{"name":string,"mimeType":string,"content":string}]}. Produce concrete material another function can use. Respect the mission contract and budget. Label assumptions and estimates. Never invent external facts. Use supplied public evidence only when it supports the claim. Do not narrate workflow.`,user:JSON.stringify({request,missionKind:plan.kind,objective:plan.objective,contract:plan.contract,role,context,publicEvidence,upstream:shared.slice(-4)})})}

export async function executeOrganizationRoles({request,plan,context=null,publicEvidence=null,onProgress=null}={}){
  const roles=(plan?.organization?.functions||[]).filter(Boolean),outputs=[],telemetry=[];let shared=[];
  for(const role of roles){if(/^(verification|verifier|quality|evaluation)$/i.test(role))continue;
    const policy=policyForRole(role),route=routeForPolicy(policy);await onProgress?.({type:'ROLE_STARTED',message:`${role.replaceAll('_',' ')} started · ${route.provider}/${route.model}`,data:{role,policy,provider:route.provider,model:route.model}}).catch?.(()=>{});
    try{
      let r;try{r=await callRole({role,policy,request,plan,context,publicEvidence,shared,telemetry})}catch(first){
        // A failed routine TensorMux role gets one bounded AgentRouter specialist escalation.
        if(policy!=='routine_executor')throw first;
        const escalation='specialist_executor',next=routeForPolicy(escalation);await onProgress?.({type:'ROLE_ESCALATED',message:`${role.replaceAll('_',' ')} failed on ${first.provider||route.provider}; escalating to ${next.provider}/${next.model}.`,data:{role,from:{policy,provider:first.provider||route.provider,model:first.model||route.model},to:{policy:escalation,provider:next.provider,model:next.model},failure:first.telemetry||null}}).catch?.(()=>{});
        r=await callRole({role,policy:escalation,request,plan,context,publicEvidence,shared,telemetry});
      }
      const out=normalizeRoleOutput(role,r);outputs.push(out);shared.push({role,summary:out.summary,findings:out.findings,files:out.files.map(f=>({name:f.name,content:f.content.slice(0,12000)}))});
      await onProgress?.({type:'ROLE_COMPLETED',message:`${role.replaceAll('_',' ')} completed · ${r.provider}/${r.model} · ${out.files.length} artifact${out.files.length===1?'':'s'}`,data:{role,policy:r.policy,provider:r.provider,model:r.model,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd,fileNames:out.files.map(f=>f.name)}}).catch?.(()=>{});
    }catch(error){if(error?.telemetry&&!telemetry.includes(error.telemetry))telemetry.push(error.telemetry);await onProgress?.({type:'ROLE_FAILED',message:`${role.replaceAll('_',' ')} failed · ${error.provider||route.provider}/${error.model||route.model}. Continuing with completed functions.`,data:{role,policy,error:String(error?.message||error),provider:error?.provider||route.provider,model:error?.model||route.model,telemetry:error?.telemetry||null}}).catch?.(()=>{})}
  }
  return {outputs,telemetry};
}

export async function synthesizeRoleOutputs({request,plan,roleRun,context=null,publicEvidence=null,onProgress=null}={}){
  if(!roleRun?.outputs?.length)return null;const policy='frontier_escalation',route=routeForPolicy(policy);
  await onProgress?.({type:'ROLE_SYNTHESIS_STARTED',message:`Organization synthesis started · ${route.provider}/${route.model}`,data:{role:'organization_synthesizer',policy,provider:route.provider,model:route.model,inputRoles:roleRun.outputs.map(x=>x.role)}}).catch?.(()=>{});
  try{const r=await completeJson({policy,role:'organization_synthesizer',timeoutMs:timeoutMs(),temperature:0,onTelemetry:call=>roleRun.telemetry.push(call),system:'You are Company Zero organization synthesizer. Return strict JSON {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. Merge the independent role outputs into coherent user-facing deliverables. Preserve disagreements as labelled uncertainty. Do not invent facts or claim actions not evidenced. Cover the mission contract, not the internal workflow.',user:JSON.stringify({request,executionPlan:plan,context,publicEvidence,roleOutputs:roleRun.outputs})});await onProgress?.({type:'ROLE_SYNTHESIS_COMPLETED',message:`Organization synthesis completed · ${r.provider}/${r.model}`,data:{role:'organization_synthesizer',policy:r.policy,provider:r.provider,model:r.model,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd}}).catch?.(()=>{});return r}catch(error){await onProgress?.({type:'ROLE_SYNTHESIS_FAILED',message:`Organization synthesis failed · ${error.provider||route.provider}/${error.model||route.model}. Falling back to completed role artifacts.`,data:{error:String(error?.message||error),telemetry:error?.telemetry||null}}).catch?.(()=>{});return null}
}
