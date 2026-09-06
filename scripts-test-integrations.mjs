import {auditRunWithTensorMux} from './lib/tensormux.mjs';
import {exportRunToNeatlogs} from './lib/neatlogs.mjs';

const run={id:`probe-${Date.now()}`,status:'completed',costUsd:0,latencyMs:1,output:{ok:true}};
const traces=[{state:'completed',data:{roleName:'Integration Probe',capabilityName:'probe',status:'completed',input:{ping:true},output:{pong:true},latencyMs:1,costUsd:0}}];
const evaluation={id:`eval-${Date.now()}`,evaluator:'integration_probe',passed:true,results:[]};
const audit=await auditRunWithTensorMux({mission:{outcome:'Verify Company Zero live integrations',metrics:[]},organization:{revision:1,roles:[{name:'Probe',purpose:'Verify integration'}]},job:{id:`job-${Date.now()}`,payload:{ping:true}},run,traces,evaluation});
console.log('TensorMux:',JSON.stringify(audit,null,2));
const neat=await exportRunToNeatlogs({company:{id:'company-zero-integration-probe',data:{name:'Company Zero'}},mission:{outcome:'Verify live integrations',metrics:[]},organization:{revision:1},job:{id:`job-${Date.now()}`,payload:{ping:true}},run,traces,evaluation,modelAudit:audit});
console.log('Neatlogs:',JSON.stringify(neat,null,2));
