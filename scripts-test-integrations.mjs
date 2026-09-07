import {auditRunWithTensorMux,tensormuxConfigured} from './lib/tensormux.mjs';
import {exportRunToNeatlogs,neatlogsConfigured} from './lib/neatlogs.mjs';
import {createZyteProvider,invokeZyteCapability,zyteConfigured} from './lib/zyte.mjs';
import {normalizeCapability} from './lib/capabilities.mjs';

const tensorReady=tensormuxConfigured(),neatReady=neatlogsConfigured(),zyteReady=zyteConfigured()&&Boolean(process.env.ZYTE_TEST_URL);
if(!tensorReady&&!neatReady&&!zyteReady){console.log('integrations: SKIPPED (TensorMux, Neatlogs, and Zyte test credentials/target not configured)');process.exit(0)}

const probeId=`integration-probe-${Date.now()}`;
const run={id:probeId,status:'probe',costUsd:0,latencyMs:0,output:{probe:true}};
const traces=[{state:'probe',data:{roleName:'Integration Probe',capabilityName:'authenticated_transport_probe',status:'probe',input:{probe:true},output:{probe:true},latencyMs:0,costUsd:0}}];
const evaluation={id:`eval-${probeId}`,evaluator:'integration_transport_probe',passed:null,results:[]};
let audit={configured:false,skipped:true,reason:'tensormux_not_configured'};
if(tensorReady){audit=await auditRunWithTensorMux({mission:{outcome:'Test authenticated TensorMux transport only',metrics:[]},organization:{revision:0,roles:[{name:'Probe',purpose:'Transport verification only'}]},job:{id:`job-${probeId}`,payload:{probe:true}},run,traces,evaluation});console.log(`TensorMux: ${audit.skipped?'SKIPPED':'PASS'} (authenticated endpoint responded)`) }else console.log('TensorMux: SKIPPED (credentials not configured)');
if(neatReady){const neat=await exportRunToNeatlogs({company:{id:'company-zero-integration-probe',data:{name:'Company Zero integration probe'}},mission:{outcome:'Test authenticated Neatlogs transport only',metrics:[]},organization:{revision:0},job:{id:`job-${probeId}`,payload:{probe:true}},run,traces,evaluation,modelAudit:audit});console.log(`Neatlogs: ${neat.skipped?'SKIPPED':'PASS'} (authenticated ingest accepted probe ${probeId})`)}else console.log('Neatlogs: SKIPPED (credentials not configured)');
if(zyteReady){const cap=normalizeCapability('zyte-live-probe',createZyteProvider().manifest.capabilities[0]),result=await invokeZyteCapability(cap,{url:process.env.ZYTE_TEST_URL});console.log(`Zyte: PASS (authenticated external observation returned ${result.output.responseMetadata.bytes} bytes from configured test target)`)}else console.log('Zyte: SKIPPED (ZYTE_API_KEY and ZYTE_TEST_URL not both configured)');
