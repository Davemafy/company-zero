import {put,get,list,audit} from './store.mjs';
import {approvalForInvocation,getApproval,decideApproval,listApprovals} from './approvals.mjs';
import {getQueueItem,transition} from './queue.mjs';
import {enqueue} from './queue.mjs';
import {DomainError,validateSchema} from './contracts.mjs';
import {normalizeProviderInput,normalizeCapability,invokeHttpCapability,isSideEffecting,discoverHttpManifest} from './capabilities.mjs';
import {evaluateContract} from './evaluator.mjs';
import {defaultMutations,validateMutation,applyMutation} from './mutations.mjs';
import {writePromotionLesson,capabilityAffinityFromLessons} from './memory.mjs';
import {reserveBudget,settleBudget,promoteCandidateAtomic,rollbackRevisionAtomic} from './control-plane.mjs';
import {planInvocation,transitionInvocation} from './invocation-journal.mjs';
import {auditRunWithTensorMux} from './tensormux.mjs';
import {exportRunToNeatlogs} from './neatlogs.mjs';
import {verifyOutcomeChange} from './outcome-verifier.mjs';
import {assessRelevance,extractGroundedObservations,validateOperationPlan,sanitizeForEvidence} from './grounding.mjs';
import {proposeStructured,reasoningConfigured} from './reasoning.mjs';
export {DomainError,validateSchema};
const id=()=>crypto.randomUUID(); const now=()=>new Date().toISOString();
const required=(v,n)=>{if(v==null||v==='')throw new DomainError(`${n}_required`);return v};
const record=(kind,data,companyId=null,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});
async function reasoningProposal(args,errorCode){
  try{const proposal=await proposeStructured(args);if(!proposal&&process.env.NODE_ENV==='production')throw new DomainError(errorCode,503);return proposal}
  catch(error){if(process.env.NODE_ENV==='production'){if(error instanceof DomainError)throw error;throw new DomainError(errorCode,503,{cause:error.message})}return null}
}

export async function createCompany(input){
  const company=record('company',{name:required(input.name,'name'),status:'draft',activeOrganizationRevisionId:null,missionVersion:1});
  company.company_id=company.id;
  const mission=record('mission',{outcome:required(input.outcome,'outcome'),description:input.description||'',metrics:input.metrics||[],constraints:input.constraints||{},evaluationPolicy:input.evaluationPolicy||{type:'deterministic'},version:1},company.id);
  company.data.missionId=mission.id; await put(company); await put(mission); await audit({company_id:company.id,actor:'user',action:'company.created',subject_kind:'company',subject_id:company.id,data:{missionId:mission.id}}); return hydrateCompany(company);
}
export async function hydrateCompany(company){if(!company)return null;const records=await list({companyId:company.id,limit:500});return {...company,data:{...company.data},records}}
export async function companies(){return list({kind:'company'})}

export async function registerProvider(companyId,input){
  await requireCompany(companyId);
  const normalized=normalizeProviderInput(input);
  const provider=record('capability_provider',normalized,companyId);
  let manifest=input.manifest||null,discoveryEvidence=null;if(!manifest&&!input.capabilities&&input.type==='http'){const remote=await discoverHttpManifest(normalized);manifest=remote.manifest;discoveryEvidence=remote.evidence;provider.data.status='discovered'}
  const discovered=manifest?.capabilities||input.capabilities||[];
  if(!discovered.length)throw new DomainError(input.type==='mcp'?'mcp_adapter_or_manifest_required':'capability_manifest_required');
  await put(provider); const capabilities=[];
  for(const [manifestIndex,raw] of discovered.entries()){
    const cap=record('capability',{...normalizeCapability(provider.id,raw),manifestIndex},companyId);
    await put(cap);capabilities.push(cap);
  }
  if(discoveryEvidence){const evidence=record('capability_discovery',{providerId:provider.id,capabilityIds:capabilities.map(x=>x.id),...discoveryEvidence},companyId,'completed');await put(evidence)}
  await audit({company_id:companyId,actor:'user',action:'provider.registered',subject_kind:'capability_provider',subject_id:provider.id,data:{capabilityIds:capabilities.map(x=>x.id)}});
  return{provider,capabilities};
}

