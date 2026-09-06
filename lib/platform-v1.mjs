import {put,get,list,audit} from './store.mjs';
import {approvalForInvocation,getApproval,decideApproval,listApprovals} from './approvals.mjs';
import {getQueueItem,transition} from './queue.mjs';
import {enqueue} from './queue.mjs';
import {DomainError,validateSchema} from './contracts.mjs';
import {normalizeProviderInput,normalizeCapability,invokeHttpCapability,isSideEffecting} from './capabilities.mjs';
import {evaluateContract} from './evaluator.mjs';
import {defaultMutations,validateMutation,applyMutation} from './mutations.mjs';
import {writePromotionLesson,capabilityAffinityFromLessons} from './memory.mjs';
import {reserveBudget,settleBudget,promoteCandidateAtomic,rollbackRevisionAtomic} from './control-plane.mjs';
import {planInvocation,transitionInvocation} from './invocation-journal.mjs';
import {auditRunWithTensorMux} from './tensormux.mjs';
import {exportRunToNeatlogs} from './neatlogs.mjs';
export {DomainError,validateSchema};
const id=()=>crypto.randomUUID(); const now=()=>new Date().toISOString();
const required=(v,n)=>{if(v==null||v==='')throw new DomainError(`${n}_required`);return v};
const record=(kind,data,companyId=null,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});

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
  const discovered=input.manifest?.capabilities||input.capabilities||[];
  if(!discovered.length)throw new DomainError('capability_manifest_required');
  await put(provider); const capabilities=[];
  for(const [manifestIndex,raw] of discovered.entries()){
    const cap=record('capability',{...normalizeCapability(provider.id,raw),manifestIndex},companyId);
    await put(cap);capabilities.push(cap);
  }
  await audit({company_id:companyId,actor:'user',action:'provider.registered',subject_kind:'capability_provider',subject_id:provider.id,data:{capabilityIds:capabilities.map(x=>x.id)}});
  return{provider,capabilities};
}

