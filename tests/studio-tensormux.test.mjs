import assert from 'node:assert/strict';
import {invokeStudioCapability} from '../lib/studio.mjs';

process.env.TENSORMUX_BASE_URL='https://tensormux.test/v1';
process.env.TENSORMUX_API_KEY='test-key';
process.env.TENSORMUX_MODEL='test-model';
const realFetch=globalThis.fetch;
let calls=0;
globalThis.fetch=async(_url,opts)=>{
  calls++;
  const body=JSON.parse(opts.body);const system=body.messages[0].content;
  let payload;
  if(system.includes('planning worker'))payload={brief:'Build a warm restaurant website',deliverableType:'website',goal:'Launch the restaurant online',audience:'local diners',requirements:['responsive','clear menu CTA'],acceptanceCriteria:['working website']};
  else if(system.includes('universal outcome critic'))payload={passed:true,scores:{directness:.95,usefulness:.9,completeness:.85,truthfulness:1},failures:[],unsupportedClaims:[],revisionInstructions:[]};
  else payload={title:'Nola Kitchen',summary:'Warm restaurant launch site',files:[{name:'index.html',mimeType:'text/html',content:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nola Kitchen</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Nola Kitchen</h1></main><script src="main.js"></script></body></html>'},{name:'styles.css',mimeType:'text/css',content:'body{margin:0;background:#111;color:#fff;font-family:sans-serif}'},{name:'main.js',mimeType:'text/javascript',content:'document.documentElement.dataset.ready="true";'}]};
  return new Response(JSON.stringify({id:'mock',choices:[{message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const plan=await invokeStudioCapability({internalAction:'studio.plan',inputSchema:{type:'object'},outputSchema:{type:'object'}},{task:'Build a warm restaurant website'},{mission:{outcome:'Build a restaurant website'}});
  assert.equal(plan.output.deliverableType,'website');
  const build=await invokeStudioCapability({internalAction:'studio.build',inputSchema:{type:'object'},outputSchema:{type:'object'}},plan.output,{mission:{outcome:'Build a restaurant website'}});
  assert.equal(build.output.builder,'tensormux-universal');
  assert.equal(build.output.artifact.files.length,3);
  const review=await invokeStudioCapability({internalAction:'studio.review',inputSchema:{type:'object'},outputSchema:{type:'object'}},build.output,{mission:{outcome:'Build a restaurant website'}});
  assert.equal(review.output.qa.passed,true);
  assert.equal(calls,3);
  console.log('studio tensormux path: PASS');
}finally{globalThis.fetch=realFetch}