export async function synthesize(companyId,context={}){
  if(process.env.NODE_ENV==='production'&&!reasoningConfigured())throw new DomainError('tensormux_required_for_organization_synthesis',503);
  const c=await requireCompany(companyId), records=await list({companyId,limit:500}); const mission=records.find(x=>x.kind==='mission'&&x.state==='active'); const lessons=records.filter(x=>x.kind==='lesson'&&x.state==='active'); const affinity=capabilityAffinityFromLessons(lessons); const caps=records.filter(x=>x.kind==='capability').sort((a,b)=>(affinity.get(b.id)||0)-(affinity.get(a.id)||0)||String(a.data.providerId).localeCompare(String(b.data.providerId))||Number(a.data.manifestIndex??Number.MAX_SAFE_INTEGER)-Number(b.data.manifestIndex??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
  if(!caps.length)throw new DomainError('connect_capabilities_before_synthesis',409);
  const writable=caps.filter(x=>['write','external_side_effect','financial'].includes(x.data.risk)); const verification=caps.filter(x=>/verify|valid|check|review|audit|test|assert/i.test(`${x.data.name} ${x.data.description}`));
  const roles=[]; let functions=Array.isArray(context.strategy?.operatingFunctions)&&context.strategy.operatingFunctions.length?context.strategy.operatingFunctions:[];let organizationProposal=null;
  organizationProposal=await reasoningProposal({task:'Organization Synthesizer',instructions:'Propose a compact organization for the supplied selected strategy. Return operatingFunctions as an array of 1 to 6 function names. Do not invent capabilities, execution results, people, or external facts.',input:{goalContract:context.goalContract||mission.data.goalContract,worldModel:context.worldModel||null,selectedStrategy:context.strategy||null,capabilities:caps.map(x=>({id:x.id,name:x.data.name,operationKind:x.data.operationKind,risk:x.data.risk,observes:x.data.observes,changes:x.data.changes}))}},'tensormux_organization_synthesis_failed');if(Array.isArray(organizationProposal?.value?.operatingFunctions)&&organizationProposal.value.operatingFunctions.length)functions=organizationProposal.value.operatingFunctions.map(String).slice(0,6)
  const grouped=chunk(caps,Math.max(1,Math.ceil(caps.length/Math.max(1,Math.min(4,functions.length||3)))));
  grouped.forEach((group,i)=>{const fn=functions[i]||functions.at(-1);roles.push({id:id(),name:fn|| (i===0?'Intake & Context':i===grouped.length-1?'Action & Delivery':`Decision ${i}`),purpose:fn?`${fn} using ${group.map(x=>x.data.name).join(', ')}`:`Handle ${group.map(x=>x.data.name).join(', ')}`,instructions:`Advance the mission outcome: ${context.goalContract?.desiredState||mission.data.outcome}. Follow the selected strategy: ${context.strategy?.title||'mission contract'}. Use only assigned capabilities, respect authority boundaries, and produce inspectable observations.`,capabilityIds:group.map(x=>x.id),modelPolicy:{provider:'configured',temperature:0},budgetUsd:Number((Number(mission.data.constraints.dailyBudgetUsd||30)/grouped.length).toFixed(2))})});
  if(writable.length&&verification.length){roles.push({id:id(),name:'Independent Verification',purpose:'Evaluate proposed side effects before release',instructions:'Judge policy and metric compliance independently. Do not execute the action.',capabilityIds:verification.map(x=>x.id),modelPolicy:{provider:'none'},budgetUsd:0});}
  const previous=records.filter(x=>x.kind==='organization_revision').sort((a,b)=>b.data.revision-a.data.revision)[0];
  const org=record('organization_revision',{revision:(previous?.data.revision||0)+1,parentRevisionId:previous?.id||null,status:'candidate',goalContract:context.goalContract||mission.data.goalContract||null,worldModelId:context.worldModel?.id||null,selectedStrategy:context.strategy?{id:context.strategy.id,selectionId:context.strategy.selectionId||null,title:context.strategy.title,hypothesis:context.strategy.hypothesis}:null,proposalSource:organizationProposal?'tensormux':'deterministic_development_fallback',modelRequestId:organizationProposal?.requestId||null,model:organizationProposal?.model||null,roles,routes:roles.slice(0,-1).map((r,i)=>({from:r.id,to:roles[i+1].id,condition:'success'})),policies:{allowedCapabilityIds:caps.map(x=>x.id),approvalRisks:['financial','external_side_effect'],authorityBoundaries:context.goalContract?.authorityBoundaries||{},dailyBudgetUsd:Number(mission.data.constraints.dailyBudgetUsd||30),qualityFloor:Number(mission.data.constraints.qualityFloor||.9),latencyLimitMs:Number(mission.data.constraints.latencyLimitMs||30000),promotionMinCases:Number(mission.data.constraints.promotionMinCases||10)},resourcePlan:{maxConcurrency:Number(mission.data.constraints.maxConcurrency||3)}},companyId,'candidate');
  await put(org); await audit({company_id:companyId,actor:'brain',action:'organization.proposed',subject_kind:'organization_revision',subject_id:org.id,data:{capabilityCount:caps.length}}); return org;
}

export async function launch(companyId,revisionId){const company=await requireCompany(companyId),org=await requireRecord(revisionId,'organization_revision',companyId);if(org.state!=='candidate')throw new DomainError('revision_not_candidate',409);const priorId=company.data.activeOrganizationRevisionId;if(priorId&&priorId!==org.id){const prior=await get(priorId);if(prior?.state==='production'){prior.state='retired';await put(prior,{expectedVersion:prior.version})}}org.state='production';org.data.status='production';Object.assign(org,await put(org,{expectedVersion:org.version}));company.data.activeOrganizationRevisionId=org.id;company.data.status='active';await put(company,{expectedVersion:company.version});await audit({company_id:companyId,actor:'user',action:'organization.launched',subject_kind:'organization_revision',subject_id:org.id,data:{revision:org.data.revision,previousRevisionId:priorId||null}});return org}

export async function submitJob(companyId,payload,{idempotencyKey=null,source='manual'}={}){const company=await requireCompany(companyId);if(company.data.status!=='active')throw new DomainError('company_not_active',409);const org=await requireRecord(company.data.activeOrganizationRevisionId,'organization_revision',companyId);if(idempotencyKey){const prior=(await list({companyId,kind:'job',limit:500})).find(x=>x.data.idempotencyKey===idempotencyKey);if(prior)return prior}const job=record('job',{payload,status:'queued',organizationRevisionId:org.id,organizationRevision:org.data.revision,missionVersion:company.data.missionVersion,idempotencyKey,source},companyId,'queued');Object.assign(job,await put(job));const queue=await enqueue(companyId,job.id,idempotencyKey);job.data.queueId=queue.id;Object.assign(job,await put(job,{expectedVersion:job.version}));await audit({company_id:companyId,actor:'user',action:'job.queued',subject_kind:'job',subject_id:job.id,data:{revisionId:org.id,queueId:queue.id,idempotencyKey}});return job}

export async function submitEvent(companyId,payload,{idempotencyKey}={}){if(!idempotencyKey)throw new DomainError('idempotency_key_required');const event=record('event',{payload,idempotencyKey,status:'accepted'},companyId,'accepted');const prior=(await list({companyId,kind:'event',limit:500})).find(x=>x.data.idempotencyKey===idempotencyKey);if(prior)return{event:prior,job:(await list({companyId,kind:'job',limit:500})).find(x=>x.data.idempotencyKey===idempotencyKey)};Object.assign(event,await put(event));const job=await submitJob(companyId,payload,{idempotencyKey,source:`event:${event.id}`});return{event,job}}

export async function executeJob(companyId,jobId,{shadow=false,revisionId=null}={}){
  const job=await requireRecord(jobId,'job',companyId),company=await requireCompany(companyId),org=await requireOrganization(revisionId||job.data.organizationRevisionId,companyId),records=await list({companyId,limit:1000});
  const caps=new Map(records.filter(x=>x.kind==='capability').map(x=>[x.id,x])); const providers=new Map(records.filter(x=>x.kind==='capability_provider').map(x=>[x.id,x]));
  const missionRecord=records.find(x=>x.kind==='mission'&&x.state==='active'),relevance=assessRelevance({mission:missionRecord?{id:missionRecord.id,...missionRecord.data}:null,job,organization:org,capabilities:[...caps.values()]});
  const relevanceRecord=record('work_relevance',{jobId:job.id,...relevance},companyId,relevance.state.toLowerCase());Object.assign(relevanceRecord,await put(relevanceRecord));job.data.relevanceId=relevanceRecord.id;
  if(relevance.state!=='RELEVANT'){
    const blocked=record('run',{jobId,status:'blocked',organizationRevisionId:org.id,missionVersion:job.data.missionVersion,startedAt:now(),completedAt:now(),costUsd:0,latencyMs:0,traceIds:[],output:null,shadow,relevanceId:relevanceRecord.id,blocker:relevance.state},companyId,'blocked');Object.assign(blocked,await put(blocked));job.data.runId=blocked.id;job.data.status='blocked';job.state='failed';await put(job,{expectedVersion:job.version});const ev=record('evaluation',{runId:blocked.id,evaluator:'mission_relevance_gate',results:[{metricId:'mission_relevance',actual:relevance.state,target:'RELEVANT',operator:'=',passed:false,detail:relevance.reasons.join(',')}],passed:false,executionSucceeded:false},companyId,'failed');Object.assign(ev,await put(ev));blocked.data.evaluationId=ev.id;await put(blocked,{expectedVersion:blocked.version});return blocked;
  }
  let operationPlan=null;if(job.data.payload?.operationPlanId){const persisted=records.find(x=>x.id===job.data.payload.operationPlanId);if(!persisted||persisted.kind!=='operation_plan'||persisted.state!=='validated')throw new DomainError('persisted_operation_plan_required',409);if(persisted.data.missionVersion!==job.data.missionVersion)throw new DomainError('operation_mission_revision_mismatch',409);if(persisted.data.strategySelectionId!==job.data.payload.strategySelectionId)throw new DomainError('operation_strategy_mismatch',409);if(persisted.data.organizationRevisionId!==org.id)throw new DomainError('operation_organization_revision_mismatch',409);operationPlan=validateOperationPlan(persisted.data.operations,{capabilities:[...caps.values()],goalContract:missionRecord?.data?.goalContract||{desiredState:missionRecord?.data?.outcome},strategySelectionId:job.data.payload.strategySelectionId,missionVersion:job.data.missionVersion,organization:org})}else if(job.data.payload?.operationPlan)throw new DomainError('persisted_operation_plan_required',409);
  let run=job.data.runId?await get(job.data.runId):null;
  if(!run){run=record('run',{jobId,status:'running',organizationRevisionId:org.id,missionVersion:job.data.missionVersion,startedAt:now(),costUsd:0,latencyMs:0,traceIds:[],output:null,shadow,relevanceId:relevanceRecord.id,operationPlanId:job.data.payload?.operationPlanId||null,checkpoint:{roleIndex:0,capIndex:0,value:job.data.payload}},companyId,'running');Object.assign(run,await put(run));job.data.runId=run.id}
  run.state='running';run.data.status='running';
  job.state='running';job.data.status='running';Object.assign(job,await put(job,{expectedVersion:job.version}));
  const started=Date.now(); let value=run.data.checkpoint?.value??job.data.payload; let failed=null,uncertain=false;
  const startRole=Number(run.data.checkpoint?.roleIndex||0),startCap=Number(run.data.checkpoint?.capIndex||0);
  for(let ri=startRole;ri<org.data.roles.length;ri++){
    const role=org.data.roles[ri];
    for(let ci=(ri===startRole?startCap:0);ci<role.capabilityIds.length;ci++){
      const capId=role.capabilityIds[ci],cap=caps.get(capId);if(!cap)continue;const plannedStep=operationPlan?.find(x=>x.capabilityId===capId);if(operationPlan&&!plannedStep)continue;const provider=providers.get(cap.data.providerId)?.data;
      const permission=authorize(org,role,cap);if(permission){failed=permission;await trace(run,role,cap,'blocked',{error:permission});break}
      const operationInput=plannedStep?.args??value;
      if(shadow&&(isSideEffecting(cap.data)||provider?.type==='human')){await trace(run,role,cap,'shadow_blocked',{input:operationInput,operation:plannedStep||null});run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}));continue}
      const invocationKey=`${job.id}:${org.id}:${role.id}:${cap.id}:${ri}:${ci}`;let invocation=(operationPlan||isSideEffecting(cap.data)||provider?.type==='human')?await planInvocation({companyId,jobId:job.id,runId:run.id,capabilityId:cap.id,invocationKey,input:sanitizeForEvidence(operationInput)}):null;
      if(invocation?.state==='confirmed'){value=invocation.data?.output??invocation.output;run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}));continue}
      if(invocation?.state==='dispatched'){failed='side_effect_outcome_uncertain';invocation=await transitionInvocation(invocation,'uncertain',{error:{message:failed}});await trace(run,role,cap,'uncertain',{invocationId:invocation.id,error:failed});break}
      const needsApproval=provider?.type==='human'||org.data.policies.approvalRisks?.includes(cap.data.risk);
      if(needsApproval){
        const approval=await approvalForInvocation({companyId,jobId:job.id,runId:run.id,organizationRevisionId:org.id,roleId:role.id,capabilityId:cap.id,reason:provider?.type==='human'?'Human review capability':'Constitution requires approval for side effect',risk:cap.data.risk,args:sanitizeForEvidence(operationInput),invocationKey});
        if(approval.state==='pending'){
          run.state='waiting_for_approval';run.data.status='waiting_for_approval';run.data.pendingApprovalId=approval.id;run.data.checkpoint={roleIndex:ri,capIndex:ci,value};run.data.latencyMs+=Date.now()-started;await trace(run,role,cap,'waiting_for_approval',{approvalId:approval.id});Object.assign(run,await put(run,{expectedVersion:run.version}));
          job.state='waiting_for_approval';job.data.status='waiting_for_approval';job.data.pendingApprovalId=approval.id;Object.assign(job,await put(job,{expectedVersion:job.version}));return run;
        }
        if(approval.state==='rejected'){failed='human_approval_rejected';if(invocation&&['planned','approved'].includes(invocation.state))invocation=await transitionInvocation(invocation,'failed',{error:{message:failed}});await trace(run,role,cap,'blocked',{approvalId:approval.id,error:failed,invocationId:invocation?.id});break}
        if(invocation?.state==='planned')invocation=await transitionInvocation(invocation,'approved');
        if(provider?.type==='human'){value={approved:true,decisionReason:approval.decision_reason||'',input:value};if(invocation){invocation=await transitionInvocation(invocation,'dispatched');invocation=await transitionInvocation(invocation,'confirmed',{output:value})}await trace(run,role,cap,'completed',{approvalId:approval.id,output:value,costUsd:0,latencyMs:0,invocationId:invocation?.id});run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}));continue}
      }
      let reservationId;
      try{const input=operationInput,operationStartedAt=now();reservationId=await reserveBudget({companyId,sourceRef:`${run.id}:${ri}:${ci}`,amountUsd:Number(cap.data.estimatedCost?.usd||0),limitUsd:Number(org.data.policies.dailyBudgetUsd||0)});if(invocation)invocation=await transitionInvocation(invocation,'dispatched');const result=await invokeHttpCapability(cap.data,provider,input,{idempotencyKey:invocationKey});await settleBudget(reservationId,'consumed');if(invocation)invocation=await transitionInvocation(invocation,'confirmed',{output:sanitizeForEvidence(result.output)});value=result.output;run.data.costUsd+=result.cost;const evidence=await trace(run,role,cap,'completed',{providerId:providers.get(cap.data.providerId)?.id||cap.data.providerId,providerAdapter:provider?.adapter||'generic-http',actorRoleId:role.id,organizationRevisionId:org.id,strategySelectionId:job.data.payload?.strategySelectionId||null,operation:plannedStep||{capabilityId:cap.id},input:sanitizeForEvidence(input),output:sanitizeForEvidence(value),responseMetadata:sanitizeForEvidence(result.metadata||null),startedAt:operationStartedAt,completedAt:now(),sideEffectState:isSideEffecting(cap.data)?'confirmed':'not_applicable',latencyMs:result.latencyMs,costUsd:result.cost,budgetReservationId:reservationId,invocationId:invocation?.id});await persistCapabilityObservations(run,job,cap,provider,value,evidence.id,invocation?.id,result.metadata);run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}))}
      catch(e){if(reservationId)try{await settleBudget(reservationId,e.uncertainSideEffect?'consumed':'released')}catch{}if(invocation&&invocation.state==='dispatched')try{invocation=await transitionInvocation(invocation,e.uncertainSideEffect?'uncertain':'failed',{error:{message:e.message}})}catch{}uncertain=Boolean(e.uncertainSideEffect);failed=uncertain?'side_effect_outcome_uncertain':e.message;await trace(run,role,cap,uncertain?'uncertain':'failed',{error:failed,invocationId:invocation?.id});break}
    }
    if(failed)break;
    run.data.checkpoint={roleIndex:ri+1,capIndex:0,value};
  }
  run.data.latencyMs+=Date.now()-started;run.data.output=failed?null:value;run.data.status=uncertain?'uncertain':failed?'failed':'completed';run.data.completedAt=now();run.data.pendingApprovalId=null;run.state=run.data.status;Object.assign(run,await put(run,{expectedVersion:run.version}));job.state=run.state;job.data.status=run.state;job.data.runId=run.id;job.data.pendingApprovalId=null;Object.assign(job,await put(job,{expectedVersion:job.version}));const postRecords=await list({companyId,limit:1000});const ev=await evaluate(company,run,postRecords);await emitExternalObservability({company,org,job,run,records:await list({companyId,limit:1000}),evaluation:ev});return run;
}
function authorize(org,role,cap){if(!org.data.policies.allowedCapabilityIds.includes(cap.id)||!role.capabilityIds.includes(cap.id))return 'capability_not_allowed';return null}
async function trace(run,role,cap,status,data){const t=record('trace',{runId:run.id,roleId:role.id,roleName:role.name,capabilityId:cap.id,capabilityName:cap.data.name,status,...data},run.company_id,status);await put(t);run.data.traceIds.push(t.id);return t}
async function persistCapabilityObservations(run,job,cap,provider,output,evidenceId,invocationId,responseMetadata){if(['zyte','scrapy-cloud'].includes(provider?.adapter)){const observationProvider=provider.adapter==='scrapy-cloud'?'scrapy-cloud':'zyte';const observation=record('external_observation',{sessionId:job.data.operatingSessionId||null,missionVersion:job.data.missionVersion,runId:run.id,provider:observationProvider,providerId:cap.data.providerId,capabilityId:cap.id,requestedUrl:output.sourceUrl,observedAt:output.observedAt,invocationId:invocationId||null,evidenceId,traceId:evidenceId,sanitizedRequest:{url:output.sourceUrl},responseMetadata:sanitizeForEvidence(responseMetadata||output.responseMetadata),extractedObservation:sanitizeForEvidence(output.content),confidence:null,classification:'EXTERNAL_OBSERVATION'},run.company_id,'observed');Object.assign(observation,await put(observation));const fact=record('world_fact',{sessionId:job.data.operatingSessionId||null,subject:output.sourceUrl,predicate:'public_webpage_content',value:{title:output.content?.title||'',text:output.content?.text||'',links:output.content?.links||[]},classification:'EXTERNAL_OBSERVATION',sourceType:observationProvider,sourceRef:observation.id,observedAt:output.observedAt,confidence:null,externalRef:output.sourceUrl,evidenceIds:[evidenceId,observation.id]},run.company_id,'observed');Object.assign(fact,await put(fact));await refreshWorldLedger(run.company_id,job.data.operatingSessionId,fact)}for(const data of extractGroundedObservations({output,capability:cap,traceId:evidenceId,invocationId,runId:run.id,job})){const observation=record('outcome_observation',data,run.company_id,'observed');Object.assign(observation,await put(observation));for(const [metricId,value] of Object.entries(data.metrics||{})){const fact=record('world_fact',{sessionId:data.sessionId,subject:'mission',predicate:`metric:${metricId}`,value,classification:'EXTERNAL_OBSERVATION',sourceType:'capability',sourceRef:observation.id,observedAt:data.observedAt,confidence:data.confidence,externalRef:data.externalRef,attributionRef:data.attributionRef,evidenceIds:[evidenceId,observation.id]},run.company_id,'observed');Object.assign(fact,await put(fact));await refreshWorldLedger(run.company_id,data.sessionId,fact)}}}
async function refreshWorldLedger(companyId,sessionId,fact){if(!sessionId)return;const rows=await list({companyId,limit:3000}),world=rows.find(x=>x.kind==='world_model'&&x.data.sessionId===sessionId);if(world&&!world.data.factIds?.includes(fact.id)){world.data.factIds=[...(world.data.factIds||[]),fact.id];world.data.factCounts={...(world.data.factCounts||{}),EXTERNAL_OBSERVATION:Number(world.data.factCounts?.EXTERNAL_OBSERVATION||0)+1};world.data.updatedAt=now();Object.assign(world,await put(world,{expectedVersion:world.version}))}const stage=rows.find(x=>x.kind==='session_artifact'&&x.data.sessionId===sessionId&&x.data.stage==='learning_world');if(stage){const facts=rows.filter(x=>x.kind==='world_fact'&&x.data.sessionId===sessionId),external=[...facts.filter(x=>x.data.classification==='EXTERNAL_OBSERVATION'),fact].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i),claims=facts.filter(x=>x.data.classification==='USER_CLAIM');stage.state='completed';stage.data.title='Grounded world ledger';stage.data.items=[{type:'fact_count',label:`${claims.length} user claims recorded`,claimType:'USER_CLAIM',sourceRefs:claims.map(x=>x.id)},{type:'observation_count',label:`${external.length} external observations`,claimType:'EXTERNAL_OBSERVATION',sourceRefs:external.map(x=>x.id)},{type:'unknown_count',label:`${world?.data?.unknowns?.length||0} unresolved unknowns`,claimType:'UNKNOWN',sourceRefs:world?[world.id]:[]}];await put(stage,{expectedVersion:stage.version})}}
async function emitExternalObservability({company,org,job,run,records,evaluation}){
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active')?.data||{};
  const traces=records.filter(x=>x.kind==='trace'&&x.data?.runId===run.id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  let modelAudit=null;
  try{
    modelAudit=await auditRunWithTensorMux({mission,organization:org.data,job:{id:job.id,...job.data},run:{id:run.id,...run.data},traces,evaluation:{id:evaluation.id,...evaluation.data}});
    if(!modelAudit.skipped){
      const m=record('model_audit',{runId:run.id,provider:'tensormux',model:modelAudit.model,audit:modelAudit.audit,usage:modelAudit.usage,providerRequestId:modelAudit.id},company.id,'completed');
      Object.assign(m,await put(m));run.data.modelAuditId=m.id;Object.assign(run,await put(run,{expectedVersion:run.version}));
    }
  }catch(e){
    const er=record('error',{runId:run.id,source:'tensormux',message:e.message,details:e.details||null},company.id,'external_observability_failed');await put(er);run.data.tensormuxError=e.message;Object.assign(run,await put(run,{expectedVersion:run.version}));
  }
  try{
    const nl=await exportRunToNeatlogs({company,mission,organization:org.data,job:{id:job.id,...job.data},run:{id:run.id,...run.data},traces,evaluation:{id:evaluation.id,...evaluation.data},modelAudit,semanticRecords:records});
    if(!nl.skipped){run.data.neatlogsTraceId=nl.trace_id||nl.traceId||null;Object.assign(run,await put(run,{expectedVersion:run.version}));}
  }catch(e){
    const er=record('error',{runId:run.id,source:'neatlogs',message:e.message,details:e.details||null},company.id,'external_observability_failed');await put(er);run.data.neatlogsError=e.message;Object.assign(run,await put(run,{expectedVersion:run.version}));
  }
}
async function evaluate(company,run,records){
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active');
  const job=records.find(x=>x.kind==='job'&&x.id===run.data.jobId)||await get(run.data.jobId);
  const verdict=evaluateContract({mission:mission?.data,run:{...run.data,status:run.data.status,output:run.data.output},job:job?.data});
  const ev=record('evaluation',{runId:run.id,evaluator:verdict.evaluator,results:verdict.results,passed:verdict.passed,executionSucceeded:run.data.status==='completed'},company.id,verdict.passed?'passed':'failed');
  Object.assign(ev,await put(ev));run.data.evaluationId=ev.id;
  if(mission?.data?.goalContract){const observations=records.filter(x=>x.kind==='outcome_observation');const sessionId=job?.data?.operatingSessionId||null,outcome=verifyOutcomeChange({goalContract:mission.data.goalContract,observations,executionStatus:run.data.status,sessionId,missionVersion:job?.data?.missionVersion});const ov=record('outcome_verification',{runId:run.id,sessionId,missionVersion:job?.data?.missionVersion,...outcome},company.id,outcome.status);Object.assign(ov,await put(ov));run.data.outcomeVerificationId=ov.id;ev.data.outcomeVerificationId=ov.id;Object.assign(ev,await put(ev,{expectedVersion:ev.version}));if(sessionId){const rows=await list({companyId:company.id,limit:3000});let stage=rows.find(x=>x.kind==='session_artifact'&&x.data.sessionId===sessionId&&x.data.stage==='producing_progress');const data={sessionId,stage:'producing_progress',title:outcome.status==='achieved'?'Outcome target externally verified':'Outcome evidence status',items:outcome.results.map(x=>({type:'metric',label:x.description||x.metricId,before:x.before,after:x.after,target:x.target,status:x.status,attributionStatus:x.attributionStatus,claimType:'VERIFICATION',sourceRefs:[ov.id,...x.evidenceIds]}))};if(stage){stage.state=outcome.status;stage.data=data;await put(stage,{expectedVersion:stage.version})}else{stage=record('session_artifact',data,company.id,outcome.status);try{await put(stage)}catch{} }const session=await get(sessionId);if(session&&outcome.outcomeAchieved){session.state='completed';session.data.state='completed';session.data.currentStage='producing_progress';session.data.completedAt=now();await put(session,{expectedVersion:session.version})}}}
  Object.assign(run,await put(run,{expectedVersion:run.version}));return ev
}
export async function diagnose(companyId){
  if(process.env.NODE_ENV==='production'&&!reasoningConfigured())throw new DomainError('tensormux_required_for_diagnosis',503);
  const rs=await list({companyId,limit:500});
  const failed=rs.filter(x=>x.kind==='evaluation'&&x.state==='failed').slice(0,20);
  if(failed.length<2)throw new DomainError('insufficient_recurring_evidence',409,{failedCases:failed.length,required:2});
  const evidenceIds=failed.map(x=>x.id);
  const proposal=await reasoningProposal({task:'Grounded Diagnosis',instructions:'Diagnose only from the supplied persisted failed evaluations. Return failureMode, confidence from 0 to 1, and explanation. Do not add evidence IDs or claim facts outside the records.',input:{failedEvaluations:failed.map(x=>({id:x.id,results:x.data.results,executionSucceeded:x.data.executionSucceeded}))}},'tensormux_diagnosis_failed');
  const d=record('diagnosis',{organizationRevisionId:(rs.find(x=>x.kind==='company')?.data.activeOrganizationRevisionId),failureMode:String(proposal?.value?.failureMode||'Repeated metric-contract failure'),confidence:Math.max(0,Math.min(1,Number(proposal?.value?.confidence??Math.min(.95,.5+failed.length*.05)))),evidenceIds,explanation:String(proposal?.value?.explanation||`${failed.length} independently evaluated runs violated the operating contract.`),proposalSource:proposal?'tensormux':'deterministic_development_fallback',modelRequestId:proposal?.requestId||null},companyId);
  validateDiagnosis(d,rs);await put(d);return d
}
export function validateDiagnosis(diagnosis,records){
  const ids=diagnosis?.data?.evidenceIds||[];if(!ids.length)throw new DomainError('diagnosis_evidence_required',422);
  const valid=new Set(records.filter(x=>x.company_id===diagnosis.company_id&&['evaluation','trace','error','human_feedback'].includes(x.kind)).map(x=>x.id));
  const missing=ids.filter(x=>!valid.has(x));if(missing.length)throw new DomainError('ungrounded_diagnosis_evidence',422,{missing});
  const confidence=Number(diagnosis.data.confidence);if(!(confidence>=0&&confidence<=1))throw new DomainError('invalid_diagnosis_confidence',422);
  return diagnosis
}
export async function createExperiment(companyId,diagnosisId){
  const company=await requireCompany(companyId),d=await requireRecord(diagnosisId,'diagnosis',companyId),base=await requireRecord(company.data.activeOrganizationRevisionId,'organization_revision',companyId),records=await list({companyId,limit:1000});
  validateDiagnosis(d,records);
  const capabilities=records.filter(x=>x.kind==='capability');
  const mutations=defaultMutations(d,capabilities).map(m=>validateMutation(m,{diagnosis:d,capabilities}));
  const candidates=[];
  for(const mutation of mutations){
    const copy=applyMutation(base.data,mutation,{id});copy.revision=(base.data.revision||0)+candidates.length+1;copy.parentRevisionId=base.id;copy.status='candidate';
    const c=record('candidate_revision',copy,companyId,'candidate');await put(c);candidates.push(c)
  }
  if(candidates.length<2)throw new DomainError('insufficient_structural_candidates',409,{count:candidates.length});
  const ex=record('experiment',{diagnosisId:d.id,baselineRevisionId:base.id,candidateRevisionIds:candidates.map(x=>x.id),mode:'replay',status:'queued',results:[]},companyId,'queued');await put(ex);return ex
}
export async function promotion(companyId,experimentId,candidateId){
  const ex=await requireRecord(experimentId,'experiment',companyId),candidate=await requireRecord(candidateId,'candidate_revision',companyId);const result=ex.data.results.find(x=>x.candidateRevisionId===candidateId);if(!result)throw new DomainError('candidate_not_evaluated',409);const out=await promoteCandidateAtomic({companyId,experimentId,candidateId});return await get(out.decisionId)
}
export async function control(companyId,action){const c=await requireCompany(companyId);const allowed={pause:'paused',resume:'active',terminate:'terminated'};if(!allowed[action])throw new DomainError('invalid_control_action');c.data.status=allowed[action];await put(c,{expectedVersion:c.version});await audit({company_id:companyId,actor:'user',action:`company.${action}`,subject_kind:'company',subject_id:c.id,data:{}});return c}
export async function approvalDecision(companyId,approvalId,{decision,decidedBy='user',reason=''}){
  const approval=await getApproval(approvalId);if(!approval||approval.company_id!==companyId)throw new DomainError('approval_not_found',404);
  const decided=await decideApproval(approvalId,{decision,decidedBy,reason});
  const feedback=record('human_feedback',{approvalId,jobId:approval.job_id,runId:approval.run_id,decision,reason,decidedBy},companyId,decision);await put(feedback);
  const job=await requireRecord(approval.job_id,'job',companyId),q=await getQueueItem(job.data.queueId);
  if(decision==='approved'){
    if(!q||q.state!=='waiting_for_approval')throw new DomainError('approval_queue_not_waiting',409);
    await transition(q,'queued',{actor:decidedBy,reason:'human_approval_granted',evidenceIds:[feedback.id]});job.state='queued';job.data.status='queued';job.data.pendingApprovalId=null;await put(job,{expectedVersion:job.version});
  }else{
    if(q&&q.state==='waiting_for_approval')await transition(q,'failed',{actor:decidedBy,reason:'human_approval_rejected',evidenceIds:[feedback.id]});
    job.state='failed';job.data.status='failed';job.data.pendingApprovalId=null;await put(job,{expectedVersion:job.version});const run=await get(approval.run_id);if(run){run.state='failed';run.data.status='failed';run.data.completedAt=now();await put(run,{expectedVersion:run.version})}
  }
  await audit({company_id:companyId,actor:decidedBy,action:`approval.${decision}`,subject_kind:'approval',subject_id:approvalId,data:{feedbackId:feedback.id,jobId:job.id}});return{approval:decided,job,feedback};
}

export async function approvals(companyId){await requireCompany(companyId);return listApprovals(companyId)}

export async function rollback(companyId,targetRevisionId){
  await requireCompany(companyId);await requireOrganization(targetRevisionId,companyId);return rollbackRevisionAtomic({companyId,targetRevisionId});
}

async function requireCompany(id){const x=await get(id);if(!x||x.kind!=='company')throw new DomainError('company_not_found',404);return x}
async function requireRecord(id,kind,companyId){const x=await get(id);if(!x||x.kind!==kind||x.company_id!==companyId)throw new DomainError(`${kind}_not_found`,404);return x}
async function requireOrganization(id,companyId){const x=await get(id);if(!x||!['organization_revision','candidate_revision'].includes(x.kind)||x.company_id!==companyId)throw new DomainError('organization_revision_not_found',404);return x}
function chunk(a,n){const r=[];for(let i=0;i<a.length;i+=n)r.push(a.slice(i,i+n));return r}
