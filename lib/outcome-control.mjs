import {put,get,list,audit} from './store.mjs';
import {DomainError} from './contracts.mjs';
import {proposeStructured,reasoningConfigured} from './reasoning.mjs';
import {capabilityAssessment} from './grounding.mjs';

const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const record=(kind,data,companyId,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});
const clean=(v,max=100)=>Array.isArray(v)?v.filter(Boolean).slice(0,max):[];
const MODES=new Set(['observe','act','verify']);
const KINDS=new Set(['knowledge','decision','creative','product','operation','pipeline','measurement','evidence']);
const LIFECYCLE=['proposed','ready','producing','produced','executing','executed','verifying','verified','observed','evaluated','blocked','failed','cancelled'];
const TRANSITIONS={
  proposed:new Set(['ready','blocked','cancelled']),ready:new Set(['producing','executing','blocked','cancelled']),producing:new Set(['produced','failed','blocked']),produced:new Set(['verifying','verified','executing','evaluated','blocked']),executing:new Set(['executed','failed','blocked']),executed:new Set(['verifying','observed','evaluated','failed']),verifying:new Set(['verified','failed','blocked']),verified:new Set(['observed','evaluated']),observed:new Set(['evaluated']),evaluated:new Set([]),blocked:new Set(['ready','cancelled']),failed:new Set(['ready','cancelled']),cancelled:new Set([])
};
const STOP=new Set(['the','a','an','and','or','to','of','for','with','from','in','on','at','by','this','that','it','is','are','be','must','should','deliver','create','produce','change','verify','measure','outcome','mission','state','system']);

function tokens(value){const out=new Set();for(const raw of String(value||'').toLowerCase().replace(/[^a-z0-9_.:-]+/g,' ').split(/\s+/)){if(!raw||raw.length<3||STOP.has(raw))continue;out.add(raw);for(const p of raw.split(/[_.:-]+/))if(p.length>=3&&!STOP.has(p))out.add(p)}return out}
function overlap(a,b){const B=tokens(b),matches=[...tokens(a)].filter(x=>B.has(x));return matches.length}
function modesForCapability(cap){const d=cap.data||cap,out=new Set();if(d.operationKind==='change'||clean(d.changes).length)out.add('act');if(d.operationKind==='verify'||clean(d.measurements).length)out.add('verify');if(['observe','discover','verify'].includes(d.operationKind)||clean(d.observes).length||clean(d.measurements).length)out.add('observe');return[...out]}
function capabilityText(cap){const d=cap.data||cap;return [d.name,d.description,...clean(d.stateDomains),...clean(d.observes),...clean(d.changes),...clean(d.measurements).flatMap(x=>[x.metricId])].filter(Boolean).join(' ')}
function terminalForKind(kind){return ['operation','pipeline'].includes(kind)?'executed':['measurement','evidence'].includes(kind)?'verified':'produced'}

export async function emitRuntimeEvent(companyId,{sessionId=null,missionId=null,type,subjectKind=null,subjectId=null,data={},evidenceIds=[]}={}){
  if(!type)throw new DomainError('runtime_event_type_required',422);
  const evt=record('runtime_event',{sessionId,missionId,type,subjectKind,subjectId,data,evidenceIds:clean(evidenceIds),occurredAt:now()},companyId,'recorded');
  Object.assign(evt,await put(evt));return evt;
}

export function validateDeliverableGraph(nodes=[]){
  if(!Array.isArray(nodes)||!nodes.length)throw new DomainError('deliverable_graph_required',422);
  const keys=new Set(),byKey=new Map();
  for(const [i,n] of nodes.entries()){
    const key=String(n.key||`d${i+1}`).trim();if(!key)throw new DomainError('deliverable_key_required',422,{index:i});if(keys.has(key))throw new DomainError('duplicate_deliverable_key',422,{key});keys.add(key);byKey.set(key,n);
    if(!KINDS.has(String(n.kind)))throw new DomainError('invalid_deliverable_kind',422,{key,kind:n.kind});
    for(const mode of clean(n.requiredModes))if(!MODES.has(String(mode)))throw new DomainError('invalid_deliverable_capability_mode',422,{key,mode});
  }
  for(const [key,n] of byKey)for(const dep of clean(n.dependsOn)){if(!byKey.has(String(dep)))throw new DomainError('deliverable_dependency_missing',422,{key,dependency:dep});if(String(dep)===key)throw new DomainError('deliverable_self_dependency',422,{key})}
  const visiting=new Set(),visited=new Set(),order=[];
  const visit=key=>{if(visited.has(key))return;if(visiting.has(key))throw new DomainError('deliverable_graph_cycle',422,{key});visiting.add(key);for(const dep of clean(byKey.get(key).dependsOn))visit(String(dep));visiting.delete(key);visited.add(key);order.push(key)};
  for(const key of byKey.keys())visit(key);
  return{order,byKey};
}

