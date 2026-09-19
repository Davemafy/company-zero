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

const savedEnv={...process.env},savedFetch=globalThis.fetch;
try{
  process.env.GEMINI_BASE_URL='https://gemini.test/v1beta/openai';
  process.env.GEMINI_API_KEY='gemini-test-key';
  process.env.GEMINI_PRIMARY_MODEL='gemini-3.5-flash-lite';
  process.env.OPENROUTER_BASE_URL='https://openrouter.test/api/v1';
  process.env.OPENROUTER_API_KEY='openrouter-test-key';
  process.env.OPENROUTER_FALLBACK_MODEL='openrouter/free';
  process.env.GROQ_BASE_URL='https://groq.test/openai/v1';
  process.env.GROQ_API_KEY='groq-test-key';
  process.env.GROQ_VERIFIER_MODEL='openai/gpt-oss-120b';
  process.env.GROQ_VERIFIER_FALLBACK_MODEL='openai/gpt-oss-20b';
  process.env.ROLE_ROUTINE_TIMEOUT_MS='8000';
  process.env.ROLE_SPECIALIST_TIMEOUT_MS='8000';
  process.env.ROLE_FRONTIER_TIMEOUT_MS='8000';

  let verifierCalls=0,geminiCalls=0,openrouterCalls=0,mode='repair',repairGeminiFailures=0,repairOpenrouterCalls=0;
  globalThis.fetch=async (url,opts={})=>{
    const body=JSON.parse(String(opts.body||'{}')),system=String(body?.messages?.[0]?.content||'');
    if(String(url).includes('gemini.test')){
      geminiCalls+=1;
      if(/mission planner/i.test(system)){
        return new Response(JSON.stringify({id:'planner',model:body.model,choices:[{message:{content:JSON.stringify({objective:'Produce a usable launch brief',workUnits:['Draft the launch brief','Check usability'],expectedOutputs:['launch-brief.md'],requiresFreshEvidence:false,reason:'Direct artifact task'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}),{status:200,headers:{'content-type':'application/json'}});
      }
      if(/single bounded claim repair|bounded claim repair/i.test(system)){
        if(mode==='repair-fallback'){repairGeminiFailures+=1;return new Response(JSON.stringify({error:'repair unavailable'}),{status:503,headers:{'content-type':'application/json'}})}
        const repaired=('# Repaired launch brief\n\nProposed target: reach 10 customers. This is explicitly an assumption to validate, not a measured result. The useful draft remains intact. ').repeat(3);
        return new Response(JSON.stringify({id:'gemini-repair',model:body.model,choices:[{message:{content:JSON.stringify({title:'Repaired launch brief',summary:'Unsupported claim relabelled.',files:[{name:'launch-brief.md',mimeType:'text/markdown',content:repaired}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
      }
      if(mode==='roles-fail')return new Response(JSON.stringify({error:'primary execution unavailable'}),{status:503,headers:{'content-type':'application/json'}});
      if(mode==='empty-roles')return new Response(JSON.stringify({id:'empty-role',model:body.model,choices:[{message:{content:JSON.stringify({summary:'No publishable artifact',findings:[],files:[]})}}]}),{status:200,headers:{'content-type':'application/json'}});
      const input=JSON.parse(String(body?.messages?.[1]?.content||'{}')),role=input?.role||'execution';
      const draft=(`# Draft launch brief\n\n${role} produced concrete content for the requested launch brief. Proposed working draft, not an external fact. It includes a headline, audience, message, sections, next action, and validation note. `).repeat(3);
      return new Response(JSON.stringify({id:`gemini-role-${role}`,model:body.model,choices:[{message:{content:JSON.stringify({summary:`${role} completed`,findings:['usable draft'],files:[{name:`${role}.md`,mimeType:'text/markdown',content:draft}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(String(url).includes('openrouter.test')){
      openrouterCalls+=1;
      if(/mission planner/i.test(system))return new Response(JSON.stringify({id:'fallback-planner',model:'openrouter/free',choices:[{message:{content:JSON.stringify({objective:'Fallback plan',workUnits:['Draft'],expectedOutputs:['launch-brief.md'],requiresFreshEvidence:false,reason:'fallback'})}}]}),{status:200,headers:{'content-type':'application/json'}});
      if(/single bounded claim repair|bounded claim repair/i.test(system)){
        repairOpenrouterCalls+=1;
        const repaired=('# Repaired launch brief\n\nProposed target: reach 10 customers. Explicit assumption to validate. ').repeat(4);
        return new Response(JSON.stringify({id:'openrouter-repair',model:'openrouter/free',choices:[{message:{content:JSON.stringify({title:'Repaired launch brief',summary:'Emergency fallback repair.',files:[{name:'launch-brief.md',mimeType:'text/markdown',content:repaired}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
      }
      if(mode==='roles-fail')return new Response(JSON.stringify({error:'emergency execution unavailable'}),{status:503,headers:{'content-type':'application/json'}});
      if(mode==='empty-roles')return new Response(JSON.stringify({id:'empty-fallback',model:'openrouter/free',choices:[{message:{content:JSON.stringify({summary:'Still no artifact',findings:[],files:[]})}}]}),{status:200,headers:{'content-type':'application/json'}});
      const input=JSON.parse(String(body?.messages?.[1]?.content||'{}')),role=input?.role||'execution';
      const draft=(`# Emergency draft\n\n${role} produced a proposed recovery artifact with useful content and labelled assumptions. `).repeat(4);
      return new Response(JSON.stringify({id:`fallback-${role}`,model:'openrouter/free',choices:[{message:{content:JSON.stringify({summary:'recovered',findings:['recovered'],files:[{name:`${role}-fallback.md`,mimeType:'text/markdown',content:draft}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(String(url).includes('groq.test')){
      if(mode==='fail')return new Response(JSON.stringify({error:'temporary verifier failure'}),{status:503,headers:{'content-type':'application/json'}});
      verifierCalls+=1;
      const verdict=verifierCalls===1
        ?{passed:false,summary:'one unsupported claim',claims:[{id:'c1',claim:'Reach 10 customers',file:'execution.md',status:'UNSUPPORTED',reason:'not supported or labelled',support:[]}]}
        :{passed:true,summary:'all material claims are truthful',claims:[{id:'c1',claim:'Proposed target: reach 10 customers',file:'launch-brief.md',status:'ASSUMPTION',reason:'explicitly labelled',support:[]}]};
      return new Response(JSON.stringify({id:`verify-${verifierCalls}`,model:body.model,choices:[{message:{content:JSON.stringify(verdict)}}],usage:{prompt_tokens:15,completion_tokens:15,total_tokens:30}}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw Error(`unexpected_test_url:${url}`);
  };

  const repaired=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message, sections and a proposed customer target.'});
  assert.equal(repaired.claimVerification?.passed,true);
  assert.equal(repaired.claimVerification?.repaired,true);
  assert.equal(verifierCalls,2);
  assert.ok(geminiCalls>=3,'Gemini must own planning, execution and normal repair');
  assert.ok(repaired.files.some(file=>file.name==='launch-brief.md'));

  mode='repair-fallback';verifierCalls=0;repairGeminiFailures=0;repairOpenrouterCalls=0;
  const fallbackRepaired=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message, sections and a proposed customer target.'});
  assert.equal(fallbackRepaired.claimVerification?.passed,true);
  assert.equal(fallbackRepaired.claimVerification?.repaired,true);
  assert.equal(repairGeminiFailures,1,'primary Gemini repair should be attempted once');
  assert.equal(repairOpenrouterCalls,1,'OpenRouter should be used only as emergency repair fallback');
  assert.equal(verifierCalls,2);

  mode='fail';verifierCalls=0;
  const partial=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message and sections.'});
  assert.equal(partial.claimVerification?.passed,false);
  assert.equal(partial.claimVerification?.failed,true);
  assert.equal(partial.degraded,true);
  assert.ok(partial.files.length>0);

  mode='roles-fail';verifierCalls=0;geminiCalls=0;openrouterCalls=0;
  const noArtifacts=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message and sections.'});
  assert.ok(geminiCalls>=2,'Gemini should be attempted for planner and execution');
  assert.ok(openrouterCalls>=1,'failed Gemini execution must attempt OpenRouter emergency fallback');
  assert.equal(noArtifacts.degraded,true);
  assert.ok(noArtifacts.files.length>0);

  mode='empty-roles';verifierCalls=0;geminiCalls=0;openrouterCalls=0;const emptyRoleEvents=[];
  const emptyRoles=await buildInstantValue({request:'Draft a one-page launch brief with a headline, message and sections.',onProgress:event=>emptyRoleEvents.push(event)});
  assert.equal(emptyRoles.degraded,true);
  assert.ok(emptyRoleEvents.some(event=>event.type==='ROLE_FAILED'&&event.data?.errorCode==='role_no_artifacts'));
  assert.equal(emptyRoleEvents.filter(event=>event.type==='ROLE_COMPLETED').length,0);
  assert.ok(emptyRoleEvents.some(event=>event.type==='ORGANIZATION_NO_ARTIFACTS'));
}finally{
  globalThis.fetch=savedFetch;
  for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];
  Object.assign(process.env,savedEnv);
}
console.log('instant-value: PASS');
