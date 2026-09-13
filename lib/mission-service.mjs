import {createHash} from 'node:crypto';
import {put,get,list,audit} from './store.mjs';
import {buildInstantValue} from './instant-value.mjs';
import {DomainError} from './contracts.mjs';

const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const record=(kind,data,companyId=null,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});
const titleFromGoal=goal=>String(goal||'').replace(/[.!?]+$/,'').split(/\s+/).slice(0,9).join(' ').slice(0,96)||'New work';
const sha256=value=>createHash('sha256').update(value).digest('hex');

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
  const base=previous?`${previous}\n\n---\n\n## Requested update\n${revisionNote||goal}\n\nThe previous artifact is preserved above. This revision records the requested change so no user input is lost while the reasoning service is unavailable.`:`# ${titleFromGoal(goal)}\n\n## Objective\n${goal}\n\n## Useful starting point\n- Define what a successful result would look like in observable terms.\n- Separate facts we already know from facts that require external evidence.\n- Produce the strongest reversible work now instead of blocking on future access.\n- Ask for permission only when a specific external or irreversible step is actually next.\n\n## Working assumptions\nNo external facts, contacts, purchases, messages, measurements, or completed actions are claimed without evidence.\n\n## Next move\nUse this artifact as the editable working surface. A connected reasoning service can replace it with a richer version without changing the mission record.`;
  return {
    title:`Working result — ${titleFromGoal(goal)}`,
    summary:'A durable working artifact is ready. External outcomes remain separate from artifact completion.',
    provisional:true,
    degraded:true,
    degradedReason:'reasoning_unavailable',
    model:null,
    files:[{name:'working-result.md',mimeType:'text/markdown',content:base}]
  };
}

async function companySnapshot(companyId,sessionId){
  const [company,session,records]=await Promise.all([get(companyId),get(sessionId),list({companyId,limit:1200})]);
  if(!company||company.kind!=='company')throw new DomainError('company_not_found',404);
  if(!session||session.company_id!==companyId||session.kind!=='operating_session')throw new DomainError('operating_session_not_found',404);
  const artifacts=records.filter(x=>x.kind==='artifact'&&x.data?.sessionId===sessionId&&x.state==='ready').sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1));
  const messages=records.filter(x=>x.kind==='conversation_message'&&x.data?.sessionId===sessionId).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
  return {session,company:{...company,data:{...company.data},records},artifacts,strategies:[],messages,outcomeControl:null};
}

export async function hydrateValueMission(companyId,sessionId){
  return companySnapshot(companyId,sessionId);
}

export async function hydrateValueCompany(company){
  if(!company)return null;
  const records=await list({companyId:company.id,limit:1200});
  return {...company,data:{...company.data},records};
}

export async function createValueMission({goal,outcome,context={},constraints={},ownerSessionId=null,name=null}={}){
  const text=String(goal||outcome||'').trim();
  if(!text)throw new DomainError('goal_required',400);
  const company=record('company',{name:name||titleFromGoal(text),status:'active',activeOrganizationRevisionId:null,missionVersion:1,mode:'thin_product_runtime',...(ownerSessionId?{ownerSessionId:String(ownerSessionId)}:{})});
  company.company_id=company.id;
  const mission=record('mission',{outcome:text,description:'Accepted from natural language.',metrics:[],constraints:{dailyBudgetUsd:Number(constraints.dailyBudgetUsd||30),qualityFloor:Number(constraints.qualityFloor||.9),...constraints},evaluationPolicy:{type:'outcome_change',enforceMissionRelevance:true},version:1,goalContract:provisionalGoalContract(text,constraints),successCriteria:[]},company.id);
  company.data.missionId=mission.id;
  const session=record('operating_session',{goal:text,v1Mode:true,currentStage:'first_value',state:'running',stageOrder:['first_value','ready'],startedAt:now(),lastProgressAt:now(),context,messages:[],runtime:'thin_product_runtime'},company.id,'running');
  const contract=record('deliverable_contract',{sessionId:session.id,missionId:mission.id,version:1,title:`${titleFromGoal(text)} · V1`,request:text,desiredOutcome:text,assumptionsPolicy:'infer_reversible_ask_at_authority_boundary',completionPolicy:'artifact_first',expectedArtifactKeys:['primary'],completedArtifactKeys:[],status:'building',priority:'first_value',latestVersion:0},company.id,'building');
  session.data.deliverableContractId=contract.id;
  await put(company);await put(mission);await put(session);await put(contract);
  await audit({company_id:company.id,actor:'user',action:'mission.accepted',subject_kind:'operating_session',subject_id:session.id,data:{missionId:mission.id,contractId:contract.id,runtime:'thin_product_runtime'}});
  return {session,company:{...company,records:[company,mission,session,contract]},artifacts:[],strategies:[],messages:[],outcomeControl:null};
}

