import {createHash} from 'node:crypto';
import {put,get,list,audit} from './store.mjs';
import {buildInstantValue} from './instant-value.mjs';
import {observeMissionEvaluation} from './mission-governor-bridge.mjs';
import {DomainError} from './contracts.mjs';
import {ensureExperimentWork} from './queue.mjs';

const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const record=(kind,data,companyId=null,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});
const titleFromGoal=goal=>String(goal||'').replace(/[.!?]+$/,'').split(/\s+/).slice(0,9).join(' ').slice(0,96)||'New work';
const sha256=value=>createHash('sha256').update(value).digest('hex');

async function emit(companyId,sessionId,type,message,data={}){
  const evt=record('runtime_event',{sessionId,type,message:String(message||type),data,occurredAt:now()},companyId,'recorded');
  Object.assign(evt,await put(evt));
  return evt;
}

function provisionalGoalContract(goal,constraints={}){
  return {
    desiredState:goal,
    requestedWorldChange:goal,
    requestedOutcomeModality:'unknown',
    completionEvidenceRequired:true,
    bestAchievableProgress:'Deliver a useful artifact immediately. Verify external outcomes separately.',
    knownCurrentState:{status:'UNKNOWN',source:'none'},
    successCriteria:[],
    constraints:{...constraints},
    authorityBoundaries:{externalSideEffects:'approval_required',financial:'approval_required',...(constraints.authorityBoundaries||{})},
    requiredUnknowns:[],
    attributionRequirements:['Do not claim an external outcome without external evidence.'],
    uncertainty:['Fast-start contract.'],
    assumptions:[],
    compiler:'thin_product_runtime',
    proposalOnly:true
  };
}

function normalizeFiles(files=[]){
  const out=[];const seen=new Set();
  for(const raw of (Array.isArray(files)?files:[]).slice(0,5)){
    const name=String(raw?.name||'result.md').replace(/\\/g,'/').split('/').filter(Boolean).join('/').replace(/[^a-zA-Z0-9._ /-]/g,'-').slice(0,180)||'result.md';
    if(seen.has(name))continue;
    const content=String(raw?.content||'').trim();if(content.length<30)continue;
    seen.add(name);const bytes=Buffer.byteLength(content,'utf8');
    out.push({name,mimeType:String(raw?.mimeType||'text/markdown'),bytes,sha256:sha256(content),content});
  }
  return out;
}

function fallbackArtifact(goal,{revisionNote='',previousFiles=[]}={}){
  const previous=previousFiles.find(x=>typeof x?.content==='string')?.content?.trim();
  const base=previous?`${previous}\n\n---\n\n## Requested update\n${revisionNote||goal}\n\nThe previous artifact is preserved above. This revision records the requested change so no user input is lost while the reasoning service is unavailable.`:`# ${titleFromGoal(goal)}\n\n## Objective\n${goal}\n\n## Current result\nCompany Zero could not complete the reasoning step for this request. No fake leads, facts, measurements, or actions are being invented.\n\n## Next move\nRetry or revise this mission when live reasoning/evidence is available.`;
  return {
    title:`Couldn’t complete — ${titleFromGoal(goal)}`,
    summary:'The mission is saved, but a truthful useful result could not be completed yet.',
    provisional:true,
    degraded:true,
    degradedReason:'reasoning_unavailable',
    model:null,
    files:[{name:'result-unavailable.md',mimeType:'text/markdown',content:base}]
  };
}

