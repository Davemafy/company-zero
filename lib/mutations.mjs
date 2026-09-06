import {DomainError} from './contracts.mjs';
export const MUTATION_TYPES=Object.freeze(['AddRole','RemoveRole','SplitRole','MergeRoles','MoveResponsibility','AddCapability','RemoveCapability','SwapCapability','ChangeModel','ChangeInstructions','ChangeRouting','AddVerifier','RemoveVerifier','ChangeEscalation','ChangeMemoryPolicy','ChangeBudgetAllocation','ChangeTopology']);
const TYPES=new Set(MUTATION_TYPES);
export function validateMutation(mutation,{diagnosis,capabilities=[]}={}){
  if(!mutation||!TYPES.has(mutation.type))throw new DomainError('invalid_mutation',422,{type:mutation?.type});
  if(!Array.isArray(mutation.evidenceIds)||!mutation.evidenceIds.length)throw new DomainError('mutation_evidence_required',422);
  const grounded=new Set(diagnosis?.data?.evidenceIds||diagnosis?.evidenceIds||[]);
  if(mutation.evidenceIds.some(x=>!grounded.has(x)))throw new DomainError('ungrounded_mutation',422);
  if(mutation.capabilityId&&!capabilities.some(x=>x.id===mutation.capabilityId))throw new DomainError('unknown_mutation_capability',422);
  return mutation;
}
export function defaultMutations(diagnosis,capabilities=[]){
  const evidenceIds=[...(diagnosis.data?.evidenceIds||[])];
  const verifier=capabilities.find(x=>/verify|valid|check|review|audit|test|assert/i.test(`${x.data?.name||''} ${x.data?.description||''}`));
  const out=[];
  if(verifier)out.push({type:'AddVerifier',label:`Add ${verifier.data.name}`,capabilityId:verifier.id,evidenceIds,rationale:'Test whether an available verification capability addresses the observed failures.'});
  out.push({type:'ChangeRouting',label:'Move verification earlier',evidenceIds,rationale:'Test a topology change without granting new capabilities.'});
  out.push({type:'ChangeBudgetAllocation',label:'Reallocate role budget',evidenceIds,rationale:'Test whether resource allocation is constraining successful execution.'});
  return out.slice(0,3);
}
export function applyMutation(baseData,mutation,{id=()=>crypto.randomUUID()}={}){
  const copy=structuredClone(baseData),roles=copy.roles||[];
  copy.mutation=structuredClone(mutation);
  if(mutation.type==='AddVerifier')roles.push({id:id(),name:mutation.label?.replace(/^Add /,'')||'Evidence Verifier',purpose:mutation.rationale||'Independent verification',instructions:'Verify only. Do not perform side effects.',capabilityIds:mutation.capabilityId?[mutation.capabilityId]:[],modelPolicy:{provider:'none'},budgetUsd:0});
  else if(mutation.type==='ChangeRouting'&&roles.length>1)copy.routes=roles.slice(0,-1).map((r,i)=>({from:r.id,to:roles[i+1].id,condition:i===roles.length-2?'verified':'success'}));
  else if(mutation.type==='ChangeBudgetAllocation'){const total=Number(copy.policies?.dailyBudgetUsd||0);if(roles.length){const each=Number((total/roles.length).toFixed(2));roles.forEach(r=>r.budgetUsd=each)}}
  return copy;
}
