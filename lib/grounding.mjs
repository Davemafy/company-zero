import {getPath} from './evaluator.mjs';
import {DomainError,validateSchema} from './contracts.mjs';

export const FACT_CLASSES=Object.freeze({USER_CLAIM:'USER_CLAIM',EXTERNAL_OBSERVATION:'EXTERNAL_OBSERVATION',MODEL_INFERENCE:'MODEL_INFERENCE',UNKNOWN:'UNKNOWN'});
const now=()=>new Date().toISOString();
const clean=(value,max=100)=>Array.isArray(value)?value.filter(Boolean).slice(0,max):[];
const finite=value=>Number.isFinite(Number(value));
const SECRET_KEY=/authorization|api[-_]?key|token|secret|password|cookie/i;

export function sanitizeForEvidence(value,depth=0){
  if(depth>8)return'[depth-limited]';if(value==null||typeof value==='number'||typeof value==='boolean')return value;if(typeof value==='string')return value.length>5000?`${value.slice(0,5000)}…[truncated]`:value;if(Array.isArray(value))return value.slice(0,100).map(x=>sanitizeForEvidence(x,depth+1));if(typeof value==='object'){const out={};for(const [key,item] of Object.entries(value).slice(0,200))out[key]=SECRET_KEY.test(key)?'[REDACTED]':sanitizeForEvidence(item,depth+1);return out}return String(value);
}

export function normalizeMeasurement(raw={},index=0){
  const metricId=String(raw.metricId||raw.id||`metric_${index+1}`);
  if(!raw.path)throw new DomainError('measurement_path_required',422,{metricId});
  return{metricId,path:String(raw.path),phase:['baseline','before','after','observation'].includes(raw.phase)?raw.phase:'observation',externalRefPath:raw.externalRefPath?String(raw.externalRefPath):null,attributionRefPath:raw.attributionRefPath?String(raw.attributionRefPath):null,observedAtPath:raw.observedAtPath?String(raw.observedAtPath):null,confidencePath:raw.confidencePath?String(raw.confidencePath):null};
}

export function contextClaims(context={}){
  const ignored=new Set(['operationPlan']);const claims=[];
  for(const [key,value] of Object.entries(context||{})){
    if(ignored.has(key)||value==null)continue;
    if(key==='currentMetrics'&&value&&typeof value==='object')for(const [metricId,metricValue] of Object.entries(value))claims.push({subject:'mission',predicate:`metric:${metricId}`,value:metricValue,classification:FACT_CLASSES.USER_CLAIM,sourceType:'user',sourceRef:'initial_context',observedAt:now(),confidence:null,evidenceIds:[]});
    else if(Array.isArray(value))for(const [index,item] of value.entries())claims.push({subject:key,predicate:'member',value:item,classification:FACT_CLASSES.USER_CLAIM,sourceType:'user',sourceRef:`initial_context:${key}:${index}`,observedAt:now(),confidence:null,evidenceIds:[]});
    else claims.push({subject:'context',predicate:key,value,classification:FACT_CLASSES.USER_CLAIM,sourceType:'user',sourceRef:`initial_context:${key}`,observedAt:now(),confidence:null,evidenceIds:[]});
  }
  return claims;
}

export function capabilityAssessment(capability){
  const data=capability.data||capability;
  return{capabilityId:capability.id,providerId:data.providerId,name:data.name,description:data.description,operationKind:data.operationKind,observes:clean(data.observes),changes:clean(data.changes),stateDomains:clean(data.stateDomains),permissions:clean(data.permissions),risk:data.risk,approvalRequired:Boolean(data.approvalRequired),estimatedCost:data.estimatedCost,reversibility:data.reversibility,measurements:clean(data.measurements),inputSchema:data.inputSchema,outputSchema:data.outputSchema,status:'DECLARED_NOT_YET_INVOKED'};
}