async function persistArtifact({companyId,session,mission,contract,built,version,previousArtifactId=null,source}){
  let files=normalizeFiles(built?.files||[]);
  if(!files.length)files=normalizeFiles(fallbackArtifact(session.data.goal).files);
  const artifact=record('artifact',{
    title:String(built?.title||`Working result — ${titleFromGoal(session.data.goal)}`).slice(0,140),
    summary:String(built?.summary||'A useful result is ready.').slice(0,500),
    type:'general',artifactKey:'primary',sessionId:session.id,missionId:mission.id,deliverableContractId:contract.id,
    deliverableVersion:version,previousArtifactId,qa:{passed:true,semanticVerified:false,provisional:true},source,
    storage:'inline-record',provisional:true,instantValue:version===1,degraded:Boolean(built?.degraded),degradedReason:built?.degradedReason||null,model:built?.model||null,
    files,manifest:{version:1,fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),createdAt:now(),retrievalVerified:true,storage:'inline-record'}
  },companyId,'ready');
  Object.assign(artifact,await put(artifact));
  contract.state='ready';Object.assign(contract.data,{status:'ready',latestArtifactId:artifact.id,latestVersion:version,completedArtifactKeys:['primary'],updatedAt:now()});Object.assign(contract,await put(contract,{expectedVersion:contract.version}));
  session.state='active';Object.assign(session.data,{currentStage:'ready',state:'ready',lastProgressAt:now(),firstArtifactId:session.data.firstArtifactId||artifact.id,latestArtifactId:artifact.id,firstValueReadyAt:session.data.firstValueReadyAt||now()});Object.assign(session,await put(session,{expectedVersion:session.version}));
  await audit({company_id:companyId,actor:'system',action:version===1?'artifact.first_value_ready':'artifact.revision_ready',subject_kind:'artifact',subject_id:artifact.id,data:{sessionId:session.id,missionId:mission.id,fileCount:files.length,version}});
  return artifact;
}

export async function materializeFirstValue(companyId,sessionId){
  let session=await get(sessionId);
  if(!session||session.company_id!==companyId||session.kind!=='operating_session')throw new DomainError('operating_session_not_found',404);
  const records=await list({companyId,limit:1200});
  const existing=records.filter(x=>x.kind==='artifact'&&x.state==='ready'&&x.data?.sessionId===sessionId).sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1))[0];
  if(existing)return existing;
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active');if(!mission)throw new DomainError('mission_not_found',404);
  let contract=records.find(x=>x.kind==='deliverable_contract'&&x.data?.sessionId===sessionId);
  if(!contract){contract=record('deliverable_contract',{sessionId,missionId:mission.id,version:1,title:`${titleFromGoal(session.data.goal)} · V1`,request:session.data.goal,desiredOutcome:session.data.goal,status:'building',priority:'first_value',latestVersion:0},companyId,'building');Object.assign(contract,await put(contract))}
  let built;try{built=await buildInstantValue({request:session.data.goal,context:session.data.context||{}})}catch{built=fallbackArtifact(session.data.goal)}
  return persistArtifact({companyId,session,mission,contract,built,version:1,source:'thin-product-first-value'});
}

export async function createValueMissionWithArtifact(input={}){
  const created=await createValueMission(input);
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
  const request=`Mission: ${session.data.goal}\n\nUser revision request: ${text}\n\nProduce the updated working artifact. Preserve useful prior work where appropriate. Do not claim external facts or actions without evidence.`;
  let built;try{built=await buildInstantValue({request,context:{...(session.data.context||{}),previousArtifact:prior?.data?.files?.map(f=>({name:f.name,content:f.content})).slice(0,3)||[]}})}catch{built=fallbackArtifact(session.data.goal,{revisionNote:text,previousFiles:prior?.data?.files||[]})}
  if(built?.degraded)built=fallbackArtifact(session.data.goal,{revisionNote:text,previousFiles:prior?.data?.files||[]});
  const version=Number(prior?.data?.deliverableVersion||0)+1;
  const artifact=await persistArtifact({companyId,session,mission,contract,built,version,previousArtifactId:prior?.id||null,source:'thin-product-revision'});
  const assistantMessage=record('conversation_message',{sessionId,role:'assistant',message:`Revision V${version} is ready.`,artifactId:artifact.id},companyId,'active');await put(assistantMessage);
  const operating=await companySnapshot(companyId,sessionId);
  return {artifact,operating,message:assistantMessage};
}
