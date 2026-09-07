import {get} from '../lib/store.mjs';
import {ensureExperimentWork} from '../lib/queue.mjs';
const session=await get(process.argv[2]);
if(!session||session.kind!=='operating_session')throw Error('operating_session_required');
if(!['awaiting_operation_plan','awaiting_capabilities'].includes(session.state))throw Error('blocked_session_required');
const now=new Date().toISOString();
const workKey=`operating-session:${session.id}:verification-resume:${session.version}`;
const result=await ensureExperimentWork(session.company_id,workKey,{
  id:crypto.randomUUID(),company_id:session.company_id,kind:'job',state:'queued',version:0,
  data:{operation:'advance_operating_session',operatingSessionId:session.id,status:'queued',stage:session.data.currentStage,source:`operating_session:${session.id}`},created_at:now,updated_at:now,
});
console.log(JSON.stringify({jobId:result.job.id,queueId:result.queue.id,state:result.queue.state}));
