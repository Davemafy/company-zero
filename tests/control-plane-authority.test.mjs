import assert from 'node:assert/strict';
import http from 'node:http';
import {reserveBudget,settleBudget,promoteCandidateAtomic} from '../lib/control-plane.mjs';
import {put,list} from '../lib/store.mjs';
import {createCompany,registerProvider,synthesize,launch,submitJob,approvalDecision,approvals} from '../lib/platform-v1.mjs';
import {WorkerService} from '../lib/worker-service.mjs';

const budgetCompany=crypto.randomUUID();
const reservations=await Promise.allSettled([
  reserveBudget({companyId:budgetCompany,sourceRef:'a',amountUsd:.75,limitUsd:1}),
  reserveBudget({companyId:budgetCompany,sourceRef:'b',amountUsd:.75,limitUsd:1})
]);
assert.equal(reservations.filter(x=>x.status==='fulfilled').length,1,'concurrent reservations overspent the limit');
const reserved=reservations.find(x=>x.status==='fulfilled').value;await settleBudget(reserved,'released');
assert.ok(await reserveBudget({companyId:budgetCompany,sourceRef:'capacity-restored',amountUsd:.75,limitUsd:1}));
await new Promise(resolve=>setImmediate(resolve));assert.equal(globalThis.__CZ_CONTROL_PLANE__.locks.size,0,'completed development-memory locks leaked');

const companyId=crypto.randomUUID(),baseId=crypto.randomUUID(),candidateIds=[crypto.randomUUID(),crypto.randomUUID()],experimentId=crypto.randomUUID(),stamp=new Date().toISOString();
const row=(id,kind,state,data)=>({id,company_id:companyId,kind,state,version:0,data,created_at:stamp,updated_at:stamp});
await put(row(companyId,'company','active',{activeOrganizationRevisionId:baseId,status:'active'}));
await put(row(baseId,'organization_revision','production',{revision:1,status:'production'}));
for(let i=0;i<candidateIds.length;i++)await put(row(candidateIds[i],'candidate_revision','candidate',{revision:i+2,status:'candidate',mutation:{type:'ChangeRouting'}}));
await put(row(experimentId,'experiment','awaiting_decision',{baselineRevisionId:baseId,candidateRevisionIds:candidateIds,sourceJobIds:['source'],status:'awaiting_decision',results:candidateIds.map(candidateRevisionId=>({candidateRevisionId,cases:3,minCases:3,qualityDelta:.1,costDelta:-.01,uncertainCases:0,policyStatus:'PASS',constitutionPassed:true}))}));
const promotions=await Promise.allSettled(candidateIds.map(candidateId=>promoteCandidateAtomic({companyId,experimentId,candidateId})));
assert.equal(promotions.filter(x=>x.status==='fulfilled').length,1,'concurrent promotions produced more than one winner');
assert.equal((await list({companyId,kind:'lesson'})).length,1,'atomic promotion did not persist exactly one lesson');

let calls=0;
const server=http.createServer(async(req)=>{calls++;for await(const _ of req){}req.socket.destroy()});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const company=await createCompany({name:'Uncertainty',outcome:'Do not replay an ambiguous write',metrics:[{id:'ok',source:'run.status',operator:'=',target:'completed'}],constraints:{dailyBudgetUsd:5}});
  await registerProvider(company.id,{name:'Unreliable write',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[{name:'write_once',endpoint:'/write',risk:'external_side_effect',inputSchema:{type:'object'},outputSchema:{type:'object'},estimatedCost:{type:'fixed',usd:.1},retry:{maxAttempts:4}}]}});
  const org=await synthesize(company.id);await launch(company.id,org.id);await submitJob(company.id,{id:'uncertain'});
  await new WorkerService({workerId:'uncertain-park'}).tick();const approval=(await approvals(company.id))[0];await approvalDecision(company.id,approval.id,{decision:'approved'});
  const result=await new WorkerService({workerId:'uncertain-dispatch'}).tick();
  assert.equal(result.run.state,'uncertain');assert.equal(result.queue.state,'uncertain');assert.equal(calls,1,'ambiguous write was blindly retried');
  assert.equal((await list({companyId:company.id,kind:'invocation'}))[0].state,'uncertain');
}finally{server.close()}
console.log('control-plane-authority: PASS');
