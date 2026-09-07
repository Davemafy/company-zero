import {get,list,put,audit} from './store.mjs';
import {enqueue,ensureExperimentWork} from './queue.mjs';
import {createExperiment} from './platform-v1.mjs';
import {promoteCandidateAtomic} from './control-plane.mjs';

const now=()=>new Date().toISOString();
const make=(data,companyId)=>({id:crypto.randomUUID(),company_id:companyId,kind:'job',state:'queued',version:0,data,created_at:now(),updated_at:now()});

export async function scheduleExperiment(companyId,diagnosisId,{datasetId=null,remediationId=null}={}){
  const created=await createExperiment(companyId,diagnosisId);let experiment=await get(created.id);
  if(!datasetId){
    const all=await list({companyId,limit:2000});
    const sourceJobIds=all.filter(x=>x.kind==='job'&&x.data.payload&&!x.data.experimentId).sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(-25).map(x=>x.id);
    const dataset={id:crypto.randomUUID(),company_id:companyId,kind:'experiment_dataset',state:'frozen',version:0,data:{baselineRevisionId:experiment.data.baselineRevisionId,sourceJobIds,evidenceIds:[],reason:'Frozen when the operator scheduled the experiment.'},created_at:now(),updated_at:now()};
    Object.assign(dataset,await put(dataset));datasetId=dataset.id;
  }
  experiment.data.datasetId=datasetId;experiment.data.remediationId=remediationId;Object.assign(experiment,await put(experiment,{expectedVersion:experiment.version}));
  const job=make({operation:'prepare_experiment',experimentId:experiment.id,status:'queued',organizationRevisionId:experiment.data.baselineRevisionId},companyId);Object.assign(job,await put(job));
  await enqueue(companyId,job.id,`experiment:${experiment.id}:prepare`);
  return{experiment,orchestrationJobId:job.id};
}

export async function prepareExperiment(companyId,experimentId){
  let experiment=await get(experimentId);if(!['queued','preparing'].includes(experiment.state))return experiment;
  const dataset=await get(experiment.data.datasetId);
  if(!dataset||dataset.kind!=='experiment_dataset'||dataset.state!=='frozen'||dataset.company_id!==companyId||dataset.data.baselineRevisionId!==experiment.data.baselineRevisionId)throw Error('invalid_or_missing_frozen_dataset');
  const sources=await Promise.all(dataset.data.sourceJobIds.map(get));
  if(sources.length<2||sources.some(x=>!x||x.company_id!==companyId||!x.data.payload))throw Error('insufficient_or_invalid_replay_cases');
  if(experiment.state==='queued'){experiment.state='preparing';try{Object.assign(experiment,await put(experiment,{expectedVersion:experiment.version}))}catch(error){if(error.message!=='stale_version')throw error;experiment=await get(experimentId);if(!['preparing','running'].includes(experiment.state))throw error;if(experiment.state==='running')return experiment}}
  const workItemIds=[];
  for(const revisionId of [experiment.data.baselineRevisionId,...experiment.data.candidateRevisionIds]){
    for(const source of sources){
      const workKey=`experiment:${experimentId}:revision:${revisionId}:source:${source.id}`;
      const job=make({payload:source.data.payload,status:'queued',organizationRevisionId:revisionId,missionVersion:source.data.missionVersion,experimentId,experimentWorkKey:workKey,sourceJobId:source.id,shadow:revisionId!==experiment.data.baselineRevisionId},companyId);
      const ensured=await ensureExperimentWork(companyId,workKey,job);workItemIds.push(ensured.job.id);
    }
  }
  experiment=await get(experimentId);if(experiment.state==='running')return experiment;experiment.data.workItemIds=workItemIds;experiment.data.sourceJobIds=[...dataset.data.sourceJobIds];experiment.state='running';experiment.data.status='running';try{return await put(experiment,{expectedVersion:experiment.version})}catch(error){if(error.message!=='stale_version')throw error;return get(experimentId)}
}

export async function scheduleAggregation(companyId,experimentId){
  const experiment=await get(experimentId);if(!experiment||experiment.state!=='running')return null;
  const jobs=await Promise.all(experiment.data.workItemIds.map(get));if(!jobs.every(x=>x&&['completed','failed','uncertain','cancelled'].includes(x.state)))return null;
  const workKey=`experiment:${experimentId}:aggregate`,job=make({operation:'aggregate_experiment',experimentId,experimentWorkKey:workKey,status:'queued',organizationRevisionId:experiment.data.baselineRevisionId},companyId);return(await ensureExperimentWork(companyId,workKey,job)).job;
}