const STOP_WORDS=new Set(['the','a','an','and','or','to','of','for','with','from','in','on','at','by','me','my','our','this','that','it','is','are','be','get','make','help','please','success','condition','metric','metrics','state','external','capability','measurement','measure','observation','observe','verify','verification','improve','increase','reduce','generate','reach','achieve']);
const normalizeDomainToken=v=>String(v||'').toLowerCase().replace(/[^a-z0-9_.:-]+/g,' ').trim();
function semanticTokens(value){const text=normalizeDomainToken(value);const out=new Set();for(const raw of text.split(/\s+/)){if(!raw||STOP_WORDS.has(raw)||raw.length<3)continue;out.add(raw);for(const p of raw.split(/[_.:-]+/))if(p.length>=3&&!STOP_WORDS.has(p))out.add(p)}return out}
function goalSemanticDomains(goalContract={}){const out=new Set();for(const value of [goalContract.desiredState,...clean(goalContract.successCriteria,50).flatMap(x=>[x.metricId,x.description,x.unit,x.measurementMethod])])for(const token of semanticTokens(value))out.add(token);return [...out]}
function capabilitySemanticDomains(cap){const c=capabilityAssessment(cap),out=new Set();for(const value of [...c.stateDomains,...c.observes,...c.changes,...c.measurements.flatMap(m=>[m.metricId])])for(const token of semanticTokens(value))out.add(token);return [...out]}
function semanticOverlap(required=[],available=[]){const a=new Set(available);const matches=required.filter(x=>a.has(x));return{matches,score:required.length?matches.length/required.length:1}}
function capabilityMatchesDomains(cap,domains,{minimum=1}={}){if(!domains.length)return true;const available=capabilitySemanticDomains(cap);if(available.includes('mission_state')||available.includes('mission_outcome')||available.includes('outcome_metric'))return true;const overlap=semanticOverlap(domains,available);return overlap.matches.length>=minimum}

export function deriveCapabilityRequirements(goalContract={}){
  const desired=String(goalContract.desiredState||'').trim();
  const lower=desired.toLowerCase();
  const criteria=clean(goalContract.successCriteria,50);
  const domains=goalSemanticDomains(goalContract);
  const purelyObservational=/^(observe|understand|inspect|research|analy[sz]e|find|learn|check|read|monitor|summari[sz]e|compare|investigate)\b/i.test(desired)
    || (/\b(understand|observe|inspect|research|analy[sz]e|monitor|summari[sz]e|investigate)\b/.test(lower) && !/\b(generate|increase|reduce|grow|launch|sell|send|create|change|improve|reach|get|make|cut|fix|resolve|deliver|achieve)\b/.test(lower));
  return {
    domains,
    observe:{required:true,domains,reason:'A mission needs grounded state before execution can be evaluated.'},
    act:{required:!purelyObservational,domains,reason:purelyObservational?'The requested outcome is observational.':'The desired state requires a capability that can change semantically relevant external state.'},
    verify:{required:criteria.length>0,domains,metricIds:criteria.map(x=>String(x.metricId||'')).filter(Boolean),reason:criteria.length?'Success criteria require authoritative external measurement relevant to the desired state.':'No explicit measurable success criterion is available yet.'}
  };
}

export function assessCapabilitySufficiency(goalContract={},capabilities=[]){
  const requirements=deriveCapabilityRequirements(goalContract);
  const assessed=capabilities.map(capabilityAssessment);
  const relevant=cap=>capabilityMatchesDomains(cap,requirements.domains,{minimum:1});
  const observe=capabilities.filter(c=>['observe','discover','verify'].includes((c.data||c).operationKind)&&relevant(c)).map(capabilityAssessment);
  const act=capabilities.filter(c=>((c.data||c).operationKind==='change'||((c.data||c).changes||[]).length>0)&&relevant(c)).map(capabilityAssessment);
  const metricIds=new Set(requirements.verify.metricIds||[]);
  const verify=capabilities.filter(c=>{const data=c.data||c;const exact=(data.measurements||[]).some(m=>metricIds.has(String(m.metricId)));return (data.operationKind==='verify'||(data.measurements||[]).length>0)&&(exact||relevant(c))}).map(capabilityAssessment);
  const missing=[];
  if(requirements.observe.required&&!observe.length)missing.push({kind:'observe',reason:requirements.observe.reason,domains:requirements.domains});
  if(requirements.act.required&&!act.length)missing.push({kind:'act',reason:requirements.act.reason,domains:requirements.domains});
  if(requirements.verify.required&&!verify.length)missing.push({kind:'verify',reason:requirements.verify.reason,metricIds:[...metricIds],domains:requirements.domains});
  return {
    sufficient:missing.length===0,
    requirements,
    missing,
    bindings:{observe:observe.map(x=>x.capabilityId),act:act.map(x=>x.capabilityId),verify:verify.map(x=>x.capabilityId)},
    bindingDetails:{observe,act,verify},
    requiredCapabilityIds:[...new Set([...observe,...(requirements.act.required?act:[]),...(requirements.verify.required?verify:[])].map(x=>x.capabilityId))]
  };
}

