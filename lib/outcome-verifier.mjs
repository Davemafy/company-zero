import {getPath,compare} from './evaluator.mjs';

const finite=n=>Number.isFinite(Number(n));
function observedValue(observation,criterion){
  if(criterion.observationPath)return getPath(observation,criterion.observationPath);
  const metrics=observation?.metrics;
  if(metrics&&criterion.metricId in metrics)return metrics[criterion.metricId];
  if(observation?.metricId===criterion.metricId)return observation.value;
  return undefined;
}

export function verifyOutcomeChange({goalContract,observations=[],executionStatus,sessionId=null,missionVersion=null}){
  const criteria=goalContract?.successCriteria||[];
  const phase=x=>({baseline:0,before:0,observation:1,after:2}[x?.data?.phase||x?.phase]??1);
  const scoped=observations.filter(o=>{const d=o.data||o;if(sessionId&&d.sessionId&&d.sessionId!==sessionId)return false;if(missionVersion!=null&&d.missionVersion!=null&&Number(d.missionVersion)!==Number(missionVersion))return false;return true});
  const ordered=[...scoped].sort((a,b)=>phase(a)-phase(b)||String(a.data?.observedAt||a.observedAt||a.created_at||'').localeCompare(String(b.data?.observedAt||b.observedAt||b.created_at||'')));
  const results=criteria.map(criterion=>{
    const values=ordered.map(o=>{const d=o.data||o;return{observationId:o.id,value:observedValue(d,criterion),classification:d.classification||'UNCLASSIFIED',evidenceIds:d.evidenceIds||[],externalRef:d.externalRef||null,attributionRef:d.attributionRef||null,phase:d.phase,observedAt:d.observedAt}}).filter(x=>x.value!==undefined);
    const grounded=values.filter(x=>x.classification==='EXTERNAL_OBSERVATION'&&x.evidenceIds.length>0);
    const before=grounded.find(x=>['baseline','before'].includes(x.phase)),after=[...grounded].reverse().find(x=>['after','observation'].includes(x.phase)&&x.observationId!==before?.observationId),target=criterion.target;
    let passed=false,change=null,status='insufficient_observation';
    if(before&&after&&target!==undefined){passed=compare(after.value,criterion.operator||'>=',target);status=passed?'achieved':'not_achieved'}
    if(before&&after&&finite(before.value)&&finite(after.value))change=Number(after.value)-Number(before.value);
    const attributionStatus=after?.attributionRef?'ATTRIBUTED_CHANGE':before&&after?'OBSERVED_CHANGE':'UNKNOWN_ATTRIBUTION';
    return{metricId:criterion.metricId||criterion.id,description:criterion.description,before:before?.value,after:after?.value,change,target,operator:criterion.operator||'>=',observationIds:grounded.map(x=>x.observationId).filter(Boolean),untrustedObservationIds:values.filter(x=>!grounded.includes(x)).map(x=>x.observationId).filter(Boolean),evidenceIds:[...new Set(grounded.flatMap(x=>x.evidenceIds))],externalRefs:grounded.map(x=>x.externalRef).filter(Boolean),attributionRefs:grounded.map(x=>x.attributionRef).filter(Boolean),attributionStatus,passed,status};
  });
  const hasGroundedTarget=results.length>0&&results.every(x=>x.before!==undefined&&x.after!==undefined&&x.target!==undefined&&x.observationIds.length>=2);
  return{executionSucceeded:executionStatus==='completed',outcomeAchieved:hasGroundedTarget&&results.every(x=>x.passed),status:hasGroundedTarget?(results.every(x=>x.passed)?'achieved':'not_achieved'):'insufficient_observation',results,evaluator:'independent_outcome_change'};
}
