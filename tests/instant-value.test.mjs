import assert from 'node:assert/strict';
import {classifyInteraction} from '../lib/interaction-kernel.mjs';
import {buildInstantValue} from '../lib/instant-value.mjs';

process.env.NODE_ENV='test';
const t0=Date.now();
const q=await classifyInteraction('who is the president of Spain?');
assert.equal(q.route,'answer');
assert.equal(q.fastPath,true);
assert.ok(Date.now()-t0<500,'obvious routing must not wait on a model');
const c=await classifyInteraction('create a one-page launch brief');
assert.equal(c.route,'create');
const v=await buildInstantValue({request:'turn this rough idea into something useful'});
assert.ok(v.files.length>0);
assert.ok(v.files[0].content.length>80);
assert.equal(v.provisional,true);

const savedEnv={...process.env};
const savedFetch=globalThis.fetch;
try{
  process.env.TENSORMUX_BASE_URL='https://tensormux.test';
  process.env.TENSORMUX_API_KEY='tensor-test-key';
  process.env.TENSORMUX_PLANNER_MODEL='glm-4-7-flash';
  process.env.TENSORMUX_EXECUTION_MODEL='glm-4-7-flash';
  process.env.AGENTROUTER_BASE_URL='https://agentrouter.test';
  process.env.AGENTROUTER_API_KEY='agent-test-key';
  process.env.AGENTROUTER_SPECIALIST_MODEL='glm-5.3';
  process.env.AGENTROUTER_VERIFIER_MODEL='gpt-5.6-sol';
  process.env.ROLE_ROUTINE_TIMEOUT_MS='8000';
  process.env.ROLE_SPECIALIST_TIMEOUT_MS='8000';

  let verifierCalls=0,tensorCalls=0,mode='repair';
  globalThis.fetch=async (url,opts={})=>{
    const body=JSON.parse(String(opts.body||'{}'));
    const system=String(body?.messages?.[0]?.content||'');
    if(String(url).includes('tensormux.test')){
      tensorCalls+=1;
      if(/mission planner/i.test(system)){
        return new Response(JSON.stringify({id:'planner',choices:[{message:{content:JSON.stringify({objective:'Produce a usable launch brief',workUnits:['Draft the launch brief','Check usability'],expectedOutputs:['launch-brief.md'],requiresFreshEvidence:false,reason:'Direct artifact task'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}),{status:200,headers:{'content-type':'application/json'}});
      }
      if(mode==='roles-fail')return new Response(JSON.stringify({error:'routine executor unavailable'}),{status:503,headers:{'content-type':'application/json'}});
      const role=(body?.messages?.[1]?.content&&JSON.parse(body.messages[1].content)?.role)||'execution';
      const content=(`# Draft launch brief\n\n${role} produced concrete content for the requested launch brief. This is a proposed working draft, not an external fact. It includes a clear headline, audience, message, sections, next action, and validation note. `).repeat(3);
      return new Response(JSON.stringify({id:`role-${role}`,choices:[{message:{content:JSON.stringify({summary:`${role} completed`,findings:['usable draft'],files:[{name:`${role}.md`,mimeType:'text/markdown',content}]})}}],usage:{prompt_tokens:20,completion_tokens:30,total_tokens:50}}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(String(url).includes('agentrouter.test')){
      if(mode==='fail'||mode==='roles-fail')return new Response(JSON.stringify({error:'temporary upstream failure'}),{status:503,headers:{'content-type':'application/json'}});
      if(body.model==='glm-5.3'){
        const content=('# Repaired launch brief\n\nProposed target: reach 10 customers. This is explicitly an assumption to validate, not a measured result. The rest of the useful draft remains intact. ').repeat(3);
        return new Response(JSON.stringify({id:'repair',choices:[{message:{content:JSON.stringify({title:'Repaired launch brief',summary:'Unsupported claim relabelled as an assumption.',files:[{name:'launch-brief.md',mimeType:'text/markdown',content}]})}}],usage:{prompt_tokens:25,completion_tokens:25,total_tokens:50}}),{status:200,headers:{'content-type':'application/json'}});
      }
      verifierCalls+=1;
      const verdict=verifierCalls===1
        ?{passed:false,summary:'one unsupported claim',claims:[{id:'c1',claim:'Reach 10 customers',file:'execution.md',status:'UNSUPPORTED',reason:'not supported or labelled',support:[]}]}
        :{passed:true,summary:'all material claims are truthful',claims:[{id:'c1',claim:'Proposed target: reach 10 customers',file:'launch-brief.md',status:'ASSUMPTION',reason:'explicitly labelled',support:[]}]};
      return new Response(JSON.stringify({id:`verify-${verifierCalls}`,choices:[{message:{content:JSON.stringify(verdict)}}],usage:{prompt_tokens:15,completion_tokens:15,total_tokens:30}}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw Error(`unexpected_test_url:${url}`);
  };

  const repaired=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message, sections and a proposed customer target.'});
  assert.equal(repaired.claimVerification?.passed,true,'repaired candidate must be reverified before READY eligibility');
  assert.equal(repaired.claimVerification?.repaired,true,'one bounded repair pass should be recorded');
  assert.equal(verifierCalls,2,'repair path must verify exactly before and after the single repair');
  assert.ok(repaired.files.some(file=>file.name==='launch-brief.md'),'repair must preserve a useful artifact');

  mode='fail';verifierCalls=0;
  const partial=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message and sections.'});
  assert.equal(partial.claimVerification?.passed,false);
  assert.equal(partial.claimVerification?.failed,true);
  assert.equal(partial.degraded,true,'verifier outage must produce truthful PARTIAL state');
  assert.ok(partial.files.length>0,'verifier outage must preserve useful candidate files');
  assert.ok(!partial.files.some(file=>file.name==='venture-contract.md'),'verifier outage must not discard work into a generic venture fallback');

  mode='roles-fail';verifierCalls=0;tensorCalls=0;
  const noArtifacts=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message and sections.'});
  assert.equal(tensorCalls,3,'failed role DAG must not fall through to a fourth legacy monolithic TensorMux executor call');
  assert.equal(noArtifacts.degraded,true);
  assert.ok(noArtifacts.files.length>0,'no-artifact organization failure must still return a truthful fallback');
} finally {
  globalThis.fetch=savedFetch;
  for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];
  Object.assign(process.env,savedEnv);
}

console.log('instant-value: PASS');