function governorTracker(){return {organization:null,evaluator:null}}
function captureGovernorSignal(tracker,progressEvent){
  const type=progressEvent?.type,data=progressEvent?.data||{};
  if(type==='ORGANIZATION_ASSEMBLED'&&data.organization)tracker.organization=data.organization;
  if(type==='EVALUATOR_JUDGMENT'){
    const reasons=Array.isArray(data.reasons)?data.reasons:[];
    tracker.evaluator={status:data.structuralFailure?'STRUCTURAL_FAILURE':reasons.length?'FAIL':'PASS',structuralFailure:Boolean(data.structuralFailure),reasons,contract:data.contract||null,organization:data.organization||tracker.organization||null};
  }
  if(type==='STRUCTURAL_FAILURE')tracker.evaluator={...(tracker.evaluator||{}),status:'STRUCTURAL_FAILURE',structuralFailure:true,reasons:data.reasons||tracker.evaluator?.reasons||[],contract:data.contract||tracker.evaluator?.contract||null,organization:data.organization||tracker.evaluator?.organization||tracker.organization||null};
}
async function applyGovernorEvaluation({companyId,session,mission,artifact,request,tracker}){
  if(!tracker?.evaluator)return null;
  try{
    const governed=await observeMissionEvaluation({companyId,sessionId:session.id,missionId:mission.id,artifactId:artifact.id,request,organization:tracker.evaluator.organization||tracker.organization||{},evaluator:tracker.evaluator});
    if(governed?.decision){
      const action=governed.decision.data?.action||'CONTINUE';
      const remediation=governed.decision.data?.remediation||null;
      await emit(companyId,session.id,'GOVERNOR_DECISION',`Governor: ${action}${action==='RESTRUCTURE'?' — repeated structural failure triggered an organization experiment.':''}`,{action,decisionId:governed.decision.id,evaluationId:governed.evaluation?.id||null,organizationRevisionId:governed.organization?.id||null,remediation});
      if(action==='RESTRUCTURE')await emit(companyId,session.id,'ORGANIZATION_FROZEN',`The failing organization is frozen for replay while alternatives are generated and tested against the same evidence.`,{organizationRevisionId:governed.organization?.id||null,decisionId:governed.decision.id,experimentId:remediation?.experimentId||null,datasetId:remediation?.datasetId||null});
    }
    return governed;
  }catch(error){
    await emit(companyId,session.id,'GOVERNOR_BRIDGE_DEGRADED',`Evaluator evidence was saved, but Governor handoff failed: ${String(error?.message||error).slice(0,140)}.`,{error:String(error?.message||error)}).catch(()=>{});
    return null;
  }
}

async function companySnapshot(companyId,sessionId){
  const [company,session,records]=await Promise.all([get(companyId),get(sessionId),list({companyId,limit:1200})]);
  if(!company||company.kind!=='company')throw new DomainError('company_not_found',404);
  if(!session||session.company_id!==companyId||session.kind!=='operating_session')throw new DomainError('operating_session_not_found',404);
  const artifacts=records.filter(x=>x.kind==='artifact'&&x.data?.sessionId===sessionId&&x.state==='ready').sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1));
  const messages=records.filter(x=>x.kind==='conversation_message'&&x.data?.sessionId===sessionId).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  return {session,company:{...company,data:{...company.data},records},artifacts,strategies:[],messages,outcomeControl:null};
}

export async function scheduleValueFirst(companyId,sessionId,missionId=null){
  const records=await list({companyId,limit:1200});
  const mission=missionId?records.find(x=>x.id===missionId):records.find(x=>x.kind==='mission'&&x.state==='active');
  if(!mission)throw new DomainError('mission_not_found',404);
  const existing=records.filter(x=>x.kind==='artifact'&&x.state==='ready'&&x.data?.sessionId===sessionId).sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1))[0];
  if(existing)return {artifact:existing,job:null,queue:null,alreadyMaterialized:true};
  const job=record('job',{sessionId,operation:'materialize_value_first',operatingSessionId:sessionId,missionId:mission.id,status:'queued',source:`thin-product-first-value:${sessionId}`},companyId,'queued');
  const scheduled=await ensureExperimentWork(companyId,`thin-product:${sessionId}:first-value`,job);
  await emit(companyId,sessionId,'FIRST_VALUE_QUEUED','First-value execution queued on the durable worker.',{jobId:scheduled.job?.id||null,queueId:scheduled.queue?.id||null});
  return {...scheduled,alreadyMaterialized:false};
}

export async function hydrateValueMission(companyId,sessionId){return companySnapshot(companyId,sessionId)}

export async function hydrateValueCompany(company){
  if(!company)return null;
  const records=await list({companyId:company.id,limit:1200});
  return {...company,data:{...company.data},records};
}

