import assert from 'node:assert/strict';
import {createPageSpeedProvider,invokePageSpeedCapability} from '../lib/pagespeed.mjs';
import {createVercelDeploymentProvider,invokeVercelDeploymentCapability} from '../lib/vercel-deployment.mjs';
import {normalizeCapability} from '../lib/capabilities.mjs';

const psRaw=createPageSpeedProvider().manifest.capabilities[0],ps=normalizeCapability('ps',psRaw);
const psBody={analysisUTCTimestamp:'2026-09-08T00:00:00Z',lighthouseResult:{finalUrl:'https://example.com/',lighthouseVersion:'13',categories:{performance:{score:.91}},audits:{'largest-contentful-paint':{numericValue:2100},'total-byte-weight':{numericValue:456789}}}};
const psResult=await invokePageSpeedCapability(ps,{url:'https://example.com',phase:'baseline',strategy:'mobile'},{fetchImpl:async()=>new Response(JSON.stringify(psBody),{status:200,headers:{'content-type':'application/json'}})});
assert.equal(psResult.output.metrics.performance_score,91);assert.equal(psResult.output.metrics.lcp_ms,2100);assert.equal(psResult.output.metrics.transfer_bytes,456789);assert.equal(psResult.output.phase,'baseline');

process.env.VERCEL_TOKEN='test';process.env.VERCEL_PROJECT_ID='project-test';
const vRaw=createVercelDeploymentProvider().manifest.capabilities[0],vcap=normalizeCapability('vercel',vRaw);let calls=0;
const vResult=await invokeVercelDeploymentCapability(vcap,{gitSha:'abcdef123456',timeoutMs:30000,pollMs:1500},{fetchImpl:async()=>{calls++;return new Response(JSON.stringify({deployments:[{uid:'dpl_1',url:'demo.vercel.app',readyState:'READY',meta:{githubCommitSha:'abcdef123456'}}]}),{status:200,headers:{'content-type':'application/json'}})}});
assert.equal(vResult.output.state,'READY');assert.equal(vResult.output.deploymentId,'dpl_1');assert.equal(calls,1);
console.log('pagespeed-vercel-capabilities: PASS');