export async function aggregateExperiment(companyId,experimentId){
  let experiment=await get(experimentId);if(experiment.state==='awaiting_decision')return experiment;if(experiment.state!=='running')throw Error('experiment_not_running');
  const all=await list({companyId,limit:5000}),jobs=experiment.data.workItemIds.map(id=>all.find(x=>x.id===id));
  if(!jobs.every(x=>x&&['completed','failed','uncertain','cancelled'].includes(x.state)))throw Error('experiment_evidence_incomplete');
  experiment.state='aggregating';Object.assign(experiment,await put(experiment,{expectedVersion:experiment.version}));
  const stats=revisionId=>{
    const selected=jobs.filter(x=>x.data.organizationRevisionId===revisionId),runs=selected.map(j=>all.find(x=>x.id===j.data.runId)).filter(Boolean),evaluations=runs.map(x=>all.find(y=>y.id===x.data.evaluationId)).filter(Boolean);
    return{requiredCases:experiment.data.sourceJobIds.length,completedCases:selected.filter(x=>x.state==='completed').length,failedCases:selected.filter(x=>x.state==='failed').length,uncertainCases:selected.filter(x=>x.state==='uncertain').length,cancelledCases:selected.filter(x=>x.state==='cancelled').length,cases:evaluations.length,quality:evaluations.length?evaluations.filter(x=>x.data.passed).length/evaluations.length:0,cost:runs.reduce((s,x)=>s+Number(x.data.costUsd||0),0)/Math.max(1,runs.length),latency:runs.reduce((s,x)=>s+Number(x.data.latencyMs||0),0)/Math.max(1,runs.length),failureRate:selected.filter(x=>x.state!=='completed').length/Math.max(1,selected.length)};
  };
  const baseline=stats(experiment.data.baselineRevisionId),baselineRevision=all.find(x=>x.id===experiment.data.baselineRevisionId);
  experiment.data.results=experiment.data.candidateRevisionIds.map(candidateRevisionId=>{
    const candidate=stats(candidateRevisionId),candidateRevision=all.find(x=>x.id===candidateRevisionId),gateFailures=[];
    if(candidate.completedCases<candidate.requiredCases)gateFailures.push('FAIL_INCOMPLETE_DATASET');
    if(candidate.uncertainCases)gateFailures.push('FAIL_UNCERTAIN_CASES');
    if(candidate.failedCases)gateFailures.push('FAIL_POLICY');
    const qualityDelta=candidate.quality-baseline.quality,costDelta=candidate.cost-baseline.cost,latencyDeltaMs=candidate.latency-baseline.latency;
    if(qualityDelta<=0)gateFailures.push('FAIL_QUALITY');if(costDelta>0)gateFailures.push('FAIL_BUDGET');
    const latencyLimit=Number(baselineRevision?.data?.policies?.latencyLimitMs||Infinity);if(candidate.latency>latencyLimit)gateFailures.push('FAIL_LATENCY');
    return{candidateRevisionId,requiredCases:candidate.requiredCases,completedCases:candidate.completedCases,failedCases:candidate.failedCases,uncertainCases:candidate.uncertainCases,cancelledCases:candidate.cancelledCases,cases:candidate.cases,minCases:candidate.requiredCases,quality:candidate.quality,qualityDelta,costUsd:candidate.cost,costDelta,latencyMs:candidate.latency,latencyDeltaMs,failureRate:candidate.failureRate,failureRateDelta:candidate.failureRate-baseline.failureRate,complexityDelta:Number(candidateRevision?.data?.roles?.length||0)-Number(baselineRevision?.data?.roles?.length||0),policyStatus:gateFailures.length?'FAIL':'PASS',gateFailures,constitutionPassed:gateFailures.length===0};
  });
  experiment.state='awaiting_decision';experiment.data.status='awaiting_decision';await put(experiment,{expectedVersion:experiment.version});
  await audit({company_id:companyId,actor:'runtime',action:'experiment.aggregated',subject_kind:'experiment',subject_id:experimentId,data:{datasetId:experiment.data.datasetId,workItemIds:experiment.data.workItemIds,results:experiment.data.results}});return experiment;
}


export async function automaticallyPromoteExperiment(companyId,experimentId){
  const experiment=await get(experimentId);if(!experiment||experiment.company_id!==companyId||experiment.state!=='awaiting_decision')return null;
  const eligible=(experiment.data.results||[]).filter(x=>x.constitutionPassed&&x.policyStatus==='PASS'&&Number(x.uncertainCases||0)===0&&Number(x.qualityDelta)>0&&Number(x.costDelta)<=0&&Number(x.cases)>=Number(x.minCases));
  if(!eligible.length){await audit({company_id:companyId,actor:'governor',action:'experiment.keep_baseline',subject_kind:'experiment',subject_id:experimentId,data:{reason:'no_candidate_passed_promotion_gates'}});return{action:'KEEP',experimentId,candidateId:null}}
  eligible.sort((a,b)=>Number(b.qualityDelta)-Number(a.qualityDelta)||Number(a.costDelta)-Number(b.costDelta)||Number(a.latencyDeltaMs)-Number(b.latencyDeltaMs)||String(a.candidateRevisionId).localeCompare(String(b.candidateRevisionId)));
  const winner=eligible[0],promoted=await promoteCandidateAtomic({companyId,experimentId,candidateId:winner.candidateRevisionId});
  return{action:'PROMOTE',experimentId,candidateId:winner.candidateRevisionId,decisionId:promoted.decisionId,lessonId:promoted.lessonId,result:winner};
}
