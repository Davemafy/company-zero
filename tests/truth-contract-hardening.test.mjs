import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchPublicWeb} from '../lib/public-web.mjs';
import {qualityCheck,compileExecutionPlan} from '../lib/execution-kernel.mjs';

const rss=`<?xml version="1.0"?><rss><channel>
<item><title>Automotive Competitor Vehicle Pricing Benchmark</title><link>https://example.com/automotive-pricing</link><description>Vehicle and automotive pricing analysis for car manufacturers.</description></item>
<item><title>Burger King introduces a better Whopper</title><link>https://example.com/burger</link><description>Fast food burger pricing and restaurant competition.</description></item>
</channel></rss>`;
const fakeFetch=async url=>String(url).includes('bing.com')
  ?new Response(rss,{status:200,headers:{'content-type':'application/rss+xml'}})
  :new Response('<html></html>',{status:200,headers:{'content-type':'text/html'}});
const evidence=await searchPublicWeb('car market pricing competitors',{limit:8,fetchImpl:fakeFetch,timeoutMs:500});
assert.equal(evidence.results.length,1,'irrelevant Burger King result must not survive automotive relevance gate');
assert.match(evidence.results[0].title,/Automotive/i);
assert.ok(evidence.results[0].relevanceScore>0);

const plan=compileExecutionPlan('make a car company');
const incomplete={files:[{name:'venture.md',content:('# Proposed venture\nCustomer positioning launch validation offer. ').repeat(8)}],roleTelemetrySummary:{expectedRoles:4,completedRoles:1}};
const qa=qualityCheck(incomplete,plan);
assert.equal(qa.ok,false);
assert.equal(qa.structuralFailure,true);
assert.ok(qa.reasons.includes('organization_incomplete:1/4'));