export async function createValueMission({goal,outcome,context={},constraints={},ownerSessionId=null,name=null,scheduleFirstValue=true}={}){
  const text=String(goal||outcome||'').trim();if(!text)throw new DomainError('goal_required',400);
  const company=record('company',{name:name||titleFromGoal(text),status:'active',activeOrganizationRevisionId:null,missionVersion:1,mode:'thin_product_runtime',...(ownerSessionId?{ownerSessionId:String(ownerSessionId)}:{})});
  company.company_id=company.id;
  const mission=record('mission',{outcome:text,description:'Accepted from natural language.',metrics:[],constraints:{dailyBudgetUsd:Number(constraints.dailyBudgetUsd||30),qualityFloor:Number(constraints.qualityFloor||.9),...constraints},evaluationPolicy:{type:'outcome_change',enforceMissionRelevance:true},version:1,goalContract:provisionalGoalContract(text,constraints),successCriteria:[]},company.id);
  company.data.missionId=mission.id;
  const session=record('operating_session',{goal:text,v1Mode:true,currentStage:'first_value',state:'running',stageOrder:['first_value','ready'],startedAt:now(),lastProgressAt:now(),context,messages:[],runtime:'thin_product_runtime'},company.id,'running');
  const contract=record('deliverable_contract',{sessionId:session.id,missionId:mission.id,version:1,title:`${titleFromGoal(text)} · V1`,request:text,desiredOutcome:text,assumptionsPolicy:'infer_reversible_ask_at_authority_boundary',completionPolicy:'artifact_first',expectedArtifactKeys:['primary'],completedArtifactKeys:[],status:'building',priority:'first_value',latestVersion:0},company.id,'building');
  session.data.deliverableContractId=contract.id;
  await put(company);await put(mission);await put(session);await put(contract);
  await emit(company.id,session.id,'MISSION_ACCEPTED',`Accepted: “${text.slice(0,120)}${text.length>120?'…':''}”`,{missionId:mission.id,contractId:contract.id,goal:text});
  let scheduled=null;
  if(scheduleFirstValue){
    try{
      scheduled=await scheduleValueFirst(company.id,session.id,mission.id);
      Object.assign(session.data,{firstValueJobId:scheduled.job?.id||null,firstValueQueueId:scheduled.queue?.id||null,lastProgressAt:now()});
      Object.assign(session,await put(session,{expectedVersion:session.version}));
    }catch(error){
      session.data={...session.data,state:'failed',currentStage:'failed',failureReason:'first_value_queue_failed',lastProgressAt:now()};
      session.state='failed';
      try{Object.assign(session,await put(session,{expectedVersion:session.version}))}catch{}
      await emit(company.id,session.id,'FIRST_VALUE_QUEUE_FAILED',`Durable first-value scheduling failed: ${String(error?.message||error).slice(0,140)}.`,{error:String(error?.message||error)}).catch(()=>{});
    }
  }
  await audit({company_id:company.id,actor:'user',action:'mission.accepted',subject_kind:'operating_session',subject_id:session.id,data:{missionId:mission.id,contractId:contract.id,runtime:'thin_product_runtime',firstValueJobId:scheduled?.job?.id||null}});
  return {session,company:{...company,records:[company,mission,session,contract,...(scheduled?.job?[scheduled.job]:[]),...(scheduled?.queue?[scheduled.queue]:[])]},artifacts:[],strategies:[],messages:[],outcomeControl:null};
}

async function persistPublicEvidence(companyId,sessionId,built){
  const results=Array.isArray(built?.publicEvidence?.results)?built.publicEvidence.results.slice(0,10):[];
  const saved=[];
  for(const item of results){
    const url=String(item?.url||'').trim();if(!url)continue;
    const fact=record('world_fact',{sessionId,classification:'EXTERNAL_OBSERVATION',subject:String(item?.title||'Public source').slice(0,180),predicate:'public_search_result',value:{title:String(item?.title||'').slice(0,240),snippet:String(item?.snippet||'').slice(0,1200)},externalRef:url,source:'public-web-search',groundedAt:now()},companyId,'active');
    Object.assign(fact,await put(fact));saved.push(fact);
  }
  if(saved.length)await emit(companyId,sessionId,'EVIDENCE_PERSISTED',`Saved ${saved.length} grounded source${saved.length===1?'':'s'}: ${saved.slice(0,4).map(x=>x.data.subject).join(' · ')}${saved.length>4?' · …':''}`,{count:saved.length,subjects:saved.map(x=>x.data.subject)});
  return saved;
}