function fallbackGraph(goalContract={}){
  const criteria=clean(goalContract.successCriteria);const domains=[...new Set([...tokens(goalContract.desiredState),...criteria.flatMap(x=>[...tokens(`${x.metricId||''} ${x.description||''}`)])])];
  return[
    {key:'baseline',title:'Establish the current reality',kind:'measurement',description:'Obtain an authoritative baseline for the outcome and the facts needed to choose a causal intervention.',dependsOn:[],requiredModes:['observe','verify'],stateDomains:domains,successConditionRefs:criteria.map(x=>x.metricId).filter(Boolean),terminalState:'verified'},
    {key:'intervention',title:'Produce the smallest evidence-backed intervention',kind:'decision',description:'Use the baseline and constraints to define one bounded, reversible intervention whose effect can be measured.',dependsOn:['baseline'],requiredModes:[],stateDomains:domains,terminalState:'produced'},
    {key:'execute',title:'Apply the intervention to the real system',kind:'operation',description:'Perform the authorized external change through a declared capability and retain the provider receipt.',dependsOn:['intervention'],requiredModes:['act'],stateDomains:domains,terminalState:'executed'},
    {key:'verify',title:'Independently measure what changed',kind:'measurement',description:'Observe the external system after the action using an independent verification capability and the same success metric.',dependsOn:['execute'],requiredModes:['verify'],stateDomains:domains,successConditionRefs:criteria.map(x=>x.metricId).filter(Boolean),terminalState:'verified'},
    {key:'evaluate',title:'Evaluate the outcome and decide what happens next',kind:'evidence',description:'Compare baseline and after evidence deterministically, then feed the result to the Governor for keep, rollback, replan, restructure or promotion.',dependsOn:['verify'],requiredModes:[],stateDomains:domains,terminalState:'evaluated'}
  ];
}

async function proposeGraph({goalContract,worldModel,selectedStrategy,capabilities}){
  if(!reasoningConfigured())return null;
  const proposal=await proposeStructured({task:'Deliverable Graph Planner',instructions:'Derive the smallest useful deliverable DAG required to move the supplied outcome toward its success conditions. Return deliverables only. Each deliverable needs key, title, kind from knowledge|decision|creative|product|operation|pipeline|measurement|evidence, description, dependsOn (keys), requiredModes chosen from observe|act|verify, stateDomains, successConditionRefs, and terminalState. Work backwards from what must become true. Do not invent external facts, do not hard-code an industry template, and do not create organization roles yet. Prefer 4-10 deliverables.',input:{goalContract,worldModel:{factIds:worldModel?.factIds||[],factCounts:worldModel?.factCounts||{},unknowns:worldModel?.unknowns||[]},selectedStrategy:selectedStrategy||null,capabilities:capabilities.map(capabilityAssessment)}});
  const raw=proposal?.value?.deliverables;if(!Array.isArray(raw)||!raw.length)return null;
  return raw.slice(0,12).map((x,i)=>({key:String(x.key||`d${i+1}`),title:String(x.title||`Deliverable ${i+1}`),kind:KINDS.has(String(x.kind))?String(x.kind):'decision',description:String(x.description||''),dependsOn:clean(x.dependsOn).map(String),requiredModes:clean(x.requiredModes).map(String).filter(x=>MODES.has(x)),stateDomains:clean(x.stateDomains).map(String),successConditionRefs:clean(x.successConditionRefs).map(String),terminalState:LIFECYCLE.includes(String(x.terminalState))?String(x.terminalState):terminalForKind(String(x.kind))}));
}

function bindDeliverable(node,capabilities){
  const requested=clean(node.requiredModes).filter(x=>MODES.has(x));const byMode={observe:[],act:[],verify:[]};const text=`${node.title} ${node.description} ${clean(node.stateDomains).join(' ')} ${clean(node.successConditionRefs).join(' ')}`;
  for(const cap of capabilities){const score=overlap(text,capabilityText(cap));for(const mode of modesForCapability(cap)){if(!requested.includes(mode))continue;if(score>0||clean(node.stateDomains).length===0)byMode[mode].push({id:cap.id,score,name:(cap.data||cap).name})}}
  for(const mode of Object.keys(byMode))byMode[mode].sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));
  const bindings={};for(const mode of requested)bindings[mode]=byMode[mode].slice(0,3).map(x=>x.id);
  const missing=requested.filter(mode=>!bindings[mode]?.length);
  return{bindings,missing};
}

