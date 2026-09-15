// Compatibility facade: existing Company Zero callers keep this module while all model traffic uses AgentRouter.
import {modelGatewayConfigured,modelForPolicy,completeJson,auditWithVerifier} from './model-gateway.mjs';

export function tensormuxConfigured(){return modelGatewayConfigured()}
export function tensormuxModel(stage='default'){
  if(stage==='planner')return modelForPolicy('cheap_planner');
  if(stage==='planner_fallback')return modelForPolicy('frontier_escalation');
  if(stage==='execution')return modelForPolicy('specialist_executor');
  if(stage==='verifier'||stage==='audit')return modelForPolicy('verifier');
  return modelForPolicy('specialist_executor');
}

export async function completeJsonWithTensorMux({system,user,timeoutMs=null,temperature=0,model=null,role=null,policy=null,onTelemetry=null}={}){
  const inferredPolicy=policy||(model?null:'specialist_executor');
  return completeJson({system,user,timeoutMs,temperature,model,role:role||inferredPolicy||'model_call',policy:inferredPolicy||'specialist_executor',onTelemetry});
}

export async function auditRunWithTensorMux(args={}){
  return auditWithVerifier(args);
}
