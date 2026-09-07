import {WorkerService} from '../lib/worker-service.mjs';
import {WorkerRuntime,validateWorkerConfig} from '../lib/worker-runtime.mjs';

const config=validateWorkerConfig();
const worker=new WorkerService({workerId:config.workerId,leaseSeconds:config.leaseSeconds});
const runtime=new WorkerRuntime({worker,config});
process.once('SIGTERM',()=>runtime.requestStop('SIGTERM'));
process.once('SIGINT',()=>runtime.requestStop('SIGINT'));
try{await runtime.run()}catch(error){console.error(JSON.stringify({level:'fatal',event:'worker.exited',workerId:config.workerId,message:error.message,code:error.code||null}));process.exitCode=1}