export async function ensureSuccessConditions(companyId,{sessionId,missionId,goalContract}){
  const existing=(await list({companyId,kind:'success_condition',limit:500})).filter(x=>x.data.missionId===missionId);if(existing.length)return existing;
  const out=[];for(const [index,criterion] of clean(goalContract.successCriteria,50).entries()){
    const sc=record('success_condition',{sessionId,missionId,index,metricId:String(criterion.metricId||`metric_${index+1}`),description:String(criterion.description||goalContract.desiredState),target:criterion.target,operator:criterion.operator||'>=',unit:criterion.unit||null,measurementMethod:criterion.measurementMethod||null,observationSources:clean(criterion.observationSources),attributionRequirement:criterion.attributionRequirement||null,observationPath:criterion.observationPath||null},companyId,'active');Object.assign(sc,await put(sc));out.push(sc)
  }return out
}

export async function ensureDeliverableGraph(companyId,{sessionId,missionId,goalContract,worldModel,selectedStrategy,capabilities=[]}){
  const existing=(await list({companyId,kind:'deliverable_graph',limit:100})).find(x=>x.data.sessionId===sessionId&&x.state!=='superseded');if(existing){const deliverables=(await list({companyId,kind:'deliverable',limit:1000})).filter(x=>x.data.graphId===existing.id);return{graph:existing,deliverables}}
  const conditions=await ensureSuccessConditions(companyId,{sessionId,missionId,goalContract});
  let nodes=await proposeGraph({goalContract,worldModel,selectedStrategy,capabilities}).catch(()=>null);if(!nodes)nodes=fallbackGraph(goalContract);
  const {order}=validateDeliverableGraph(nodes),nodeByKey=new Map(nodes.map(x=>[x.key,x]));
  const graph=record('deliverable_graph',{sessionId,missionId,goalDesiredState:goalContract.desiredState,strategySelectionId:selectedStrategy?.selectionId||selectedStrategy?.id||null,successConditionIds:conditions.map(x=>x.id),order,proposalSource:nodes===fallbackGraph?'deterministic_fallback':(reasoningConfigured()?'tensormux_or_fallback':'deterministic_fallback')},companyId,'active');Object.assign(graph,await put(graph));
  const created=[],idByKey=new Map();
  for(const key of order){const n=nodeByKey.get(key),binding=bindDeliverable(n,capabilities);const d=record('deliverable',{graphId:graph.id,sessionId,missionId,key,title:n.title,kind:n.kind,description:n.description,dependencyKeys:clean(n.dependsOn),dependencyIds:[],requiredModes:clean(n.requiredModes),stateDomains:clean(n.stateDomains),successConditionRefs:clean(n.successConditionRefs),successConditionIds:conditions.filter(x=>!n.successConditionRefs?.length||n.successConditionRefs.includes(x.data.metricId)).map(x=>x.id),capabilityBindings:binding.bindings,missingCapabilities:binding.missing,terminalState:n.terminalState||terminalForKind(n.kind),evidenceIds:[],operationIds:[],attempts:0},companyId,binding.missing.length?'blocked':'proposed');Object.assign(d,await put(d));created.push(d);idByKey.set(key,d.id)}
  for(const d of created){d.data.dependencyIds=d.data.dependencyKeys.map(k=>idByKey.get(k)).filter(Boolean);const deps=d.data.dependencyIds.map(x=>created.find(y=>y.id===x));if(!d.data.missingCapabilities.length&&deps.length===0){d.state='ready'}Object.assign(d,await put(d,{expectedVersion:d.version}))}
  for(const d of created)for(const depId of d.data.dependencyIds){const edge=record('deliverable_dependency',{graphId:graph.id,deliverableId:d.id,dependsOnDeliverableId:depId},companyId,'active');await put(edge)}
  await emitRuntimeEvent(companyId,{sessionId,missionId,type:'DELIVERABLE_GRAPH_CREATED',subjectKind:'deliverable_graph',subjectId:graph.id,data:{deliverableCount:created.length,blocked:created.filter(x=>x.state==='blocked').length},evidenceIds:[graph.id]});
  return{graph,deliverables:created};
}

export async function refreshDeliverableReadiness(companyId,graphId){
  const ds=(await list({companyId,kind:'deliverable',limit:1000})).filter(x=>x.data.graphId===graphId),byId=new Map(ds.map(x=>[x.id,x]));
  for(const d of ds){if(!['proposed','blocked'].includes(d.state))continue;const deps=clean(d.data.dependencyIds).map(x=>byId.get(x)).filter(Boolean),depsSatisfied=deps.every(x=>['produced','executed','verified','observed','evaluated'].includes(x.state));if(depsSatisfied&&!clean(d.data.missingCapabilities).length&&d.state!=='ready'){d.state='ready';Object.assign(d,await put(d,{expectedVersion:d.version}))}}
  return ds
}

