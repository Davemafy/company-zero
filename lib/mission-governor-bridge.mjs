import {get,list,put,audit} from './store.mjs';
import {governProductionRun} from './governor-service.mjs';

const now=()=>new Date().toISOString();
const record=(kind,data,companyId,state='active')=>({id:crypto.randomUUID(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});

function normalizedStatus(evaluator={}){
  const explicit=String(evaluator.status||'').toUpperCase();
  if(['PASS','FAIL','STRUCTURAL_FAILURE'].includes(explicit))return explicit;
  if(evaluator.structuralFailure)return 'STRUCTURAL_FAILURE';
  return Array.isArray(evaluator.reasons)&&evaluator.reasons.length?'FAIL':'PASS';
}

async function ensureThinGovernorPolicy(mission){
  const current=mission?.data?.constraints?.governor||{};
  if(Object.keys(current).length)return mission;
  mission.data.constraints={...(mission.data.constraints||{}),governor:{windowSize:12,minimumSampleSize:3,recurringFailureCount:3,failureRateThreshold:.66,qualityFloor:Number(mission.data.constraints?.qualityFloor??.9),costCeilingUsd:Number(mission.data.constraints?.dailyBudgetUsd??30),latencyCeilingMs:45000,escalationThreshold:3}};
  Object.assign(mission,await put(mission,{expectedVersion:mission.version}));
  return mission;
}

async function ensureOrganization(company,mission,organization={}){
  if(company.data.activeOrganizationRevisionId){
    const existing=await get(company.data.activeOrganizationRevisionId);
    if(existing?.kind==='organization_revision')return existing;
  }
  const functions=Array.isArray(organization.functions)&&organization.functions.length?organization.functions:['planning','execution','verification'];
  const dailyBudgetUsd=Number(mission?.data?.constraints?.dailyBudgetUsd||30);
  const roles=functions.map((name,index)=>({
    id:crypto.randomUUID(),
    name:String(name).replaceAll('_',' '),
    purpose:`Own ${String(name).replaceAll('_',' ')} for the current mission contract.`,
    instructions:'Advance the original user outcome, preserve its constraints, and produce inspectable evidence. Do not invent external facts or side effects.',
    capabilityIds:[],
    modelPolicy:{provider:'configured',temperature:0},
    budgetUsd:Number((dailyBudgetUsd/Math.max(1,functions.length)).toFixed(2)),
    order:index
  }));
  const org=record('organization_revision',{
    revision:1,parentRevisionId:null,status:'production',missionKind:organization.mission||'general',proposalSource:'thin_product_runtime',roles,
    routes:roles.slice(0,-1).map((role,index)=>({from:role.id,to:roles[index+1].id,condition:'success'})),
    policies:{allowedCapabilityIds:[],approvalRisks:['financial','external_side_effect'],dailyBudgetUsd,qualityFloor:Number(mission?.data?.constraints?.qualityFloor||.9),latencyLimitMs:45000,promotionMinCases:2},
    resourcePlan:{maxConcurrency:1}
  },company.id,'production');
  Object.assign(org,await put(org));
  company.data.activeOrganizationRevisionId=org.id;
  company.data.status='active';
  Object.assign(company,await put(company,{expectedVersion:company.version}));
  await audit({company_id:company.id,actor:'system',action:'organization.thin_runtime_materialized',subject_kind:'organization_revision',subject_id:org.id,data:{missionKind:organization.mission||'general',functions}});
  return org;
}

function evaluationResults(status,evaluator){
  const missing=evaluator?.contract?.missing||[];
  const reasons=evaluator?.reasons||[];
  if(status==='PASS')return [{metricId:'mission_contract',actual:'PASS',target:'PASS',operator:'=',passed:true,detail:'Artifact evaluator accepted the mission contract.'}];
  if(status==='STRUCTURAL_FAILURE')return [{metricId:'mission_contract',actual:'STRUCTURAL_FAILURE',target:'PASS',operator:'=',passed:false,detail:`Structural contract mismatch. Missing: ${missing.join(', ')||'unspecified'}. Reasons: ${reasons.join(', ')||'unspecified'}.`}];
  return [{metricId:'artifact_quality_gate',actual:'FAIL',target:'PASS',operator:'=',passed:false,detail:`Artifact quality failed without structural classification. Reasons: ${reasons.join(', ')||'unspecified'}.`}];
}

export async function observeMissionEvaluation({companyId,sessionId,missionId,artifactId,request,organization,evaluator}={}){
  if(!companyId||!missionId||!artifactId||!evaluator)return null;
  let company=await get(companyId),mission=await get(missionId);
  if(!company||!mission||company.kind!=='company'||mission.kind!=='mission')return null;
  mission=await ensureThinGovernorPolicy(mission);
  const org=await ensureOrganization(company,mission,organization||{});
  const status=normalizedStatus(evaluator);

  const prior=(await list({companyId,kind:'evaluation',limit:500})).find(x=>x.data?.artifactId===artifactId&&x.data?.evaluator==='artifact_contract_evaluator');
  if(prior)return {status,organization:org,evaluation:prior,decision:null,reused:true};

  const job=record('job',{
    payload:{request:String(request||mission.data.outcome||''),sessionId,missionId,artifactId,missionContract:evaluator?.contract||null},
    status:status==='FAIL'?'failed':'completed',organizationRevisionId:org.id,organizationRevision:org.data.revision,missionVersion:company.data.missionVersion||1,
    source:'thin-product-evaluator',operatingSessionId:sessionId,artifactId
  },companyId,status==='FAIL'?'failed':'completed');
  Object.assign(job,await put(job));

  const run=record('run',{
    jobId:job.id,status:status==='FAIL'?'failed':'completed',organizationRevisionId:org.id,missionVersion:company.data.missionVersion||1,
    startedAt:now(),completedAt:now(),costUsd:0,latencyMs:0,traceIds:[],output:{artifactId,evaluatorStatus:status},shadow:false
  },companyId,status==='FAIL'?'failed':'completed');
  Object.assign(run,await put(run));

  const evaluation=record('evaluation',{
    runId:run.id,artifactId,evaluator:'artifact_contract_evaluator',status,results:evaluationResults(status,evaluator),passed:status==='PASS',executionSucceeded:status!=='FAIL',
    structuralFailure:status==='STRUCTURAL_FAILURE',reasons:evaluator?.reasons||[],contract:evaluator?.contract||null,organizationRevisionId:org.id
  },companyId,status==='PASS'?'passed':status==='STRUCTURAL_FAILURE'?'structural_failure':'failed');
  Object.assign(evaluation,await put(evaluation));

  run.data.evaluationId=evaluation.id;Object.assign(run,await put(run,{expectedVersion:run.version}));
  job.data.runId=run.id;Object.assign(job,await put(job,{expectedVersion:job.version}));

  await audit({company_id:companyId,actor:'evaluator',action:`artifact_evaluator.${status.toLowerCase()}`,subject_kind:'evaluation',subject_id:evaluation.id,data:{artifactId,runId:run.id,organizationRevisionId:org.id,reasons:evaluator?.reasons||[]}});

  const decision=await governProductionRun(companyId,run.id);
  if(decision?.data?.action==='RESTRUCTURE'){
    const freshOrg=await get(org.id);
    if(freshOrg){freshOrg.data.governorFrozen=true;freshOrg.data.governorFrozenAt=now();freshOrg.data.governorFreezeReason='Repeated structural mission-contract failure triggered a frozen replay experiment.';Object.assign(freshOrg,await put(freshOrg,{expectedVersion:freshOrg.version}))}
    await audit({company_id:companyId,actor:'governor',action:'organization.frozen_for_experiment',subject_kind:'organization_revision',subject_id:org.id,data:{decisionId:decision.id,remediation:decision.data.remediation||null}});
  }
  return {status,organization:org,evaluation,decision,reused:false};
}
