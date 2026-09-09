import assert from 'node:assert/strict';
import {invokeStudioCapability} from '../lib/studio.mjs';
import fs from 'node:fs/promises';

process.env.TENSORMUX_BASE_URL='https://tensormux.test/v1';
process.env.TENSORMUX_API_KEY='test-key';
process.env.TENSORMUX_MODEL='test-model';
process.env.STUDIO_MAX_REVISIONS='2';

const request='turn this rough idea into something useful before lunch';
const cap=action=>({internalAction:action,inputSchema:{type:'object',additionalProperties:true},outputSchema:{type:'object'}});
const realFetch=globalThis.fetch;
let criticCalls=0,revisionCalls=0;
globalThis.fetch=async(_url,opts)=>{
  const body=JSON.parse(opts.body); const system=body.messages[0].content; const user=JSON.parse(body.messages[1].content);
  let payload;
  if(system.includes('universal Work Compiler')) payload={desiredOutcome:'A concrete usable first version',assumptionsPolicy:'infer_low_risk_reversible_then_act',questionPolicy:'ask_only_at_blocking_or_authority_boundary',successDefinition:'Give the user something concrete they can use before lunch.',acceptanceCriteria:['Concrete','Immediately useful','Truthful'],deliverables:[{key:'primary',title:'Usable V1',kind:'product',purpose:user.request,dependsOn:[],authority:'none',acceptanceCriteria:['Concrete','Useful'],suggestedFiles:['v1.md']}],externalBoundaries:[]};
  else if(system.includes('universal production worker')) payload={title:'Weak V1',summary:'Too vague',files:[{name:'v1.md',mimeType:'text/markdown',content:'# V1\n\nHere are some broad ideas you could consider later. This is intentionally vague and not yet actionable.'}]};
  else if(system.includes('universal outcome critic')){
    criticCalls++;
    payload=criticCalls===1?{passed:false,scores:{directness:.45,usefulness:.3,completeness:.5,truthfulness:1},failures:['The artifact is a meta-plan rather than a usable result.'],unsupportedClaims:[],revisionInstructions:['Replace vague advice with an immediately usable first version.']}:{passed:true,scores:{directness:.94,usefulness:.91,completeness:.82,truthfulness:1},failures:[],unsupportedClaims:[],revisionInstructions:[]};
  }else if(system.includes('universal revision worker')){
    revisionCalls++;
    assert.equal(user.request,request);
    assert.ok(user.review.revisionInstructions.length>0);
    payload={title:'Useful V1',summary:'Concrete revision',files:[{name:'v1.md',mimeType:'text/markdown',content:'# Usable first version\n\n## Assumption\nKeep scope small and reversible.\n\n## Ready-to-use result\nA concise one-page version with a clear objective, three concrete actions, an owner for each action, and a 30-minute execution order.\n\n## Boundary\nNo external action is claimed.'}]};
  } else throw new Error(`unexpected model task: ${system.slice(0,100)}`);
  return new Response(JSON.stringify({id:'mock',model:'test-model',choices:[{message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:20,completion_tokens:40,total_tokens:60}}),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const planned=await invokeStudioCapability(cap('studio.plan'),{brief:request},{mission:{outcome:request}});
  const built=await invokeStudioCapability(cap('studio.build'),planned.output,{mission:{outcome:request}});
  const reviewed=await invokeStudioCapability(cap('studio.review'),built.output,{mission:{outcome:request}});
  assert.equal(reviewed.output.qa.passed,true);
  assert.equal(reviewed.output.qa.semanticVerified,true);
  assert.equal(reviewed.output.qa.revisions.length,1);
  assert.equal(revisionCalls,1);
  assert.equal(criticCalls,2);
  assert.match(reviewed.output.artifact.files[0].content,/Ready-to-use result/);
  const source=await fs.readFile(new URL('../lib/work-compiler.mjs',import.meta.url),'utf8');
  assert.equal(source.toLowerCase().includes(request.toLowerCase()),false);
  console.log('universal-revision-loop: PASS');
}finally{globalThis.fetch=realFetch}
