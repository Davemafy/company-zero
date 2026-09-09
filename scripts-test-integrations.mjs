import {auditRunWithTensorMux,tensormuxConfigured} from './lib/tensormux.mjs';
import {exportRunToNeatlogs,neatlogsConfigured} from './lib/neatlogs.mjs';
import {createZyteProvider,invokeZyteCapability,zyteConfigured} from './lib/zyte.mjs';
import {normalizeCapability} from './lib/capabilities.mjs';
import {createPageSpeedProvider,invokePageSpeedCapability,pageSpeedConfigured} from './lib/pagespeed.mjs';
import {createVercelDeploymentProvider,invokeVercelDeploymentCapability,vercelDeploymentConfigured} from './lib/vercel-deployment.mjs';

const tensorReady=tensormuxConfigured(),neatReady=neatlogsConfigured(),zyteReady=zyteConfigured()&&Boolean(process.env.ZYTE_TEST_URL),pageSpeedReady=pageSpeedConfigured()&&Boolean(process.env.PAGESPEED_TEST_URL),vercelReady=vercelDeploymentConfigured()&&Boolean(process.env.VERCEL_TEST_GIT_SHA);
if(!tensorReady&&!neatReady&&!zyteReady&&!pageSpeedReady&&!vercelReady){console.log('integrations: SKIPPED (TensorMux, Neatlogs, Zyte, PageSpeed, and Vercel test credentials/targets not configured)');process.exit(0)}

const probeId=`integration-probe-${Date.now()}`;
const run={id:probeId,status:'probe',costUsd:0,latencyMs:0,output:{probe:true}};
const traces=[{state:'probe',data:{roleName:'Integration Probe',capabilityName:'authenticated_transport_probe',status:'probe',input:{probe:true},output:{probe:true},latencyMs:0,costUsd:0}}];
const evaluation={id:`eval-${probeId}`,evaluator:'integration_transport_probe',passed:null,results:[]};
let audit={configured:false,skipped:true,reason:'tensormux_not_configured'};
if(tensorReady){audit=await auditRunWithTensorMux({mission:{outcome:'Test authenticated TensorMux transport only',metrics:[]},organization:{revision:0,roles:[{name:'Probe',purpose:'Transport verification only'}]},job:{id:`job-${probeId}`,payload:{probe:true}},run,traces,evaluation});console.log(`TensorMux: ${audit.skipped?'SKIPPED':'PASS'} (authenticated endpoint responded)`) }else console.log('TensorMux: SKIPPED (credentials not configured)');
if(neatReady){const neat=await exportRunToNeatlogs({company:{id:'company-zero-integration-probe',data:{name:'Company Zero integration probe'}},mission:{outcome:'Test authenticated Neatlogs transport only',metrics:[]},organization:{revision:0},job:{id:`job-${probeId}`,payload:{probe:true}},run,traces,evaluation,modelAudit:audit});console.log(`Neatlogs: ${neat.skipped?'SKIPPED':'PASS'} (authenticated ingest accepted probe ${probeId})`)}else console.log('Neatlogs: SKIPPED (credentials not configured)');
if(zyteReady){const cap=normalizeCapability('zyte-live-probe',createZyteProvider().manifest.capabilities[0]),result=await invokeZyteCapability(cap,{url:process.env.ZYTE_TEST_URL});console.log(`Zyte: PASS (authenticated external observation returned ${result.output.responseMetadata.bytes} bytes from configured test target)`)}else console.log('Zyte: SKIPPED (ZYTE_API_KEY and ZYTE_TEST_URL not both configured)');

if(pageSpeedReady){const cap=normalizeCapability('pagespeed-live-probe',createPageSpeedProvider().manifest.capabilities[0]),result=await invokePageSpeedCapability(cap,{url:process.env.PAGESPEED_TEST_URL,phase:'observation',strategy:process.env.PAGESPEED_TEST_STRATEGY||'mobile'});console.log(`PageSpeed: PASS (performance ${result.output.metrics.performance_score}, LCP ${Math.round(result.output.metrics.lcp_ms)}ms)`) }else console.log('PageSpeed: SKIPPED (PAGESPEED_ENABLED and PAGESPEED_TEST_URL not both configured)');
if(vercelReady){const cap=normalizeCapability('vercel-live-probe',createVercelDeploymentProvider().manifest.capabilities[0]),result=await invokeVercelDeploymentCapability(cap,{gitSha:process.env.VERCEL_TEST_GIT_SHA,timeoutMs:60000,pollMs:3000});console.log(`Vercel: PASS (deployment ${result.output.deploymentId} is ${result.output.state})`)}else console.log('Vercel: SKIPPED (VERCEL credentials/project and VERCEL_TEST_GIT_SHA not configured)');