export async function synthesize(companyId){
  const c=await requireCompany(companyId), records=await list({companyId,limit:500}); const mission=records.find(x=>x.kind==='mission'&&x.state==='active'); const lessons=records.filter(x=>x.kind==='lesson'&&x.state==='active'); const affinity=capabilityAffinityFromLessons(lessons); const caps=records.filter(x=>x.kind==='capability').sort((a,b)=>(affinity.get(b.id)||0)-(affinity.get(a.id)||0)||String(a.data.providerId).localeCompare(String(b.data.providerId))||Number(a.data.manifestIndex??Number.MAX_SAFE_INTEGER)-Number(b.data.manifestIndex??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
  if(!caps.length)throw new DomainError('connect_capabilities_before_synthesis',409);
  const writable=caps.filter(x=>['write','external_side_effect','financial'].includes(x.data.risk)); const verification=caps.filter(x=>/verify|valid|check|review|audit|test|assert/i.test(`${x.data.name} ${x.data.description}`));
  const roles=[]; const grouped=chunk(caps,Math.max(1,Math.ceil(caps.length/3)));
  grouped.forEach((group,i)=>roles.push({id:id(),name:i===0?'Intake & Context':i===grouped.length-1?'Action & Delivery':`Decision ${i}`,purpose:`Handle ${group.map(x=>x.data.name).join(', ')}`,instructions:`Advance the mission outcome: ${mission.data.outcome}. Use only assigned capabilities and produce inspectable outputs.`,capabilityIds:group.map(x=>x.id),modelPolicy:{provider:'configured',temperature:0},budgetUsd:Number((Number(mission.data.constraints.dailyBudgetUsd||30)/grouped.length).toFixed(2))}));
  if(writable.length&&verification.length){roles.push({id:id(),name:'Independent Verification',purpose:'Evaluate proposed side effects before release',instructions:'Judge policy and metric compliance independently. Do not execute the action.',capabilityIds:verification.map(x=>x.id),modelPolicy:{provider:'none'},budgetUsd:0});}
  const previous=records.filter(x=>x.kind==='organization_revision').sort((a,b)=>b.data.revision-a.data.revision)[0];
  const org=record('organization_revision',{revision:(previous?.data.revision||0)+1,parentRevisionId:previous?.id||null,status:'candidate',roles,routes:roles.slice(0,-1).map((r,i)=>({from:r.id,to:roles[i+1].id,condition:'success'})),policies:{allowedCapabilityIds:caps.map(x=>x.id),approvalRisks:['financial','external_side_effect'],dailyBudgetUsd:Number(mission.data.constraints.dailyBudgetUsd||30),qualityFloor:Number(mission.data.constraints.qualityFloor||.9),latencyLimitMs:Number(mission.data.constraints.latencyLimitMs||30000),promotionMinCases:Number(mission.data.constraints.promotionMinCases||10)},resourcePlan:{maxConcurrency:Number(mission.data.constraints.maxConcurrency||3)}},companyId,'candidate');
  await put(org); await audit({company_id:companyId,actor:'brain',action:'organization.proposed',subject_kind:'organization_revision',subject_id:org.id,data:{capabilityCount:caps.length}}); return org;
}

export async function launch(companyId,revisionId){const company=await requireCompany(companyId),org=await requireRecord(revisionId,'organization_revision',companyId);if(org.state!=='candidate')throw new DomainError('revision_not_candidate',409);org.state='production';org.data.status='production';await put(org,{expectedVersion:org.version});company.data.activeOrganizationRevisionId=org.id;company.data.status='active';await put(company,{expectedVersion:company.version});await audit({company_id:companyId,actor:'user',action:'organization.launched',subject_kind:'organization_revision',subject_id:org.id,data:{revision:org.data.revision}});return org}

export async function submitJob(companyId,payload,{idempotencyKey=null,source='manual'}={}){const company=await requireCompany(companyId);if(company.data.status!=='active')throw new DomainError('company_not_active',409);const org=await requireRecord(company.data.activeOrganizationRevisionId,'organization_revision',companyId);if(idempotencyKey){const prior=(await list({companyId,kind:'job',limit:500})).find(x=>x.data.idempotencyKey===idempotencyKey);if(prior)return prior}const job=record('job',{payload,status:'queued',organizationRevisionId:org.id,organizationRevision:org.data.revision,missionVersion:company.data.missionVersion,idempotencyKey,source},companyId,'queued');Object.assign(job,await put(job));const queue=await enqueue(companyId,job.id,idempotencyKey);job.data.queueId=queue.id;Object.assign(job,await put(job,{expectedVersion:job.version}));await audit({company_id:companyId,actor:'user',action:'job.queued',subject_kind:'job',subject_id:job.id,data:{revisionId:org.id,queueId:queue.id,idempotencyKey}});return job}

export async function submitEvent(companyId,payload,{idempotencyKey}={}){if(!idempotencyKey)throw new DomainError('idempotency_key_required');const event=record('event',{payload,idempotencyKey,status:'accepted'},companyId,'accepted');const prior=(await list({companyId,kind:'event',limit:500})).find(x=>x.data.idempotencyKey===idempotencyKey);if(prior)return{event:prior,job:(await list({companyId,kind:'job',limit:500})).find(x=>x.data.idempotencyKey===idempotencyKey)};Object.assign(event,await put(event));const job=await submitJob(companyId,payload,{idempotencyKey,source:`event:${event.id}`});return{event,job}}

export async function executeJob(companyId,jobId,{shadow=false,revisionId=null}={}){
  const job=await requireRecord(jobId,'job',companyId),company=await requireCompany(companyId),org=await requireOrganization(revisionId||job.data.organizationRevisionId,companyId),records=await list({companyId,limit:1000});
  const caps=new Map(records.filter(x=>x.kind==='capability').map(x=>[x.id,x])); const providers=new Map(records.filter(x=>x.kind==='capability_provider').map(x=>[x.id,x]));
  let run=job.data.runId?await get(job.data.runId):null;
  if(!run){run=record('run',{jobId,status:'running',organizationRevisionId:org.id,missionVersion:job.data.missionVersion,startedAt:now(),costUsd:0,latencyMs:0,traceIds:[],output:null,shadow,checkpoint:{roleIndex:0,capIndex:0,value:job.data.payload}},companyId,'running');Object.assign(run,await put(run));job.data.runId=run.id}
  run.state='running';run.data.status='running';
  job.state='running';job.data.status='running';Object.assign(job,await put(job,{expectedVersion:job.version}));
  const started=Date.now(); let value=run.data.checkpoint?.value??job.data.payload; let failed=null,uncertain=false;
  const startRole=Number(run.data.checkpoint?.roleIndex||0),startCap=Number(run.data.checkpoint?.capIndex||0);
  for(let ri=startRole;ri<org.data.roles.length;ri++){
    const role=org.data.roles[ri];
    for(let ci=(ri===startRole?startCap:0);ci<role.capabilityIds.length;ci++){
      const capId=role.capabilityIds[ci],cap=caps.get(capId);if(!cap)continue;const provider=providers.get(cap.data.providerId)?.data;
      const permission=authorize(org,role,cap);if(permission){failed=permission;await trace(run,role,cap,'blocked',{error:permission});break}
      if(shadow&&(isSideEffecting(cap.data)||provider?.type==='human')){await trace(run,role,cap,'shadow_blocked',{input:value});run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}));continue}
      const invocationKey=`${job.id}:${org.id}:${role.id}:${cap.id}:${ri}:${ci}`;let invocation=(isSideEffecting(cap.data)||provider?.type==='human')?await planInvocation({companyId,jobId:job.id,runId:run.id,capabilityId:cap.id,invocationKey,input:value}):null;
      if(invocation?.state==='confirmed'){value=invocation.data?.output??invocation.output;run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}));continue}
      if(invocation?.state==='dispatched'){failed='side_effect_outcome_uncertain';invocation=await transitionInvocation(invocation,'uncertain',{error:{message:failed}});await trace(run,role,cap,'uncertain',{invocationId:invocation.id,error:failed});break}
      const needsApproval=provider?.type==='human'||org.data.policies.approvalRisks?.includes(cap.data.risk);
      if(needsApproval){
        const approval=await approvalForInvocation({companyId,jobId:job.id,runId:run.id,organizationRevisionId:org.id,roleId:role.id,capabilityId:cap.id,reason:provider?.type==='human'?'Human review capability':'Constitution requires approval for side effect',risk:cap.data.risk,args:value,invocationKey});
        if(approval.state==='pending'){
          run.state='waiting_for_approval';run.data.status='waiting_for_approval';run.data.pendingApprovalId=approval.id;run.data.checkpoint={roleIndex:ri,capIndex:ci,value};run.data.latencyMs+=Date.now()-started;await trace(run,role,cap,'waiting_for_approval',{approvalId:approval.id});Object.assign(run,await put(run,{expectedVersion:run.version}));
          job.state='waiting_for_approval';job.data.status='waiting_for_approval';job.data.pendingApprovalId=approval.id;Object.assign(job,await put(job,{expectedVersion:job.version}));return run;
        }
        if(approval.state==='rejected'){failed='human_approval_rejected';if(invocation&&['planned','approved'].includes(invocation.state))invocation=await transitionInvocation(invocation,'failed',{error:{message:failed}});await trace(run,role,cap,'blocked',{approvalId:approval.id,error:failed,invocationId:invocation?.id});break}
        if(invocation?.state==='planned')invocation=await transitionInvocation(invocation,'approved');
        if(provider?.type==='human'){value={approved:true,decisionReason:approval.decision_reason||'',input:value};if(invocation){invocation=await transitionInvocation(invocation,'dispatched');invocation=await transitionInvocation(invocation,'confirmed',{output:value})}await trace(run,role,cap,'completed',{approvalId:approval.id,output:value,costUsd:0,latencyMs:0,invocationId:invocation?.id});run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}));continue}
      }
      let reservationId;
      try{const input=value;reservationId=await reserveBudget({companyId,sourceRef:`${run.id}:${ri}:${ci}`,amountUsd:Number(cap.data.estimatedCost?.usd||0),limitUsd:Number(org.data.policies.dailyBudgetUsd||0)});if(invocation)invocation=await transitionInvocation(invocation,'dispatched');const result=await invokeHttpCapability(cap.data,provider,input,{idempotencyKey:invocationKey});await settleBudget(reservationId,'consumed');if(invocation)invocation=await transitionInvocation(invocation,'confirmed',{output:result.output});value=result.output;run.data.costUsd+=result.cost;await trace(run,role,cap,'completed',{input,output:value,latencyMs:result.latencyMs,costUsd:result.cost,budgetReservationId:reservationId,invocationId:invocation?.id});run.data.checkpoint={roleIndex:ri,capIndex:ci+1,value};Object.assign(run,await put(run,{expectedVersion:run.version}))}
      catch(e){if(reservationId)try{await settleBudget(reservationId,e.uncertainSideEffect?'consumed':'released')}catch{}if(invocation&&invocation.state==='dispatched')try{invocation=await transitionInvocation(invocation,e.uncertainSideEffect?'uncertain':'failed',{error:{message:e.message}})}catch{}uncertain=Boolean(e.uncertainSideEffect);failed=uncertain?'side_effect_outcome_uncertain':e.message;await trace(run,role,cap,uncertain?'uncertain':'failed',{error:failed,invocationId:invocation?.id});break}
    }
    if(failed)break;
    run.data.checkpoint={roleIndex:ri+1,capIndex:0,value};
  }
  run.data.latencyMs+=Date.now()-started;run.data.output=failed?null:value;run.data.status=uncertain?'uncertain':failed?'failed':'completed';run.data.completedAt=now();run.data.pendingApprovalId=null;run.state=run.data.status;Object.assign(run,await put(run,{expectedVersion:run.version}));job.state=run.state;job.data.status=run.state;job.data.runId=run.id;job.data.pendingApprovalId=null;Object.assign(job,await put(job,{expectedVersion:job.version}));const postRecords=await list({companyId,limit:1000});const ev=await evaluate(company,run,postRecords);await emitExternalObservability({company,org,job,run,records:await list({companyId,limit:1000}),evaluation:ev});return run;
}
function authorize(org,role,cap){if(!org.data.policies.allowedCapabilityIds.includes(cap.id)||!role.capabilityIds.includes(cap.id))return 'capability_not_allowed';return null}
async function trace(run,role,cap,status,data){const t=record('trace',{runId:run.id,roleId:role.id,roleName:role.name,capabilityId:cap.id,capabilityName:cap.data.name,status,...data},run.company_id,status);await put(t);run.data.traceIds.push(t.id);return t}
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
    const nl=await exportRunToNeatlogs({company,mission,organization:org.data,job:{id:job.id,...job.data},run:{id:run.id,...run.data},traces,evaluation:{id:evaluation.id,...evaluation.data},modelAudit});
    if(!nl.skipped){run.data.neatlogsTraceId=nl.trace_id||nl.traceId||null;Object.assign(run,await put(run,{expectedVersion:run.version}));}
  }catch(e){
    const er=record('error',{runId:run.id,source:'neatlogs',message:e.message,details:e.details||null},company.id,'external_observability_failed');await put(er);run.data.neatlogsError=e.message;Object.assign(run,await put(run,{expectedVersion:run.version}));
  }
}
async function evaluate(company,run,records){
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active');
  const job=records.find(x=>x.kind==='job'&&x.id===run.data.jobId)||await get(run.data.jobId);
  const verdict=evaluateContract({mission:mission?.data,run:{...run.data,status:run.data.status,output:run.data.output},job:job?.data});
  const ev=record('evaluation',{runId:run.id,evaluator:verdict.evaluator,results:verdict.results,passed:verdict.passed},company.id,verdict.passed?'passed':'failed');
  Object.assign(ev,await put(ev));run.data.evaluationId=ev.id;Object.assign(run,await put(run,{expectedVersion:run.version}));return ev
}
export async function diagnose(companyId){
  const rs=await list({companyId,limit:500});
  const failed=rs.filter(x=>x.kind==='evaluation'&&x.state==='failed').slice(0,20);
  if(failed.length<2)throw new DomainError('insufficient_recurring_evidence',409,{failedCases:failed.length,required:2});
  const evidenceIds=failed.map(x=>x.id);
  const d=record('diagnosis',{organizationRevisionId:(rs.find(x=>x.kind==='company')?.data.activeOrganizationRevisionId),failureMode:'Repeated metric-contract failure',confidence:Math.min(.95,.5+failed.length*.05),evidenceIds,explanation:`${failed.length} independently evaluated runs violated the operating contract.`},companyId);
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
