import {modelGatewayConfigured,completeJson} from './model-gateway.mjs';

const configuredTimeout=()=>{const n=Number(process.env.TENSORMUX_TIMEOUT_MS||60000);return Number.isFinite(n)?Math.min(180000,Math.max(5000,n)):60000};

export async function proposeStructured({task,instructions,input,timeoutMs=configuredTimeout(),policy='cheap_planner',role=null,onTelemetry=null}){
  if(!modelGatewayConfigured())return null;
  const r=await completeJson({policy,role:role||String(task||'structured_reasoning'),timeoutMs,temperature:0,onTelemetry,
    system:`You are the ${task} proposal layer inside Company Zero. ${instructions} Return only valid JSON. Never claim an external fact that is not present in the supplied input. Mark unknown facts as unknown. Do not include chain-of-thought.`,
    user:JSON.stringify(input)});
  return {value:r.json,model:r.model,requestId:r.id,usage:r.usage,provider:r.provider,policy:r.policy,role:r.role,latencyMs:r.latencyMs,costUsd:r.costUsd,telemetry:r.telemetry};
}

export function reasoningConfigured(){return modelGatewayConfigured()}
