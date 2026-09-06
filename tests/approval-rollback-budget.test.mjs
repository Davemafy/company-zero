import assert from 'node:assert/strict';
import http from 'node:http';
import {createCompany,registerProvider,synthesize,launch,submitJob,submitEvent,approvalDecision,approvals,rollback,hydrateCompany} from '../lib/platform-v1.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

let calls=0;
const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const c of req)chunks.push(c);res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,received:JSON.parse(Buffer.concat(chunks).toString()||'{}')}))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  // Resumable approval: worker parks, user decides, same run resumes from checkpoint.
  const c=await createCompany({name:'Approval Ops',outcome:'Perform a sensitive action safely',metrics:[{id:'ok',source:'run.status',operator:'=',target:'completed'}],constraints:{dailyBudgetUsd:5}});
  await registerProvider(c.id,{name:'Sensitive API',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[{name:'send_sensitive_action',endpoint:'/act',risk:'external_side_effect',inputSchema:{type:'object'},outputSchema:{type:'object'},estimatedCost:{type:'fixed',usd:.1}}]}});
  const org=await synthesize(c.id);await launch(c.id,org.id);const job=await submitJob(c.id,{id:'approval-case'});
  const first=await new WorkerService({workerId:'approval-worker'}).tick();
  assert.equal(first.run.state,'waiting_for_approval');assert.equal(calls,0,'side effect executed before approval');
  assert.equal((await list({companyId:c.id,kind:'invocation'}))[0].state,'planned');
  const pending=(await approvals(c.id)).find(x=>x.state==='pending');assert.ok(pending);
  const originalRunId=first.run.id;
  await approvalDecision(c.id,pending.id,{decision:'approved',decidedBy:'tester',reason:'safe test'});
  const second=await new WorkerService({workerId:'approval-worker-2'}).tick();
  assert.equal(second.run.state,'completed');assert.equal(second.run.id,originalRunId,'approval resume created a new run instead of resuming');assert.equal(calls,1,'approved side effect should execute exactly once');
  assert.equal((await list({companyId:c.id,kind:'invocation'}))[0].state,'confirmed');
  const feedback=(await list({companyId:c.id,kind:'human_feedback'}))[0];assert.equal(feedback.data.decision,'approved');

  // Rollback is append-only: restore an old snapshot as a new revision.
  const rev1=(await get((await hydrateCompany(await get(c.id))).data.activeOrganizationRevisionId)),rev1Snapshot=structuredClone((await get((await hydrateCompany(await get(c.id))).data.activeOrganizationRevisionId)).data);
  const rev2=await synthesize(c.id);await launch(c.id,rev2.id);
  const restored=await rollback(c.id,rev1.id);
  assert.equal(restored.data.rollbackOfRevisionId,rev1.id);assert.ok(restored.data.revision>rev2.data.revision);assert.equal((await get(c.id)).data.activeOrganizationRevisionId,restored.id);
  assert.deepEqual((await get(rev1.id)).data,rev1Snapshot,'rollback mutated historical revision content');
  const eventOne=await submitEvent(c.id,{id:'event-case'},{idempotencyKey:'external-event-1'}),eventTwo=await submitEvent(c.id,{id:'event-case'},{idempotencyKey:'external-event-1'});
  assert.equal(eventTwo.event.id,eventOne.event.id);assert.equal(eventTwo.job.id,eventOne.job.id);assert.equal(eventOne.job.state,'queued');assert.equal(eventOne.job.data.organizationRevisionId,restored.id);
  await new WorkerService({workerId:'event-park'}).tick();const eventApproval=(await approvals(c.id)).find(x=>x.state==='pending');await approvalDecision(c.id,eventApproval.id,{decision:'approved'});await new WorkerService({workerId:'event-resume'}).tick();

  // Budget is enforced before external invocation.
  const b=await createCompany({name:'Budget Ops',outcome:'Stay inside budget',metrics:[{id:'ok',source:'run.status',operator:'=',target:'completed'}],constraints:{dailyBudgetUsd:1}});
  await registerProvider(b.id,{name:'Expensive API',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[{name:'expensive_read',endpoint:'/expensive',risk:'read',inputSchema:{type:'object'},outputSchema:{type:'object'},estimatedCost:{type:'fixed',usd:2}}]}});
  const bo=await synthesize(b.id);await launch(b.id,bo.id);await submitJob(b.id,{id:'budget-case'});const before=calls;const br=await new WorkerService({workerId:'budget-worker'}).tick();assert.equal(br.run.state,'failed');assert.equal(br.run.data.output,null);assert.equal(calls,before,'budget-exhausted tool invoked externally');

  console.log('approval-rollback-budget: PASS');
}finally{server.close()}
