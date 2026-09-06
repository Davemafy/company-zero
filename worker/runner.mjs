import {WorkerService} from '../lib/worker-service.mjs';
const worker=new WorkerService({workerId:process.env.WORKER_ID||'company-zero-worker',leaseSeconds:Number(process.env.WORKER_LEASE_SECONDS||60)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pollMs=Math.max(250,Number(process.env.WORKER_POLL_MS||1000));
let failures=0;
for(;;){
  try{await worker.tick();failures=0;await sleep(pollMs)}
  catch(error){failures++;const delay=Math.min(30000,1000*(2**Math.min(failures,5)));console.error('[worker] tick failed:',error?.stack||error?.message||error);await sleep(delay)}
}