const oldEnv={...process.env},oldFetch=globalThis.fetch;
try{
  process.env.GROQ_BASE_URL='https://groq.test/openai/v1';
  process.env.GROQ_API_KEY='groq-test';
  process.env.GROQ_VERIFIER_MODEL='openai/gpt-oss-120b';
  globalThis.fetch=async (_url,opts={})=>{
    const body=JSON.parse(String(opts.body||'{}'));
    return new Response(JSON.stringify({id:'verify',model:body.model,choices:[{message:{content:JSON.stringify({passed:true,summary:'looks supported',claims:[{id:'c1',claim:'Tooling costs $2.0M',file:'costs.md',status:'SUPPORTED',reason:'the artifact says so',support:['Tooling costs $2.0M']}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {verifyArtifactClaims}=await import(`../lib/claim-verifier.mjs?truth-hardening=${Date.now()}`);
  const verdict=await verifyArtifactClaims({request:'make a car company',plan,result:{files:[{name:'costs.md',mimeType:'text/markdown',content:'Tooling costs $2.0M'}]},publicEvidence:null});
  assert.equal(verdict.passed,false,'candidate text must never verify itself');
  assert.equal(verdict.rejected.length,1);
  assert.match(verdict.rejected[0].reason,/no supplied external receipt/i);
}finally{
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];
  Object.assign(process.env,oldEnv);
}

const labelEnv={...process.env},labelFetch=globalThis.fetch;
try{
  process.env.GROQ_BASE_URL='https://groq-label.test/openai/v1';
  process.env.GROQ_API_KEY='groq-label';
  process.env.GROQ_VERIFIER_MODEL='openai/gpt-oss-120b';
  globalThis.fetch=async (_url,opts={})=>{
    const body=JSON.parse(String(opts.body||'{}'));
    return new Response(JSON.stringify({id:'verify-label',model:body.model,choices:[{message:{content:JSON.stringify({passed:true,summary:'labelled assumption',claims:[{id:'c2',claim:'Average selling price is $35,000',file:'plan.json',status:'ASSUMPTION',reason:'listed in assumptions',support:[]}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {verifyArtifactClaims}=await import(`../lib/claim-verifier.mjs?plural-label=${Date.now()}`);
  const verdict=await verifyArtifactClaims({request:'make a car company',plan,result:{files:[{name:'plan.json',mimeType:'application/json',content:'{"assumptions":["Average selling price is $35,000"]}'}]},publicEvidence:null});
  assert.equal(verdict.passed,true,'plural assumptions key must count as an explicit local label');
}finally{
  globalThis.fetch=labelFetch;
  for(const k of Object.keys(process.env))if(!(k in labelEnv))delete process.env[k];
  Object.assign(process.env,labelEnv);
}

const disagreementEnv={...process.env},disagreementFetch=globalThis.fetch;
try{
  process.env.GROQ_BASE_URL='https://groq-disagreement.test/openai/v1';
  process.env.GROQ_API_KEY='groq-disagreement';
  process.env.GROQ_VERIFIER_MODEL='openai/gpt-oss-120b';
  globalThis.fetch=async (_url,opts={})=>{
    const body=JSON.parse(String(opts.body||'{}'));
    return new Response(JSON.stringify({id:'verify-disagreement',model:body.model,choices:[{message:{content:JSON.stringify({
      passed:false,
      summary:'model incorrectly rejected explicit planning labels',
      claims:[
        {id:'p1',claim:'Company Name: Apex Micro-Mobility',file:'venture.md',status:'UNSUPPORTED',reason:'No external evidence and not labeled as assumption',support:[]},
        {id:'p2',claim:'Vehicle Base Price: $15,000',file:'venture.md',status:'UNSUPPORTED',reason:'No external evidence and not labeled as assumption',support:[]},
        {id:'p3',claim:'Seed Capital Requirement: $5,000,000',file:'venture.md',status:'UNSUPPORTED',reason:'No external evidence and not labeled as assumption',support:[]}
      ]
    })}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {verifyArtifactClaims}=await import(`../lib/claim-verifier.mjs?deterministic-labels=${Date.now()}`);
  const content='# Venture\n- **Company Name:** Apex Micro-Mobility (Proposed)\n- **Vehicle Base Price:** $15,000 (Target)\n- **Seed Capital Requirement:** $5,000,000 (Estimate)';
  const verdict=await verifyArtifactClaims({request:'make a car company',plan,result:{files:[{name:'venture.md',mimeType:'text/markdown',content}]},publicEvidence:null});
  assert.equal(verdict.passed,true,'explicit local planning labels must override a verifier misclassification');
  assert.equal(verdict.rejected.length,0);
  assert.deepEqual(verdict.claims.map(x=>x.status),['ASSUMPTION','ASSUMPTION','ASSUMPTION']);
}finally{
  globalThis.fetch=disagreementFetch;
  for(const k of Object.keys(process.env))if(!(k in disagreementEnv))delete process.env[k];
  Object.assign(process.env,disagreementEnv);
}

const retryEnv={...process.env},retryFetch=globalThis.fetch;
try{
  process.env.GROQ_BASE_URL='https://groq-retry.test/openai/v1';
  process.env.GROQ_API_KEY='groq-retry';
  process.env.GROQ_VERIFIER_MODEL='openai/gpt-oss-120b';
  process.env.GROQ_VERIFIER_FALLBACK_MODEL='openai/gpt-oss-20b';
  const seen=[];
  globalThis.fetch=async (_url,opts={})=>{
    const body=JSON.parse(String(opts.body||'{}'));seen.push(body);
    if(body.model==='openai/gpt-oss-120b')return new Response(JSON.stringify({error:{message:'generated JSON failed'}}),{status:400,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({id:'verify-fallback',model:body.model,choices:[{message:{content:JSON.stringify({passed:true,summary:'strict fallback ok',claims:[{id:'r1',claim:'Vehicle Base Price: $15,000',file:'venture.md',status:'ASSUMPTION',reason:'explicit target',support:[]}]})}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {verifyArtifactClaims}=await import(`../lib/claim-verifier.mjs?groq-strict-retry=${Date.now()}`);
  const verdict=await verifyArtifactClaims({request:'make a car company',plan,result:{files:[{name:'venture.md',mimeType:'text/markdown',content:'- **Vehicle Base Price:** $15,000 (Target)'}]},publicEvidence:null});
  assert.equal(verdict.passed,true,'Groq 120b 400 must retry strict verification on independent Groq fallback model');
  assert.deepEqual(seen.map(x=>x.model),['openai/gpt-oss-120b','openai/gpt-oss-20b']);
  assert.ok(seen.every(x=>x.response_format?.type==='json_schema'&&x.response_format?.json_schema?.strict===true));
}finally{
  globalThis.fetch=retryFetch;
  for(const k of Object.keys(process.env))if(!(k in retryEnv))delete process.env[k];
  Object.assign(process.env,retryEnv);
}

const system=fs.readFileSync(new URL('../system.js',import.meta.url),'utf8');
assert.ok(!system.includes('verified/grounded output'),'UI must not combine source receipts with verified outputs');
console.log('truth-contract-hardening: PASS');
