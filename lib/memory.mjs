import {put,list} from './store.mjs';
const now=()=>new Date().toISOString();
export async function writePromotionLesson({companyId,experiment,candidate,result,decision}){
  if(decision!=='promote')return null;
  const all=await list({companyId,limit:5000});
  const experimentJobs=all.filter(x=>x.kind==='job'&&x.data?.experimentId===experiment.id);
  const runIds=new Set(experimentJobs.map(x=>x.data?.runId).filter(Boolean));
  const evalIds=all.filter(x=>x.kind==='evaluation'&&runIds.has(x.data?.runId)).map(x=>x.id);
  if(!evalIds.length)return null;
  const mutation=candidate.data?.mutation?[candidate.data.mutation]:[];
  const lesson={id:crypto.randomUUID(),company_id:companyId,kind:'lesson',state:'active',version:0,data:{scope:'company',context:`Promotion ${candidate.data?.revision||candidate.id} improved quality by ${Number(result.qualityDelta||0).toFixed(4)} within the constitution.`,structuralChange:mutation,observedEffect:{qualityDelta:Number(result.qualityDelta||0),costDelta:Number(result.costDelta||0),latencyDeltaMs:Number(result.latencyDeltaMs||0)},evidenceIds:[...new Set(evalIds)],confidence:Math.min(.99,.6+Math.min(100,result.cases||0)/250),experimentId:experiment.id,candidateRevisionId:candidate.id,createdAt:now()},created_at:now(),updated_at:now()};
  return put(lesson);
}
export function capabilityAffinityFromLessons(lessons=[]){
  const score=new Map();
  for(const l of lessons)for(const m of l.data?.structuralChange||[]){if(m.capabilityId)score.set(m.capabilityId,(score.get(m.capabilityId)||0)+Math.max(0,Number(l.data?.confidence)||0))}
  return score;
}