function summarizeRunTelemetry(built,totalDurationMs=null){
  const roleCalls=Array.isArray(built?.roleTelemetry)?built.roleTelemetry.filter(Boolean):[];
  const verification=built?.claimVerification?.telemetry||null;
  const repair=built?.claimVerification?.repairTelemetry||built?.repairTelemetry||null;
  const calls=[...roleCalls,...(verification?[verification]:[]),...(repair?[repair]:[])];
  return {
    totalDurationMs:Number.isFinite(Number(totalDurationMs))?Number(totalDurationMs):null,
    calls:calls.length,
    successfulCalls:calls.filter(x=>x?.success).length,
    failedCalls:calls.filter(x=>x?.success===false).length,
    totalTokens:calls.reduce((n,x)=>n+Number(x?.usage?.total_tokens||0),0),
    reportedCostUsd:Number(calls.reduce((n,x)=>n+Number(x?.costUsd||0),0).toFixed(6)),
    providers:[...new Set(calls.map(x=>x?.provider).filter(Boolean))],
    models:[...new Set(calls.map(x=>x?.model).filter(Boolean))],
    verificationPassed:built?.claimVerification?.passed===true,
    repaired:built?.claimVerification?.repaired===true
  };
}

async function persistArtifact({companyId,session,mission,contract,built,version,previousArtifactId=null,source}){
  let files=normalizeFiles(built?.files||[]);if(!files.length)files=normalizeFiles(fallbackArtifact(session.data.goal).files);
  await emit(companyId,session.id,'PERSISTING_RESULT',`Saving ${files.length} file${files.length===1?'':'s'}: ${files.map(f=>f.name).join(', ')}.`,{version,fileNames:files.map(f=>f.name),totalBytes:files.reduce((n,f)=>n+f.bytes,0)});
  const verificationPassed=built?.claimVerification?.passed===true;
  const ready=verificationPassed&&!built?.degraded;
  const readiness=ready?'READY':'PARTIAL';
  const runtimeTelemetry=summarizeRunTelemetry(built,built?.runtimeTotalMs);
  const artifact=record('artifact',{
    title:String(built?.title||`Working result — ${titleFromGoal(session.data.goal)}`).slice(0,140),
    summary:String(built?.summary||'A useful result is ready.').slice(0,500),
    type:'general',artifactKey:'primary',sessionId:session.id,missionId:mission.id,deliverableContractId:contract.id,
    deliverableVersion:version,previousArtifactId,readiness,claimVerification:built?.claimVerification||null,runtimeTelemetry,qa:{passed:ready,semanticVerified:ready,claimVerified:verificationPassed,provisional:!ready},source,
    storage:'inline-record',provisional:!ready,instantValue:version===1,degraded:Boolean(built?.degraded),degradedReason:built?.degradedReason||null,model:built?.model||null,
    files,manifest:{version:1,fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),createdAt:now(),retrievalVerified:true,storage:'inline-record'}
  },companyId,'ready');
  Object.assign(artifact,await put(artifact));
  const evidence=await persistPublicEvidence(companyId,session.id,built);
  const job=record('job',{sessionId:session.id,operation:built?.degraded?'First result returned with degraded research':'First useful result produced',source:'thin-product-runtime',artifactId:artifact.id,evidenceCount:evidence.length},companyId,'completed');
  Object.assign(job,await put(job));
  contract.state=ready?'ready':'partial';Object.assign(contract.data,{status:ready?'ready':'partial',readiness,latestArtifactId:artifact.id,latestVersion:version,completedArtifactKeys:ready?['primary']:[],updatedAt:now()});Object.assign(contract,await put(contract,{expectedVersion:contract.version}));
  session.state='active';Object.assign(session.data,{currentStage:'producing_progress',state:ready?'ready':'partial',readiness,lastProgressAt:now(),firstArtifactId:session.data.firstArtifactId||artifact.id,latestArtifactId:artifact.id,...(ready?{firstValueReadyAt:session.data.firstValueReadyAt||now()}:{firstValuePartialAt:session.data.firstValuePartialAt||now()}),latestJobId:job.id,evidenceCount:evidence.length,resultQuality:ready?'ready':'partial'});Object.assign(session,await put(session,{expectedVersion:session.version}));
  const readyMessage=ready?`Ready: ${artifact.data.title}. ${files.length} file${files.length===1?'':'s'} saved${evidence.length?` with ${evidence.length} grounded source${evidence.length===1?'':'s'}`:''}.`:`Partial result saved: ${artifact.data.title}. ${files.length} useful candidate file${files.length===1?'':'s'} preserved; verification has not passed. ${evidence.length} grounded source${evidence.length===1?'':'s'} attached.`;
  await emit(companyId,session.id,ready?'RESULT_READY':'RESULT_PARTIAL',readyMessage,{artifactId:artifact.id,version,evidenceCount:evidence.length,degraded:Boolean(built?.degraded),readiness,claimVerified:verificationPassed,fileNames:files.map(f=>f.name),runtimeTelemetry});
  await audit({company_id:companyId,actor:'system',action:ready?(version===1?'artifact.first_value_ready':'artifact.revision_ready'):(version===1?'artifact.first_value_partial':'artifact.revision_partial'),subject_kind:'artifact',subject_id:artifact.id,data:{sessionId:session.id,missionId:mission.id,fileCount:files.length,version,evidenceCount:evidence.length,degraded:Boolean(built?.degraded),readiness,claimVerified:verificationPassed}});
  return artifact;
}