export function extractGroundedObservations({output,capability,traceId,invocationId,runId,job,observedAt=now()}){
  const data=capability.data||capability;const mappings=clean(data.measurements);const observations=[];
  for(const mapping of mappings){
    const value=getPath(output,mapping.path);if(value===undefined)continue;
    const externalRef=mapping.externalRefPath?getPath(output,mapping.externalRefPath):null;
    const attributionRef=mapping.attributionRefPath?getPath(output,mapping.attributionRefPath):null;
    const at=mapping.observedAtPath?getPath(output,mapping.observedAtPath):observedAt;
    const confidence=mapping.confidencePath?getPath(output,mapping.confidencePath):null;
    observations.push({sessionId:job?.data?.operatingSessionId||null,missionVersion:job?.data?.missionVersion||null,runId,sourceType:'capability',source:`capability:${capability.id}`,capabilityId:capability.id,traceId,invocationId:invocationId||null,phase:['baseline','before','after','observation'].includes(output?.phase)?output.phase:mapping.phase,classification:FACT_CLASSES.EXTERNAL_OBSERVATION,metrics:{[mapping.metricId]:value},externalRef:externalRef==null?null:String(externalRef),attributionRef:attributionRef==null?null:String(attributionRef),evidenceIds:[traceId],observedAt:String(at||observedAt),confidence:finite(confidence)?Number(confidence):null});
  }
  return observations;
}

export function validateOperationPlan(plan,{capabilities,goalContract,strategySelectionId,missionVersion=null,organization=null}){
  if(!Array.isArray(plan)||!plan.length)throw new DomainError('operation_plan_required',409);
  const byId=new Map(capabilities.map(x=>[x.id,x]));
  return plan.map((step,index)=>{
    const cap=byId.get(step.capabilityId);if(!cap)throw new DomainError('operation_capability_unavailable',422,{index,capabilityId:step.capabilityId});
    const args=step.args??{};const errors=validateSchema(cap.data.inputSchema,args);if(errors.length)throw new DomainError('operation_arguments_invalid',422,{index,errors});
    if(step.strategySelectionId&&step.strategySelectionId!==strategySelectionId)throw new DomainError('operation_strategy_mismatch',409,{index});
    const role=organization?.data?.roles?.find(x=>x.capabilityIds?.includes(cap.id));
    return{index,missionVersion:Number(missionVersion||step.missionVersion||1),strategySelectionId,organizationRevisionId:organization?.id||step.organizationRevisionId||null,actorRoleId:role?.id||step.actorRoleId||null,actorRoleName:role?.name||step.actorRoleName||null,capabilityId:cap.id,operation:cap.data.name,args:sanitizeForEvidence(args),purpose:String(step.purpose||'Execute a capability permitted by the selected strategy.'),expectedObservation:step.expectedObservation||cap.data.measurements?.map(x=>x.metricId)||null,requiredAuthority:cap.data.permissions||[],budgetImplications:{estimatedCostUsd:Number(cap.data.estimatedCost?.usd||0),reservationRequired:true},riskLevel:cap.data.risk,reversibility:cap.data.reversibility||'unknown',approvalRequirement:Boolean(cap.data.approvalRequired),goalDesiredState:goalContract.desiredState};
  });
}

export function assessRelevance({mission,job,organization,capabilities}){
  const payload=job?.data?.payload||{};const contract=payload.goalContract;const selectionId=payload.strategySelectionId;
  let state='AMBIGUOUS',reasons=[];
  if(contract&&mission?.goalContract&&contract.desiredState===mission.goalContract.desiredState){state='RELEVANT';reasons.push('job_goal_matches_active_mission')}
  else if(contract&&mission?.goalContract){state='IRRELEVANT';reasons.push('job_goal_conflicts_with_active_mission')}
  else if(job?.data?.source?.startsWith('operating_session:')){state='AMBIGUOUS';reasons.push('operating_job_missing_matching_goal_contract')}
  else if(mission?.evaluationPolicy?.enforceMissionRelevance){state='AMBIGUOUS';reasons.push('manual_work_requires_explicit_mission_link')}
  else{state='RELEVANT';reasons.push('legacy_contract_job')}
  const organizationSelection=organization?.data?.selectedStrategy?.selectionId||organization?.data?.selectedStrategy?.id;if(selectionId&&organizationSelection&&selectionId!==organizationSelection){state='IRRELEVANT';reasons.push('strategy_revision_mismatch')}
  const plan=payload.operationPlan||[],byId=new Map(capabilities.map(x=>[x.id,x]));if(plan.some(x=>!byId.has(x.capabilityId))){state='MISSING_CAPABILITY';reasons.push('planned_capability_unavailable')}const boundaries=contract?.authorityBoundaries||mission?.goalContract?.authorityBoundaries||{};if(plan.some(step=>{const risk=byId.get(step.capabilityId)?.data?.risk;return['write','financial','external_side_effect'].includes(risk)&&['forbidden','denied','none'].includes(String(boundaries.externalSideEffects||boundaries[risk]||'').toLowerCase())})){state='OUTSIDE_AUTHORITY';reasons.push('planned_side_effect_outside_mission_authority')}
  return{state,reasons,missionId:mission?.id||null,missionVersion:job?.data?.missionVersion,organizationRevisionId:organization?.id||null,strategySelectionId:selectionId||null};
}
