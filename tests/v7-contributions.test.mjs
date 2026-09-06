import assert from 'node:assert/strict';
import http from 'node:http';
import {normalizeCapability,normalizeProviderInput,safeUrl} from '../lib/capabilities.mjs';
import {evaluateContract} from '../lib/evaluator.mjs';
import {MUTATION_TYPES,validateMutation} from '../lib/mutations.mjs';
import {writePromotionLesson,capabilityAffinityFromLessons} from '../lib/memory.mjs';
import {registerProvider,createCompany,synthesize,launch,submitJob,executeJob,validateDiagnosis,DomainError} from '../lib/platform-v1.mjs';
import {put,list} from '../lib/store.mjs';

// Provider normalization + HTTP execution remain worker-compatible.
let calls=0;
const server=http.createServer(async(req,res)=>{calls++;const chunks=[];for await(const c of req)chunks.push(c);if(calls===1){res.writeHead(503,{'content-type':'application/json'});return res.end('{"temporary":true}')}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({decision:'approve',echo:JSON.parse(Buffer.concat(chunks).toString()||'{}')}))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
  const provider=normalizeProviderInput({name:'Normalized',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`});
  assert.equal(provider.type,'http');
  assert.throws(()=>normalizeProviderInput({name:'Bad',type:'http',baseUrl:'https://example.com',headers:{Authorization:'raw-secret'}}),/raw_secret_header_forbidden/);
  assert.throws(()=>normalizeCapability('p',{name:'Bad method',method:'TRACE'}),/capability_method_not_allowed/);
  const cap=normalizeCapability('p',{name:'Decision',endpoint:'/run',method:'POST',risk:'read',retry:{maxAttempts:2},timeoutMs:5000,inputSchema:{type:'object',required:['id']},outputSchema:{type:'object',required:['decision']},estimatedCost:{type:'fixed',usd:.01}});
  assert.equal(cap.retry.maxAttempts,2);

  const c=await createCompany({name:'Provider Test',outcome:'Use an unfamiliar remote capability',metrics:[{id:'quality',evaluator:{type:'expected_field',outputPath:'$.decision',expectedPath:'$.expectedDecision'}}],constraints:{dailyBudgetUsd:5}});
  const added=await registerProvider(c.id,{name:'Remote',type:'http',baseUrl:`http://127.0.0.1:${server.address().port}`,manifest:{capabilities:[{name:'remote_decide',endpoint:'/run',method:'POST',risk:'read',retry:{maxAttempts:2},inputSchema:{type:'object'},outputSchema:{type:'object',required:['decision']},estimatedCost:{type:'fixed',usd:.01}}]}});
  const org=await synthesize(c.id);await launch(c.id,org.id);
  const j=await submitJob(c.id,{id:'A',expectedDecision:'approve'});const run=await executeJob(c.id,j.id);
  assert.equal(run.state,'completed');assert.equal(calls,2,'transient 503 should retry exactly once');assert.equal(run.data.costUsd,.01);

  // Evaluator hardening: work and judgment remain separate.
  const verdict=evaluateContract({mission:{metrics:[{id:'q',evaluator:{type:'expected_field',outputPath:'$.decision',expectedPath:'$.expectedDecision'}}]},run:{status:'completed',output:{decision:'reject'}},job:{payload:{expectedDecision:'approve'}}});
  assert.equal(verdict.passed,false);

  // Diagnosis evidence cannot hallucinate IDs.
  const companyId=crypto.randomUUID();
  const realEval={id:crypto.randomUUID(),company_id:companyId,kind:'evaluation',state:'failed',version:1,data:{passed:false}};
  const diagnosis={id:crypto.randomUUID(),company_id:companyId,kind:'diagnosis',data:{confidence:.8,evidenceIds:[realEval.id]}};
  assert.equal(validateDiagnosis(diagnosis,[realEval]),diagnosis);
  assert.throws(()=>validateDiagnosis({...diagnosis,data:{...diagnosis.data,evidenceIds:['missing']}},[realEval]),/ungrounded_diagnosis_evidence/);

  // Full mutation vocabulary is accepted only when grounded.
  assert.ok(MUTATION_TYPES.includes('AddVerifier')&&MUTATION_TYPES.includes('ChangeTopology'));
  const d={data:{evidenceIds:['e1']}};
  assert.equal(validateMutation({type:'ChangeRouting',evidenceIds:['e1']},{diagnosis:d,capabilities:[]}).type,'ChangeRouting');
  assert.throws(()=>validateMutation({type:'ChangeRouting',evidenceIds:['fake']},{diagnosis:d,capabilities:[]}),/ungrounded_mutation/);

  // Institutional memory is created only from experiment evaluation evidence.
  const cid=crypto.randomUUID(),runId=crypto.randomUUID(),expId=crypto.randomUUID(),capId=crypto.randomUUID();
  await put({id:crypto.randomUUID(),company_id:cid,kind:'job',state:'completed',version:0,data:{experimentId:expId,runId},created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  await put({id:crypto.randomUUID(),company_id:cid,kind:'evaluation',state:'passed',version:0,data:{runId,passed:true},created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  const lesson=await writePromotionLesson({companyId:cid,experiment:{id:expId},candidate:{id:'candidate',data:{revision:2,mutation:{type:'AddVerifier',capabilityId:capId,evidenceIds:['e1']}}},result:{qualityDelta:.12,costDelta:-.01,latencyDeltaMs:-10,cases:20},decision:'promote'});
  assert.ok(lesson?.data?.evidenceIds?.length>0);
  assert.ok((capabilityAffinityFromLessons([lesson]).get(capId)||0)>0);

  // Production SSRF guard is testable without switching the store to production mode.
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production';
  assert.throws(()=>safeUrl('http://127.0.0.1:1234','/x'),/https_required|private_network_blocked/);
  process.env.NODE_ENV=old;

  console.log('v7-contributions: PASS');
}finally{server.close()}
