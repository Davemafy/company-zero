import {completeJson,modelForPolicy} from './model-gateway.mjs';

const ROLE_POLICY={
  verification:'verifier',verifier:'verifier',quality:'verifier',evaluation:'verifier',
  finance:'specialist_executor',economics:'specialist_executor',market_strategy:'specialist_executor',offer_design:'specialist_executor',channel_strategy:'specialist_executor',venture_strategy:'specialist_executor',brand:'specialist_executor',go_to_market:'specialist_executor',product:'specialist_executor',research:'specialist_executor',execution:'specialist_executor'
};
const safeName=name=>String(name||'role-output.md').replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'role-output.md';
const timeoutMs=()=>Math.max(8000,Math.min(60000,Number(process.env.ROLE_EXECUTION_TIMEOUT_MS||36000)));

export function policyForRole(role){return ROLE_POLICY[String(role||'').toLowerCase()]||'specialist_executor'}

function normalizeRoleOutput(role,r){
  const raw=r?.json||{};const files=[];
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,4):[]){const content=String(f?.content||'').trim();if(content.length<80)continue;files.push({name:safeName(f?.name||`${role}.md`),mimeType:String(f?.mimeType||'text/markdown'),content:content.slice(0,100000),role})}
  return {role,summary:String(raw.summary||'').slice(0,1000),findings:Array.isArray(raw.findings)?raw.findings.map(String).slice(0,12):[],files,model:r.model,policy:r.policy,telemetry:r.telemetry};
}

export async function executeOrganizationRoles({request,plan,context=null,publicEvidence=null,onProgress=null}={}){
  const roles=(plan?.organization?.functions||[]).filter(Boolean);
  const outputs=[];const telemetry=[];let shared=[];
  for(const role of roles){
    // Verification is deliberately independent and runs after synthesis/quality gates, not as an artifact author.
    if(/^(verification|verifier|quality|evaluation)$/i.test(role))continue;
    const policy=policyForRole(role),model=modelForPolicy(policy);
    await onProgress?.({type:'ROLE_STARTED',message:`${role.replaceAll('_',' ')} started · ${model}`,data:{role,policy,model}}).catch?.(()=>{});
    try{
      const r=await completeJson({policy,role,timeoutMs:timeoutMs(),temperature:0,onTelemetry:call=>{telemetry.push(call)},
        system:`You are the ${role.replaceAll('_',' ')} function inside a real operating organization. Work only on your function. Return strict JSON {"summary":string,"findings":string[],"files":[{"name":string,"mimeType":string,"content":string}]}. Produce concrete material another function can use. Respect the mission contract and budget. Label assumptions and estimates. Never invent external facts. Use supplied public evidence only when it supports the claim. Do not narrate workflow.`,
        user:JSON.stringify({request,missionKind:plan.kind,objective:plan.objective,contract:plan.contract,role,context,publicEvidence,upstream:shared.slice(-4)})});
      const out=normalizeRoleOutput(role,r);outputs.push(out);shared.push({role,summary:out.summary,findings:out.findings,files:out.files.map(f=>({name:f.name,content:f.content.slice(0,12000)}))});
      await onProgress?.({type:'ROLE_COMPLETED',message:`${role.replaceAll('_',' ')} completed · ${r.model} · ${out.files.length} artifact${out.files.length===1?'':'s'}`,data:{role,policy:r.policy,model:r.model,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd,fileNames:out.files.map(f=>f.name)}}).catch?.(()=>{});
    }catch(error){
      if(error?.telemetry&&!telemetry.includes(error.telemetry))telemetry.push(error.telemetry);
      await onProgress?.({type:'ROLE_FAILED',message:`${role.replaceAll('_',' ')} failed · ${error.model||model}. Continuing with completed functions.`,data:{role,policy,error:String(error?.message||error),model:error?.model||model,telemetry:error?.telemetry||null}}).catch?.(()=>{});
    }
  }
  return {outputs,telemetry};
}

export async function synthesizeRoleOutputs({request,plan,roleRun,context=null,publicEvidence=null,onProgress=null}={}){
  if(!roleRun?.outputs?.length)return null;
  const policy='frontier_escalation',model=modelForPolicy(policy);
  await onProgress?.({type:'ROLE_SYNTHESIS_STARTED',message:`Organization synthesis started · ${model}`,data:{role:'organization_synthesizer',policy,model,inputRoles:roleRun.outputs.map(x=>x.role)}}).catch?.(()=>{});
  try{
    const r=await completeJson({policy,role:'organization_synthesizer',timeoutMs:timeoutMs(),temperature:0,onTelemetry:call=>roleRun.telemetry.push(call),
      system:'You are Company Zero organization synthesizer. Return strict JSON {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. Merge the independent role outputs into coherent user-facing deliverables. Preserve disagreements as labelled uncertainty. Do not invent facts or claim actions not evidenced. Cover the mission contract, not the internal workflow.',
      user:JSON.stringify({request,executionPlan:plan,context,publicEvidence,roleOutputs:roleRun.outputs})});
    await onProgress?.({type:'ROLE_SYNTHESIS_COMPLETED',message:`Organization synthesis completed · ${r.model}`,data:{role:'organization_synthesizer',policy:r.policy,model:r.model,usage:r.usage,latencyMs:r.latencyMs,costUsd:r.costUsd}}).catch?.(()=>{});
    return r;
  }catch(error){await onProgress?.({type:'ROLE_SYNTHESIS_FAILED',message:`Organization synthesis failed · ${error.model||model}. Falling back to completed role artifacts.`,data:{error:String(error?.message||error),telemetry:error?.telemetry||null}}).catch?.(()=>{});return null}
}
