const MODALITIES=new Set(['informational','digital','physical','transactional','communication','external_system','mixed','unknown']);
const clean=(v,max=12)=>Array.isArray(v)?v.filter(Boolean).slice(0,max):[];

export function normalizeOutcomeModality(value){
  const v=String(value||'unknown').toLowerCase();
  return MODALITIES.has(v)?v:'unknown';
}

export function capabilityEffectModalities(capability={}){
  const d=capability.data||capability;
  const explicit=clean(d.effectModalities).map(normalizeOutcomeModality).filter(x=>x!=='unknown');
  if(explicit.length)return [...new Set(explicit)];
  if(d.operationKind==='observe'||d.operationKind==='verify'||d.operationKind==='discover')return ['informational'];
  if(d.operationKind==='human')return ['communication'];
  if(d.operationKind==='change')return ['external_system'];
  return ['unknown'];
}

export function assessOutcomeClosure(goalContract={},capabilities=[]){
  const requested=normalizeOutcomeModality(goalContract.requestedOutcomeModality||goalContract.outcomeModality);
  const available=[...new Set(capabilities.flatMap(capabilityEffectModalities))];
  const direct=requested==='unknown'||requested==='mixed'?false:available.includes(requested);
  const informational=available.includes('informational')||available.includes('digital');
  const bestAchievable=direct?requested:(informational?'informational':available[0]||'unknown');
  return {
    requestedOutcomeModality:requested,
    availableEffectModalities:available,
    directOutcomeClosable:direct,
    bestAchievableModality:bestAchievable,
    missingActuator:direct?null:requested,
    law:'deliverable_completion_does_not_imply_requested_world_outcome'
  };
}