export async function materializeFirstValue(companyId,sessionId){
  let session=await get(sessionId);if(!session||session.company_id!==companyId||session.kind!=='operating_session')throw new DomainError('operating_session_not_found',404);
  const records=await list({companyId,limit:1200});
  const existing=records.filter(x=>x.kind==='artifact'&&x.state==='ready'&&x.data?.sessionId===sessionId).sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1))[0];if(existing)return existing;
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active');if(!mission)throw new DomainError('mission_not_found',404);
  let contract=records.find(x=>x.kind==='deliverable_contract'&&x.data?.sessionId===sessionId);
  if(!contract){contract=record('deliverable_contract',{sessionId,missionId:mission.id,version:1,title:`${titleFromGoal(session.data.goal)} · V1`,request:session.data.goal,desiredOutcome:session.data.goal,status:'building',priority:'first_value',latestVersion:0},companyId,'building');Object.assign(contract,await put(contract))}
  const startedAt=Date.now();
  let heartbeat=null;let tick=0;
  let liveState={type:'FIRST_VALUE_STARTED',message:`Starting work on “${session.data.goal.slice(0,100)}${session.data.goal.length>100?'…':''}”`,data:{}};
  const governor=governorTracker();
  await emit(companyId,sessionId,'FIRST_VALUE_STARTED',liveState.message,{});
  const onProgress=async p=>{
    if(!p?.type)return;
    captureGovernorSignal(governor,p);
    liveState={type:p.type,message:String(p.message||p.type),data:p.data||{}};
    await emit(companyId,sessionId,p.type,liveState.message,liveState.data);
  };
  try{
    heartbeat=setInterval(()=>{
      tick+=1;
      const elapsed=Math.max(1,Math.round((Date.now()-startedAt)/1000));
      const detail=liveState.message.replace(/[.!]+$/,'');
      emit(companyId,sessionId,'LIVE_PROGRESS',`${detail} · ${elapsed}s elapsed`,{elapsedSeconds:elapsed,tick,currentType:liveState.type,currentData:liveState.data}).catch(()=>{});
    },3500);
    const built=await buildInstantValue({request:session.data.goal,context:session.data.context||{},onProgress});
    built.runtimeTotalMs=Date.now()-startedAt;
    await emit(companyId,sessionId,'LATENCY_FIRST_VALUE_COMPLETED',`First-value pipeline completed in ${built.runtimeTotalMs}ms before persistence.`,{totalDurationMs:built.runtimeTotalMs,claimVerified:built?.claimVerification?.passed===true,degraded:Boolean(built?.degraded),fileCount:Array.isArray(built?.files)?built.files.length:0});
    const artifact=await persistArtifact({companyId,session,mission,contract,built,version:1,source:'thin-product-first-value'});
    await applyGovernorEvaluation({companyId,session,mission,artifact,request:session.data.goal,tracker:governor});
    await emit(companyId,sessionId,'RUN_TELEMETRY',`Run telemetry · ${artifact.data.runtimeTelemetry?.calls||0} model calls · ${artifact.data.runtimeTelemetry?.totalTokens||0} tokens · ${Number(artifact.data.runtimeTelemetry?.reportedCostUsd||0).toFixed(4)} reported cost · ${Date.now()-startedAt}ms end to end.`,{...(artifact.data.runtimeTelemetry||{}),endToEndMs:Date.now()-startedAt,readiness:artifact.data.readiness});
    return artifact;
  }catch(error){
    await emit(companyId,sessionId,'FIRST_VALUE_DEGRADED',`Primary path failed after ${Math.max(1,Math.round((Date.now()-startedAt)/1000))}s: ${String(error?.message||error).slice(0,140)}. Returning the strongest truthful fallback.`,{error:String(error?.message||error),elapsedSeconds:Math.max(1,Math.round((Date.now()-startedAt)/1000))}).catch(()=>{});
    return persistArtifact({companyId,session,mission,contract,built:fallbackArtifact(session.data.goal),version:1,source:'thin-product-first-value'});
  }finally{if(heartbeat)clearInterval(heartbeat)}
}

