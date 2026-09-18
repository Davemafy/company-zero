import{get,put}from'./store.mjs';
import{claim,transition,retry,heartbeat,renewLease,reapExpired}from'./queue.mjs';
import{executeJob}from'./platform-v1.mjs';
import{prepareExperiment,aggregateExperiment,scheduleAggregation,automaticallyPromoteExperiment}from'./experiment-service.mjs';
import{governProductionRun}from'./governor-service.mjs';
import{emitRuntimeEvent}from'./outcome-control.mjs';
import{advanceOperatingSession,replanOperatingSession,scheduleReplan,ensureConfiguredRuntimeProviders,materializeFirstArtifact}from'./universal.mjs';
import{materializeFirstValue}from'./mission-service.mjs';
import{providerConfigSnapshot}from'./model-gateway.mjs';

const candidateLabel=index=>String.fromCharCode(65+Math.max(0,index));
const queueAttempt=q=>Number(q?.attempt??q?.data?.attempt??0);
const queueMaxAttempts=q=>Number(q?.max_attempts??q?.data?.maxAttempts??5);
const jobSessionId=j=>j?.data?.operatingSessionId||j?.data?.sessionId||j?.data?.payload?.sessionId||null;

async function experimentSessions(experiment){
  const sources=await Promise.all((experiment?.data?.sourceJobIds||[]).map(get));
  return [...new Set(sources.map(jobSessionId).filter(Boolean))];
}

async function emitExperimentEvent(companyId,experiment,type,message,data={}){
  const sessions=await experimentSessions(experiment);
  for(const sessionId of sessions){
    await emitRuntimeEvent(companyId,{sessionId,type,subjectKind:'experiment',subjectId:experiment?.id||null,data:{message,...data}}).catch(()=>{});
  }
  return sessions;
}

async function emitCandidateResults(companyId,experiment){
  const results=experiment?.data?.results||[];
  for(const [index,result] of results.entries()){
    const label=candidateLabel(index);
    const delta=Number(result.qualityDelta||0);
    const coverage=Math.round(Number(result.quality||0)*100);
    const baselineCoverage=Math.round((Number(result.quality||0)-delta)*100);
    const improved=delta>0;
    const message=improved
      ?`Candidate ${label} improved contract coverage from ${baselineCoverage}% to ${coverage}%.`
      :`Candidate ${label} did not beat the baseline (${coverage}% contract coverage).`;
    await emitExperimentEvent(companyId,experiment,'GOVERNOR_CANDIDATE_EVALUATED',message,{candidateLabel:label,candidateRevisionId:result.candidateRevisionId,quality:result.quality,qualityDelta:result.qualityDelta,costDelta:result.costDelta,latencyDeltaMs:result.latencyDeltaMs,policyStatus:result.policyStatus,gateFailures:result.gateFailures||[]});
  }
}

async function markTerminalFailure(queueItem,reason='retry_limit_exhausted'){
  const jobId=queueItem?.job_id||queueItem?.data?.jobId;if(!jobId)return null;
  const job=await get(jobId);if(!job)return null;
  if(!['completed','failed','cancelled'].includes(job.state)){
    job.state='failed';job.data={...(job.data||{}),status:'failed',terminalFailure:true,terminalFailureReason:reason,failedAt:new Date().toISOString(),queueState:'dead_letter'};
    try{Object.assign(job,await put(job,{expectedVersion:job.version}))}catch{}
  }
  const sessionId=jobSessionId(job);
  if(sessionId){
    const session=await get(sessionId);
    if(session&&session.kind==='operating_session'&&!['completed','failed','cancelled','terminated'].includes(session.state)){
      session.state='failed';session.data={...(session.data||{}),state:'failed',currentStage:'failed',failedAt:new Date().toISOString(),failureReason:reason,lastProgressAt:new Date().toISOString()};
      try{await put(session,{expectedVersion:session.version})}catch{}
    }
    await emitRuntimeEvent(queueItem.company_id,{sessionId,type:'WORK_TERMINAL_FAILURE',subjectKind:'queue_item',subjectId:queueItem.id,data:{message:`Execution stopped after ${queueAttempt(queueItem)} of ${queueMaxAttempts(queueItem)} attempts. The mission is marked failed instead of staying Working forever.`,reason,attempt:queueAttempt(queueItem),maxAttempts:queueMaxAttempts(queueItem),jobId}}).catch(()=>{});
  }
  return job;
}

async function reapTerminalExpired(){
  const reaped=await reapExpired({limit:25,actor:'railway-worker-reaper'});
  for(const item of reaped)await markTerminalFailure(item,'lease_expired_after_retry_limit');
  return reaped;
}

