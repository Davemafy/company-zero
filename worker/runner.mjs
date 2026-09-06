import {WorkerService} from '../lib/worker-service.mjs';
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!process.env[key])throw Error(`${key}_required`);
const worker=new WorkerService({workerId:process.env.WORKER_ID||`company-zero-${process.pid}`,leaseSeconds:Number(process.env.WORKER_LEASE_SECONDS||60)});let stopping=false;process.on('SIGTERM',()=>stopping=true);process.on('SIGINT',()=>stopping=true);
while(!stopping){const result=await worker.tick();if(!result)await new Promise(r=>setTimeout(r,Number(process.env.WORKER_POLL_MS||1000)))}
