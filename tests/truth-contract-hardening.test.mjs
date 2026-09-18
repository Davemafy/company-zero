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

const system=fs.readFileSync(new URL('../system.js',import.meta.url),'utf8');
assert.ok(!system.includes('verified/grounded output'),'UI must not combine source receipts with verified outputs');
console.log('truth-contract-hardening: PASS');