export async function transitionDeliverable(companyId,deliverableId,next,{evidenceIds=[],operationId=null,reason=null}={}){
  const d=await get(deliverableId);if(!d||d.company_id!==companyId||d.kind!=='deliverable')throw new DomainError('deliverable_not_found',404);if(d.state===next)return d;if(!LIFECYCLE.includes(next))throw new DomainError('invalid_deliverable_state',422,{next});if(!TRANSITIONS[d.state]?.has(next))throw new DomainError('invalid_deliverable_transition',409,{from:d.state,to:next});d.state=next;d.data.evidenceIds=[...new Set([...(d.data.evidenceIds||[]),...clean(evidenceIds)])];if(operationId)d.data.operationIds=[...new Set([...(d.data.operationIds||[]),operationId])];d.data.attempts=Number(d.data.attempts||0)+(next==='executing'||next==='producing'?1:0);if(reason)d.data.lastReason=reason;Object.assign(d,await put(d,{expectedVersion:d.version}));await emitRuntimeEvent(companyId,{sessionId:d.data.sessionId,missionId:d.data.missionId,type:`DELIVERABLE_${next.toUpperCase()}`,subjectKind:'deliverable',subjectId:d.id,data:{title:d.data.title,kind:d.data.kind},evidenceIds});if(['produced','executed','verified','observed','evaluated'].includes(next))await refreshDeliverableReadiness(companyId,d.data.graphId);return d
}

export async function hydrateOutcomeControl(companyId,sessionId){
  const records=await list({companyId,limit:5000}),graph=records.find(x=>x.kind==='deliverable_graph'&&x.data.sessionId===sessionId&&x.state!=='superseded'),mission=records.find(x=>x.kind==='mission'&&x.state==='active');return{mission,successConditions:records.filter(x=>x.kind==='success_condition'&&x.data.sessionId===sessionId),graph,deliverables:graph?records.filter(x=>x.kind==='deliverable'&&x.data.graphId===graph.id):[],events:records.filter(x=>x.kind==='runtime_event'&&x.data.sessionId===sessionId).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))}
}

export async function produceReadyModelDeliverables(companyId,graphId,{goalContract=null,selectedStrategy=null}={}){
  let produced=0;
  for(let pass=0;pass<20;pass++){
    const ds=await refreshDeliverableReadiness(companyId,graphId);const candidate=ds.find(d=>d.state==='ready'&&!clean(d.data.requiredModes).length);if(!candidate)break;
    await transitionDeliverable(companyId,candidate.id,'producing');
    const dependencyEvidence=[];for(const depId of clean(candidate.data.dependencyIds)){const dep=await get(depId);dependencyEvidence.push(...clean(dep?.data?.evidenceIds))}
    let payload={summary:candidate.data.description,decision:candidate.data.title,proposalOnly:true,source:'deterministic_development_fallback'};
    if(reasoningConfigured()){
      try{const proposal=await proposeStructured({task:'Deliverable Producer',instructions:'Produce the requested non-side-effecting deliverable from the supplied mission, strategy, and already persisted dependency evidence identifiers. Return a concise artifact object with summary, keyDecisions, assumptions, and nextUse. Do not claim external facts or execution that are not supplied.',input:{goalContract,selectedStrategy,deliverable:{id:candidate.id,title:candidate.data.title,kind:candidate.data.kind,description:candidate.data.description},dependencyEvidenceIds:dependencyEvidence}});if(proposal?.value)payload={...proposal.value,proposalOnly:true,source:'tensormux',model:proposal.model,requestId:proposal.requestId||null}}
      catch(error){if(process.env.NODE_ENV==='production'){await transitionDeliverable(companyId,candidate.id,'failed',{reason:error.message});throw error}}
    }
    let artifact=record('deliverable_artifact',{graphId,deliverableId:candidate.id,sessionId:candidate.data.sessionId,missionId:candidate.data.missionId,kind:candidate.data.kind,title:candidate.data.title,payload,claimType:'MODEL_PROPOSAL',dependencyEvidenceIds:dependencyEvidence},companyId,'produced');Object.assign(artifact,await put(artifact));
    await transitionDeliverable(companyId,candidate.id,'produced',{evidenceIds:[artifact.id,...dependencyEvidence]});produced++;
  }
  return produced;
}
