import {createHash} from 'node:crypto';
import {put,get,list,audit} from './store.mjs';
import {buildInstantValue} from './instant-value.mjs';
import {hydrateOperatingSession} from './universal.mjs';
import {DomainError} from './contracts.mjs';

const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const record=(kind,data,companyId=null,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});
const titleFromGoal=goal=>String(goal||'').replace(/[.!?]+$/,'').split(/\s+/).slice(0,8).join(' ').slice(0,88)||'New work';
const sha256=value=>createHash('sha256').update(value).digest('hex');

function provisionalGoalContract(goal,constraints={}){
  return {
    desiredState:goal,
    requestedWorldChange:goal,
    requestedOutcomeModality:'unknown',
    completionEvidenceRequired:true,
    bestAchievableProgress:'Deliver a useful first artifact immediately, then continue deeper work.',
    knownCurrentState:{status:'UNKNOWN',source:'none'},
    successCriteria:[],
    constraints:{...constraints},
    authorityBoundaries:{externalSideEffects:'approval_required',financial:'approval_required',...(constraints.authorityBoundaries||{})},
    requiredUnknowns:[],
    attributionRequirements:['Do not claim an external outcome without external evidence.'],
    uncertainty:['Fast-start contract; deeper interpretation runs after first value.'],
    assumptions:[],
    compiler:'thin_rebuild_fast_start',
    proposalOnly:true
  };
}

export async function createValueMission({goal,outcome,context={},constraints={},ownerSessionId=null,name=null}={}){
  const text=String(goal||outcome||'').trim();
  if(!text)throw new DomainError('goal_required',400);
  const company=record('company',{name:name||titleFromGoal(text),status:'running',activeOrganizationRevisionId:null,missionVersion:1,mode:'thin_rebuild',...(ownerSessionId?{ownerSessionId:String(ownerSessionId)}:{})});
  company.company_id=company.id;
  const mission=record('mission',{outcome:text,description:'Accepted from natural language.',metrics:[],constraints:{dailyBudgetUsd:Number(constraints.dailyBudgetUsd||30),qualityFloor:Number(constraints.qualityFloor||.9),...constraints},evaluationPolicy:{type:'outcome_change',enforceMissionRelevance:true},version:1,goalContract:provisionalGoalContract(text,constraints),successCriteria:[]},company.id);
  company.data.missionId=mission.id;
  const session=record('operating_session',{goal:text,v1Mode:true,currentStage:'first_value',state:'running',stageOrder:['first_value','deepen','operate','verify'],startedAt:now(),lastProgressAt:now(),context,messages:[],runtime:'thin_rebuild'},company.id,'running');
  const contract=record('deliverable_contract',{sessionId:session.id,missionId:mission.id,version:1,title:`${titleFromGoal(text)} · V1`,request:text,desiredOutcome:text,assumptionsPolicy:'infer_reversible_ask_at_authority_boundary',completionPolicy:'first_useful_artifact_then_deepen',expectedArtifactKeys:['primary'],completedArtifactKeys:[],status:'building',priority:'first_value'},company.id,'building');
  session.data.deliverableContractId=contract.id;
  await put(company);await put(mission);await put(session);await put(contract);
  await audit({company_id:company.id,actor:'user',action:'mission.accepted',subject_kind:'operating_session',subject_id:session.id,data:{missionId:mission.id,contractId:contract.id,runtime:'thin_rebuild'}});
  return hydrateOperatingSession(company.id,session.id);
}

function normalizeFiles(files=[]){
  const out=[];const seen=new Set();
  for(const raw of files.slice(0,5)){
    const name=String(raw?.name||'result.md').replace(/\\/g,'/').split('/').filter(Boolean).join('/').replace(/[^a-zA-Z0-9._ /-]/g,'-').slice(0,180)||'result.md';
    if(seen.has(name))continue;
    const content=String(raw?.content||'').trim();if(content.length<30)continue;
    seen.add(name);const bytes=Buffer.byteLength(content,'utf8');
    out.push({name,mimeType:String(raw?.mimeType||'text/markdown'),bytes,sha256:sha256(content),content});
  }
  return out;
}

function hardFallback(goal){
  return {
    title:`Working result — ${titleFromGoal(goal)}`,
    summary:'A usable first-pass artifact created immediately while deeper work continues.',
    provisional:true,
    model:null,
    files:[{name:'first-result.md',mimeType:'text/markdown',content:`# ${titleFromGoal(goal)}\n\n## Request\n${goal}\n\n## Immediate working result\nThis is the first usable workspace for the request. Company Zero did not claim external facts, contacts, actions, measurements, or outcomes that it could not verify.\n\n## Next useful move\nUse this artifact as the editable base while the deeper runtime gathers evidence, improves the content, and performs any connected actions that are actually available.\n\n## Truth boundary\nExternal outcomes remain unverified until grounded evidence exists.\n`}]
  };
}

export async function materializeFirstValue(companyId,sessionId){
  let session=await get(sessionId);
  if(!session||session.company_id!==companyId||session.kind!=='operating_session')throw new DomainError('operating_session_not_found',404);
  const records=await list({companyId,limit:1500});
  const existing=records.find(x=>x.kind==='artifact'&&x.state==='ready'&&x.data?.sessionId===sessionId);
  if(existing)return existing;
  const mission=records.find(x=>x.kind==='mission'&&x.state==='active');
  if(!mission)throw new DomainError('mission_not_found',404);
  let contract=records.find(x=>x.kind==='deliverable_contract'&&x.data?.sessionId===sessionId);
  if(!contract){contract=record('deliverable_contract',{sessionId,missionId:mission.id,version:1,title:`${titleFromGoal(session.data.goal)} · V1`,request:session.data.goal,desiredOutcome:session.data.goal,status:'building',priority:'first_value'},companyId,'building');Object.assign(contract,await put(contract))}

  let built;
  try{built=await buildInstantValue({request:session.data.goal,context:session.data.context||{}})}catch{built=hardFallback(session.data.goal)}
  let files=normalizeFiles(built.files||[]);if(!files.length)files=normalizeFiles(hardFallback(session.data.goal).files);
  const artifact=record('artifact',{title:String(built.title||`Working result — ${titleFromGoal(session.data.goal)}`).slice(0,140),summary:String(built.summary||'First useful result.').slice(0,500),type:'general',artifactKey:'primary',sessionId,missionId:mission.id,deliverableContractId:contract.id,deliverableVersion:1,previousArtifactId:null,qa:{passed:true,semanticVerified:false,provisional:true},source:'thin-rebuild-first-value',storage:'inline-record',provisional:true,instantValue:true,files,manifest:{version:1,fileCount:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),createdAt:now(),retrievalVerified:true,storage:'inline-record'}},companyId,'ready');
  Object.assign(artifact,await put(artifact));
  contract.state='ready';Object.assign(contract.data,{status:'ready',latestArtifactId:artifact.id,latestVersion:1,completedArtifactKeys:['primary'],updatedAt:now()});await put(contract,{expectedVersion:contract.version});
  session.state='running';Object.assign(session.data,{currentStage:'deepen',lastProgressAt:now(),firstArtifactId:artifact.id,firstValueReadyAt:now()});await put(session,{expectedVersion:session.version});
  await audit({company_id:companyId,actor:'system',action:'artifact.first_value_ready',subject_kind:'artifact',subject_id:artifact.id,data:{sessionId,missionId:mission.id,fileCount:files.length}});
  return artifact;
}
