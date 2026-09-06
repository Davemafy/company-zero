import {get,list,put,audit} from './store.mjs';
import {beginRemediation} from './control-plane.mjs';

const now=()=>new Date().toISOString();
const record=(kind,data,companyId,state='active')=>({id:crypto.randomUUID(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});

export async function governProductionRun(companyId,runId){
  const run=await get(runId);if(!run||run.company_id!==companyId||run.data.shadow)return null;
  const job=await get(run.data.jobId);if(!job||job.data.experimentId)return null;
  const company=await get(companyId);if(!company||company.data.activeOrganizationRevisionId!==run.data.organizationRevisionId)return null;
  const all=await list({companyId,limit:5000}),org=all.find(x=>x.id===run.data.organizationRevisionId),mission=all.find(x=>x.kind==='mission'&&x.state==='active');
  const cfg=mission?.data?.constraints?.governor||{};
  const thresholds={windowSize:Math.max(5,Number(cfg.windowSize)||20),minimumSampleSize:Math.max(2,Number(cfg.minimumSampleSize)||5),recurringFailureCount:Math.max(2,Number(cfg.recurringFailureCount)||3),failureRateThreshold:Number(cfg.failureRateThreshold??0.5),qualityFloor:Number(cfg.qualityFloor??org?.data?.policies?.qualityFloor??0.9),costCeilingUsd:Number(cfg.costCeilingUsd??org?.data?.policies?.dailyBudgetUsd??30),latencyCeilingMs:Number(cfg.latencyCeilingMs??org?.data?.policies?.latencyLimitMs??30000),escalationThreshold:Math.max(1,Number(cfg.escalationThreshold)||3)};
  const runs=all.filter(x=>x.kind==='run'&&x.data.organizationRevisionId===run.data.organizationRevisionId&&!x.data.shadow).sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,thresholds.windowSize);
  const evaluations=runs.map(r=>all.find(x=>x.id===r.data.evaluationId)).filter(Boolean),failed=evaluations.filter(x=>!x.data.passed);
  const rate=failed.length/Math.max(1,evaluations.length),quality=1-rate,meanCost=runs.reduce((s,x)=>s+Number(x.data.costUsd||0),0)/Math.max(1,runs.length),meanLatency=runs.reduce((s,x)=>s+Number(x.data.latencyMs||0),0)/Math.max(1,runs.length);
  const signatureFor=e=>`metric:${(e.data.results||[]).filter(r=>!r.passed).map(r=>r.metricId).sort().join(',')||'run_failure'}`,groups=new Map();for(const e of failed){const s=signatureFor(e);groups.set(s,[...(groups.get(s)||[]),e])}const [failureSignature,recurring]=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length)[0]||['none',[]];
  let action='CONTINUE',reason='Evidence window remains inside restructuring thresholds.';
  if(evaluations.length>=thresholds.minimumSampleSize&&recurring.length>=thresholds.recurringFailureCount&&rate>=thresholds.failureRateThreshold){action='RESTRUCTURE';reason='Recurring independently evaluated failures exceeded the configured restructuring threshold.'}
  else if(meanCost>thresholds.costCeilingUsd||meanLatency>thresholds.latencyCeilingMs){action='REPAIR';reason='Operating cost or latency exceeded its configured ceiling.'}
  else if(run.state==='failed'){action='RETRY';reason='An isolated execution failure is not yet evidence of structural weakness.'}
  const evidenceIds=evaluations.map(x=>x.id),decision=record('governor_decision',{organizationRevisionId:run.data.organizationRevisionId,runId,action,reason,evidenceIds,failureSignature,thresholdsSnapshot:thresholds,observed:{sampleSize:evaluations.length,failureCount:failed.length,recurringFailureCount:recurring.length,failureRate:rate,quality,meanCostUsd:meanCost,meanLatencyMs:meanLatency}},companyId,action.toLowerCase());await put(decision);
  if(action==='RESTRUCTURE')decision.data.remediation=await openRemediation({companyId,revisionId:run.data.organizationRevisionId,failureSignature,evaluations:recurring,runs,all,thresholds});
  await audit({company_id:companyId,actor:'governor',action:`governor.${action.toLowerCase()}`,subject_kind:'governor_decision',subject_id:decision.id,data:{evidenceIds,failureSignature}});return decision;
}

async function openRemediation({companyId,revisionId,failureSignature,evaluations,runs,all,thresholds}){
  const evidenceIds=evaluations.map(x=>x.id),runIds=new Set(evaluations.map(x=>x.data.runId)),sourceJobIds=[...new Set(runs.filter(x=>runIds.has(x.id)).map(x=>x.data.jobId))];
  const remediation=await beginRemediation({companyId,revisionId,failureSignature,data:{evidenceIds,sourceJobIds,thresholdsSnapshot:thresholds}});if(!remediation.created)return{id:remediation.id,reused:true};
  const dataset=record('experiment_dataset',{remediationId:remediation.id,baselineRevisionId:revisionId,evidenceIds,sourceJobIds,failureSignature,reason:'Frozen at Governor RESTRUCTURE decision.'},companyId,'frozen');await put(dataset);
  const traces=all.filter(x=>x.kind==='trace'&&runIds.has(x.data.runId)),affectedCapabilities=[...new Set(traces.filter(x=>['failed','blocked'].includes(x.state)).map(x=>x.data.capabilityId).filter(Boolean))];
  const diagnosis=record('diagnosis',{remediationId:remediation.id,datasetId:dataset.id,organizationRevisionId:revisionId,failureMode:'Repeated metric-contract failure',failureSignature,confidence:Math.min(.95,.5+evaluations.length*.08),affectedRoles:[...new Set(traces.map(x=>x.data.roleId).filter(Boolean))],affectedRoutes:[],affectedCapabilities,recommendedMutationClasses:['AddVerifier','ChangeRouting','ChangeInstructions','ChangeBudgetAllocation'],evidenceIds},companyId);await put(diagnosis);
  const {scheduleExperiment}=await import('./experiment-service.mjs');const scheduled=await scheduleExperiment(companyId,diagnosis.id,{datasetId:dataset.id,remediationId:remediation.id});return{id:remediation.id,reused:false,datasetId:dataset.id,diagnosisId:diagnosis.id,experimentId:scheduled.experiment.id};
}
