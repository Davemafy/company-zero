// Compatibility facade while Company Zero migrates callers to the provider-neutral model gateway.
import {modelGatewayConfigured,modelForPolicy,completeJson,auditWithVerifier} from './model-gateway.mjs';
import {executeOrganizationRoles,synthesizeRoleOutputs} from './role-runtime.mjs';

export function tensormuxConfigured(){return modelGatewayConfigured()}
export function tensormuxModel(stage='default'){
  if(stage==='planner')return modelForPolicy('cheap_planner');
  if(stage==='planner_fallback')return modelForPolicy('frontier_escalation');
  if(stage==='execution')return modelForPolicy('routine_executor');
  if(stage==='verifier'||stage==='audit')return modelForPolicy('verifier');
  return modelForPolicy('routine_executor');
}
function policyForModel(model){if(model===modelForPolicy('cheap_planner'))return 'cheap_planner';if(model===modelForPolicy('frontier_escalation'))return 'frontier_escalation';if(model===modelForPolicy('verifier'))return 'verifier';if(model===modelForPolicy('specialist_executor'))return 'specialist_executor';return 'routine_executor'}
function parseExecution(user){try{const x=JSON.parse(String(user||'{}'));return x?.executionPlan?.organization?.functions?.length?x:null}catch{return null}}
function deterministicOrganizationResult(roleRun){
  const files=roleRun.outputs.flatMap(x=>x.files||[]);
  if(!files.length)return null;
  const roles=roleRun.outputs.map(x=>x.role.replaceAll('_',' '));
  return {json:{title:'Organization result',summary:`${roleRun.outputs.length} independent functions completed: ${roles.join(', ')}. Candidate artifacts are assembled deterministically and still require verification before READY.`,files},usage:null,id:null,model:'deterministic-assembly',provider:'local',policy:'organization_assembly',role:'organization_assembly',roleOutputs:roleRun.outputs,roleTelemetry:roleRun.telemetry,roleTelemetrySummary:roleRun.telemetrySummary||null};
}

export async function completeJsonWithTensorMux({system,user,timeoutMs=null,temperature=0,model=null,role=null,policy=null,onTelemetry=null,onProgress=null}={}){
  const execution=/Company Zero's execution organization/i.test(String(system||''))?parseExecution(user):null;
  if(execution){
    const acceptedAt=Date.now();
    await onProgress?.({type:'LATENCY_ACCEPTED',message:'Mission execution accepted locally.',data:{acceptedAt,elapsedMs:0}}).catch?.(()=>{});
    const roleRun=await executeOrganizationRoles({request:execution.request,plan:execution.executionPlan,context:execution.context,publicEvidence:execution.publicEvidence,onProgress});
    const rolesCompletedAt=Date.now();
    await onProgress?.({type:'LATENCY_ROLES_COMPLETED',message:`Organization roles completed in ${rolesCompletedAt-acceptedAt}ms.`,data:{acceptedAt,rolesCompletedAt,elapsedMs:rolesCompletedAt-acceptedAt,roleCount:roleRun.outputs.length}}).catch?.(()=>{});
    // Normal path: do not pay a second LLM latency wall merely to merge files. The verifier gates READY later.
    const assembled=deterministicOrganizationResult(roleRun);
    if(assembled){
      await onProgress?.({type:'ORGANIZATION_ASSEMBLED',message:`Deterministically assembled ${assembled.json.files.length} candidate artifact${assembled.json.files.length===1?'':'s'} with no synthesis model call.`,data:{provider:'local',model:'deterministic-assembly',fileNames:assembled.json.files.map(f=>f.name),elapsedMs:Date.now()-acceptedAt}}).catch?.(()=>{});
      return assembled;
    }
    // Escalation-only synthesis: useful when roles completed but produced no directly publishable files.
    const synthesis=await synthesizeRoleOutputs({request:execution.request,plan:execution.executionPlan,roleRun,context:execution.context,publicEvidence:execution.publicEvidence,onProgress});
    if(synthesis)return {...synthesis,roleOutputs:roleRun.outputs,roleTelemetry:roleRun.telemetry,roleTelemetrySummary:roleRun.telemetrySummary||null};
    await onProgress?.({type:'ORGANIZATION_NO_ARTIFACTS',message:'Organization completed without a publishable artifact. Stopping here instead of falling through to a legacy monolithic model call.',data:{roleCount:roleRun.outputs.length,telemetrySummary:roleRun.telemetrySummary||null,elapsedMs:Date.now()-acceptedAt}}).catch?.(()=>{});
    const failureCodes=[...new Set((roleRun.telemetry||[]).filter(call=>call?.success===false).map(call=>call?.failure?.code).filter(Boolean))];
    const failureReason=failureCodes.length?`organization_no_artifacts:${failureCodes.join(',')}`:'organization_no_artifacts';
    const error=Object.assign(Error(failureReason),{status:503,provider:'local',model:'deterministic-assembly',roleTelemetry:roleRun.telemetry,roleTelemetrySummary:roleRun.telemetrySummary||null});
    throw error;
  }
  const chosenPolicy=policy||(model?policyForModel(model):'routine_executor');
  return completeJson({system,user,timeoutMs,temperature,model,role:role||chosenPolicy,policy:chosenPolicy,onTelemetry});
}
export async function auditRunWithTensorMux(args={}){return auditWithVerifier(args)}