export async function createValueMissionWithArtifact(input={}){
  const created=await createValueMission({...input,scheduleFirstValue:false});
  const artifact=await materializeFirstValue(created.company.id,created.session.id);
  const operating=await companySnapshot(created.company.id,created.session.id);
  return {operating,artifact};
}

export async function reviseValueMission(companyId,sessionId,message){
  const text=String(message||'').trim();if(!text)throw new DomainError('message_required',400);
  let session=await get(sessionId);if(!session||session.company_id!==companyId||session.kind!=='operating_session')throw new DomainError('operating_session_not_found',404);
  const records=await list({companyId,limit:1200});
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active');if(!mission)throw new DomainError('mission_not_found',404);
  let contract=records.find(x=>x.kind==='deliverable_contract'&&x.data?.sessionId===sessionId);if(!contract)throw new DomainError('deliverable_contract_not_found',404);
  const prior=records.filter(x=>x.kind==='artifact'&&x.state==='ready'&&x.data?.sessionId===sessionId).sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1))[0]||null;
  const userMessage=record('conversation_message',{sessionId,role:'user',message:text},companyId,'active');await put(userMessage);
  await emit(companyId,sessionId,'REVISION_STARTED',`Revision requested: “${text.slice(0,140)}${text.length>140?'…':''}”`,{message:text.slice(0,180)});
  const request=`Mission: ${session.data.goal}\n\nUser revision request: ${text}\n\nProduce the updated working artifact. Preserve useful prior work where appropriate. Do not claim external facts or actions without evidence.`;
  const governor=governorTracker();
  let built;try{built=await buildInstantValue({request,context:{...(session.data.context||{}),previousArtifact:prior?.data?.files?.map(f=>({name:f.name,content:f.content})).slice(0,3)||[]},onProgress:async progress=>{if(progress?.type){captureGovernorSignal(governor,progress);await emit(companyId,sessionId,progress.type,progress.message||progress.type,progress.data||{})}}})}catch{built=fallbackArtifact(session.data.goal,{revisionNote:text,previousFiles:prior?.data?.files||[]})}
  const version=Number(prior?.data?.deliverableVersion||0)+1;
  const artifact=await persistArtifact({companyId,session,mission,contract,built,version,previousArtifactId:prior?.id||null,source:'thin-product-revision'});
  await applyGovernorEvaluation({companyId,session,mission,artifact,request,tracker:governor});
  const assistantMessage=record('conversation_message',{sessionId,role:'assistant',message:built?.degraded?`Revision V${version} was saved, but live reasoning/research was degraded.`:`Revision V${version} is ready.`,artifactId:artifact.id},companyId,'active');await put(assistantMessage);
  const operating=await companySnapshot(companyId,sessionId);
  return {artifact,operating,message:assistantMessage};
}