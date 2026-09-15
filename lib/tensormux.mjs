// Compatibility facade: existing Company Zero callers keep this module while all model traffic uses AgentRouter.
import {modelGatewayConfigured,modelForPolicy,completeJson,auditWithVerifier} from './model-gateway.mjs';
import {executeOrganizationRoles,synthesizeRoleOutputs} from './role-runtime.mjs';

export function tensormuxConfigured(){return modelGatewayConfigured()}
export function tensormuxModel(stage='default'){
  if(stage==='planner')return modelForPolicy('cheap_planner');
  if(stage==='planner_fallback')return modelForPolicy('frontier_escalation');
  if(stage==='execution')return modelForPolicy('specialist_executor');
  if(stage==='verifier'||stage==='audit')return modelForPolicy('verifier');
  return modelForPolicy('specialist_executor');
}

function policyForModel(model){
  if(model===modelForPolicy('cheap_planner'))return 'cheap_planner';
  if(model===modelForPolicy('frontier_escalation'))return 'frontier_escalation';
  if(model===modelForPolicy('verifier'))return 'verifier';
  return 'specialist_executor';
}
function parseExecution(user){try{const x=JSON.parse(String(user||'{}'));return x?.executionPlan?.organization?.functions?.length?x:null}catch{return null}}

export async function completeJsonWithTensorMux({system,user,timeoutMs=null,temperature=0,model=null,role=null,policy=null,onTelemetry=null}={}){
  const execution=/Company Zero's execution organization/i.test(String(system||''))?parseExecution(user):null;
  if(execution){
    const roleRun=await executeOrganizationRoles({request:execution.request,plan:execution.executionPlan,context:execution.context,publicEvidence:execution.publicEvidence,onProgress:null});
    const synthesis=await synthesizeRoleOutputs({request:execution.request,plan:execution.executionPlan,roleRun,context:execution.context,publicEvidence:execution.publicEvidence,onProgress:null});
    if(synthesis)return {...synthesis,roleOutputs:roleRun.outputs,roleTelemetry:roleRun.telemetry};
    const files=roleRun.outputs.flatMap(x=>x.files||[]);
    if(files.length)return {json:{title:'Organization result',summary:`${roleRun.outputs.length} independent functions completed.`,files},usage:null,id:null,model:'multi-role',provider:'agentrouter',policy:'organization',role:'organization',roleOutputs:roleRun.outputs,roleTelemetry:roleRun.telemetry};
  }
  const chosenPolicy=policy||(model?policyForModel(model):'specialist_executor');
  return completeJson({system,user,timeoutMs,temperature,model,role:role||chosenPolicy,policy:chosenPolicy,onTelemetry});
}

export async function auditRunWithTensorMux(args={}){return auditWithVerifier(args)}
