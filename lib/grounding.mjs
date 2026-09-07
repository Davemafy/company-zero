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
  return{capabilityId:capability.id,providerId:data.providerId,name:data.name,description:data.description,operationKind:data.operationKind,observes:clean(data.observes),changes:clean(data.changes),permissions:clean(data.permissions),risk:data.risk,approvalRequired:Boolean(data.approvalRequired),estimatedCost:data.estimatedCost,reversibility:data.reversibility,measurements:clean(data.measurements),inputSchema:data.inputSchema,outputSchema:data.outputSchema,status:'DECLARED_NOT_YET_INVOKED'};
}

function capabilityData(capability){return capability?.data||capability||{}}
function targetMetricIds(goalContract={}){return clean(goalContract.successCriteria).map(x=>String(x.metricId||x.id||'')).filter(Boolean)}
function observationalIntent(goalContract={}){
  const text=String(goalContract.desiredState||'').toLowerCase();
  const observe=/\b(observe|inspect|analy[sz]e|research|summari[sz]e|report|monitor|measure|verify|check|audit|discover|identify|find|list|explain|compare|read|understand|learn)\b/.test(text);
  const change=/\b(generate|increase|reduce|decrease|grow|sell|buy|launch|send|publish|create|change|update|fix|improve|reach|get|acquire|convert|book|schedule|deploy|remove|add|cut)\b/.test(text);
  return observe&&!change;
}

export function capabilityRoles(capability,goalContract={}){
  const data=capabilityData(capability),metrics=targetMetricIds(goalContract),measurements=clean(data.measurements),observes=clean(data.observes).map(String),changes=clean(data.changes).map(String);
  const mappedMetrics=new Set(measurements.map(x=>String(x.metricId||'')).filter(Boolean));
  const targetMeasurement=metrics.length===0||metrics.some(metric=>mappedMetrics.has(metric)||observes.includes(metric));
  const hasExternalMeasurement=measurements.some(x=>(metrics.length===0||metrics.includes(String(x.metricId||'')))&&Boolean(x.externalRefPath));
  const observe=['observe','discover','verify'].includes(data.operationKind)||data.risk==='read'||observes.length>0||measurements.length>0;
  const act=['change','human'].includes(data.operationKind)||['write','financial','external_side_effect'].includes(data.risk)||changes.length>0;
  const verify=data.operationKind==='verify'||hasExternalMeasurement;
  return{observe,observeTarget:observe&&targetMeasurement,act,verify,verifiedMetricIds:[...mappedMetrics].filter(x=>metrics.length===0||metrics.includes(x))};
}

export function assessCapabilitySufficiency({goalContract={},capabilities=[],strategy=null}={}){
  const metricIds=targetMetricIds(goalContract),requiresAction=!observationalIntent(goalContract),requiredModes=['observe',...(requiresAction?['act']:[]),...(metricIds.length?['verify']:[])];
  const available=capabilities.map(cap=>({id:cap.id,roles:capabilityRoles(cap,goalContract)}));
  const boundIds=new Set(clean(strategy?.requiredCapabilityIds,200).map(String));
  const bound=available.filter(x=>boundIds.has(String(x.id)));
  const pool=strategy?bound:available;
  const availableFor=mode=>mode==='observe'?pool.some(x=>x.roles.observeTarget):mode==='act'?pool.some(x=>x.roles.act):pool.some(x=>x.roles.verify);
  const missingModes=requiredModes.filter(mode=>!availableFor(mode));
  const missingMetricVerification=metricIds.filter(metric=>!pool.some(x=>x.roles.verify&&x.roles.verifiedMetricIds.includes(metric)));
  if(missingMetricVerification.length&&!missingModes.includes('verify'))missingModes.push('verify');
  return{
    sufficient:missingModes.length===0&&missingMetricVerification.length===0,
    requiredModes,
    missingModes,
    metricIds,
    missingMetricVerification,
    requiresAction,
    boundCapabilityIds:[...boundIds],
    availableCapabilityIds:available.map(x=>x.id),
    roleCoverage:{observe:pool.filter(x=>x.roles.observeTarget).map(x=>x.id),act:pool.filter(x=>x.roles.act).map(x=>x.id),verify:pool.filter(x=>x.roles.verify).map(x=>x.id)}
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
    observations.push({sessionId:job?.data?.operatingSessionId||null,missionVersion:job?.data?.missionVersion||null,runId,sourceType:'capability',source:`capability:${capability.id}`,capabilityId:capability.id,traceId,invocationId:invocationId||null,phase:mapping.phase,classification:FACT_CLASSES.EXTERNAL_OBSERVATION,metrics:{[mapping.metricId]:value},externalRef:externalRef==null?null:String(externalRef),attributionRef:attributionRef==null?null:String(attributionRef),evidenceIds:[traceId],observedAt:String(at||observedAt),confidence:finite(confidence)?Number(confidence):null});
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