export class WorkerService{
  constructor({workerId=`worker-${crypto.randomUUID()}`,leaseSeconds=60,renewEveryMs=Math.max(100,leaseSeconds*400),crashHook=null}={}){Object.assign(this,{workerId,leaseSeconds,renewEveryMs,crashHook})}

  async tick(){
    const providerConfig=providerConfigSnapshot();
    await heartbeat(this.workerId,null,{status:'polling',leaseSeconds:this.leaseSeconds,retryPolicy:'bounded',providers:providerConfig});
    const reaped=await reapTerminalExpired().catch(()=>[]);
    let q=await claim(this.workerId,this.leaseSeconds);if(!q)return reaped.length?{reaped}:null;
    await heartbeat(this.workerId,q.id,{status:'working',queueState:q.state,attempt:queueAttempt(q),maxAttempts:queueMaxAttempts(q),leaseSeconds:this.leaseSeconds,providers:providerConfig});
    let busy=false,renewError=null,currentJob=null;
    const timer=setInterval(async()=>{if(busy)return;busy=true;try{await renewLease(q,this.workerId,this.leaseSeconds)}catch(e){renewError=e}try{await heartbeat(this.workerId,q.id,{status:'working',queueState:q.state,attempt:queueAttempt(q),maxAttempts:queueMaxAttempts(q),leaseRenewedAt:new Date().toISOString()})}catch{}finally{busy=false}},this.renewEveryMs);
    try{
      q=await transition(q,'running',{actor:this.workerId});
      await this.crashHook?.('after_claim',q);
      const jid=q.job_id||q.data.jobId,j=await get(jid);if(!j)throw Error('queued_job_missing');currentJob=j;
      const sessionId=jobSessionId(j);
      if(queueAttempt(q)>1&&sessionId){
        await emitRuntimeEvent(q.company_id,{sessionId,type:'WORK_RECOVERED',subjectKind:'queue_item',subjectId:q.id,data:{message:`Worker recovered this job after an interrupted or failed attempt. Resuming attempt ${queueAttempt(q)} of ${queueMaxAttempts(q)}.`,attempt:queueAttempt(q),maxAttempts:queueMaxAttempts(q),workerId:this.workerId}}).catch(()=>{});
      }
      let experiment,promotion=null;

      if(j.data.operation==='prepare_experiment'){
        experiment=await prepareExperiment(q.company_id,j.data.experimentId);
        const candidateCount=(experiment.data.candidateRevisionIds||[]).length;
        const caseCount=(experiment.data.sourceJobIds||[]).length;
        await emitExperimentEvent(q.company_id,experiment,'GOVERNOR_EXPERIMENT_STARTED',`Governor testing ${candidateCount} alternative organization${candidateCount===1?'':'s'} against ${caseCount} frozen failure case${caseCount===1?'':'s'}.`,{candidateCount,caseCount,baselineRevisionId:experiment.data.baselineRevisionId,candidateRevisionIds:experiment.data.candidateRevisionIds||[]});
      }

      if(j.data.operation==='aggregate_experiment'){
        experiment=await aggregateExperiment(q.company_id,j.data.experimentId);
        await emitCandidateResults(q.company_id,experiment);
        promotion=await automaticallyPromoteExperiment(q.company_id,j.data.experimentId);
        const sessions=await experimentSessions(experiment);
        if(promotion?.action==='PROMOTE'){
          const winnerIndex=(experiment.data.candidateRevisionIds||[]).indexOf(promotion.candidateId);
          const label=candidateLabel(winnerIndex<0?0:winnerIndex);
          for(const sid of sessions){
            await emitRuntimeEvent(q.company_id,{sessionId:sid,type:'ORGANIZATION_PROMOTED',subjectKind:'organization_revision',subjectId:promotion.candidateId,data:{message:`Organization promoted — Candidate ${label} proved better on the frozen cases and is now production.`,candidateLabel:label,candidateRevisionId:promotion.candidateId,decisionId:promotion.decisionId,result:promotion.result}}).catch(()=>{});
            await scheduleReplan(q.company_id,sid,{reason:'A candidate organization passed the evidence gates and was promoted.',sourceRef:`promotion:${promotion.decisionId}`,activate:true,evidenceIds:[promotion.decisionId]});
          }
        }else{
          for(const sid of sessions)await emitRuntimeEvent(q.company_id,{sessionId:sid,type:'GOVERNOR_BASELINE_KEPT',subjectKind:'experiment',subjectId:experiment.id,data:{message:'No candidate cleared every promotion gate. The current production organization stays in place.',experimentId:experiment.id}}).catch(()=>{});
        }
      }

      if(experiment){
        q=await transition(q,'evaluating',{actor:this.workerId});q=await transition(q,'completed',{actor:this.workerId});j.state='completed';j.data.status='completed';await put(j,{expectedVersion:j.version});return{queue:q,experiment,promotion};
      }

      if(j.data.operation==='materialize_value_first'){
        const artifact=await materializeFirstValue(q.company_id,j.data.operatingSessionId||j.data.sessionId);
        q=await transition(q,'evaluating',{actor:this.workerId,evidenceIds:[artifact.id]});
        q=await transition(q,'completed',{actor:this.workerId,evidenceIds:[artifact.id]});
        j.state='completed';j.data={...(j.data||{}),status:'completed',artifactId:artifact.id,readiness:artifact.data?.readiness||'PARTIAL',completedAt:new Date().toISOString()};await put(j,{expectedVersion:j.version});
        return{queue:q,artifact};
      }

      if(j.data.operation==='materialize_first_artifact'){
        const artifact=await materializeFirstArtifact(q.company_id,j.data.operatingSessionId);await ensureConfiguredRuntimeProviders(q.company_id);const session=await advanceOperatingSession(q.company_id,j.data.operatingSessionId,{singleStage:true});q=await transition(q,'evaluating',{actor:this.workerId,evidenceIds:[artifact.id]});q=await transition(q,'completed',{actor:this.workerId,evidenceIds:[artifact.id]});j.state='completed';j.data.status='completed';j.data.artifactId=artifact.id;await put(j,{expectedVersion:j.version});return{queue:q,artifact,session};
      }

      if(j.data.operation==='advance_operating_session'||j.data.operation==='replan_operating_session'){
        await ensureConfiguredRuntimeProviders(q.company_id);const session=j.data.operation==='advance_operating_session'?await advanceOperatingSession(q.company_id,j.data.operatingSessionId,{singleStage:true}):await replanOperatingSession(q.company_id,j.data.operatingSessionId,j.data.replanRequestId);q=await transition(q,'evaluating',{actor:this.workerId});q=await transition(q,'completed',{actor:this.workerId});j.state='completed';j.data.status='completed';await put(j,{expectedVersion:j.version});return{queue:q,session};
      }

      const run=await executeJob(q.company_id,jid,{shadow:Boolean(j.data.shadow),revisionId:j.data.organizationRevisionId});
      if(renewError)throw renewError;
      if(run.state==='waiting_for_approval'){q=await transition(q,'waiting_for_approval',{actor:this.workerId,evidenceIds:run.data.traceIds,reason:'approval_required'});return{queue:q,run}}
      if(run.state==='uncertain'){q=await transition(q,'uncertain',{actor:this.workerId,evidenceIds:run.data.traceIds,reason:'external_side_effect_outcome_unknown'});return{queue:q,run}}
      q=await transition(q,'evaluating',{actor:this.workerId,evidenceIds:run.data.traceIds});
      q=await transition(q,run.state==='completed'?'completed':'failed',{actor:this.workerId});
      let governor=null;
      if(j.data.experimentId)await scheduleAggregation(q.company_id,j.data.experimentId);else governor=await governProductionRun(q.company_id,run.id);
      if(governor?.data?.action==='REPLAN_STRATEGY'&&j.data.operatingSessionId)await scheduleReplan(q.company_id,j.data.operatingSessionId,{reason:governor.data.reason,sourceRef:`governor:${governor.id}`,activate:false,evidenceIds:governor.data.evidenceIds});
      return{queue:q,run,governor};
    }catch(e){
      if(e.code==='SIMULATED_CRASH')throw e;
      q=await retry(q,e.message,{uncertain:Boolean(e.uncertainSideEffect)});
      if(q?.state==='dead_letter')await markTerminalFailure(q,`retry_limit_exhausted:${e.message}`);
      else if(currentJob){const sessionId=jobSessionId(currentJob);if(sessionId)await emitRuntimeEvent(q.company_id,{sessionId,type:'WORK_RETRY_SCHEDULED',subjectKind:'queue_item',subjectId:q.id,data:{message:`Execution attempt ${queueAttempt(q)} failed. Retry scheduled; ${Math.max(0,queueMaxAttempts(q)-queueAttempt(q))} attempt${Math.max(0,queueMaxAttempts(q)-queueAttempt(q))===1?'':'s'} remain.`,attempt:queueAttempt(q),maxAttempts:queueMaxAttempts(q),error:String(e.message||e)}}).catch(()=>{})}
      return{queue:q,error:e.message};
    }finally{
      clearInterval(timer);try{await heartbeat(this.workerId,null,{status:'idle',leaseSeconds:this.leaseSeconds,providers:providerConfig})}catch{}
    }
  }
}
