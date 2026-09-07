import {heartbeat} from './queue.mjs';

const positive=(value,name,{min=1,max=300000}={})=>{const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw Error(`${name}_invalid`);return n};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const transientCodes=new Set(['ECONNRESET','ETIMEDOUT','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','fetch_failed']);

export function validateWorkerConfig(env=process.env){
  const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];for(const key of required)if(!env[key])throw Error(`${key}_required`);
  let url;try{url=new URL(env.SUPABASE_URL)}catch{throw Error('SUPABASE_URL_invalid')}
  if(!['http:','https:'].includes(url.protocol))throw Error('SUPABASE_URL_invalid');
  if(env.NODE_ENV==='production'&&url.protocol!=='https:')throw Error('SUPABASE_URL_https_required');
  return{workerId:env.WORKER_ID||`company-zero-${process.pid}`,leaseSeconds:positive(env.WORKER_LEASE_SECONDS||60,'WORKER_LEASE_SECONDS',{min:10,max:3600}),pollMs:positive(env.WORKER_POLL_MS||1000,'WORKER_POLL_MS',{min:50,max:60000}),maxBackoffMs:positive(env.WORKER_MAX_BACKOFF_MS||30000,'WORKER_MAX_BACKOFF_MS',{min:100,max:300000})};
}

export function isTransientWorkerError(error){return Boolean(error&&((error.status>=500&&error.status<600)||transientCodes.has(error.code)||transientCodes.has(error.cause?.code)||error instanceof TypeError||/fetch|network|timeout|temporar|storage_(read|write)|rpc_.*_failed/i.test(String(error.message))))}

export class WorkerRuntime{
  constructor({worker,config,heartbeatFn=heartbeat,sleep=wait,log=entry=>console.log(JSON.stringify(entry))}){Object.assign(this,{worker,config,heartbeatFn,sleep,log});this.stopping=false;this.activeTick=null;this.failures=0}
  requestStop(signal='manual'){this.stopping=true;this.log({level:'info',event:'worker.shutdown_requested',workerId:this.config.workerId,signal})}
  async run(){this.log({level:'info',event:'worker.started',workerId:this.config.workerId,leaseSeconds:this.config.leaseSeconds});while(!this.stopping){try{this.activeTick=this.worker.tick();const result=await this.activeTick;this.activeTick=null;this.failures=0;if(!result&&!this.stopping)await this.sleep(this.config.pollMs)}catch(error){this.activeTick=null;this.failures++;const transient=isTransientWorkerError(error),backoffMs=Math.min(this.config.maxBackoffMs,Math.max(250,2**Math.min(this.failures,10)*250));this.log({level:transient?'warn':'error',event:'worker.tick_failed',workerId:this.config.workerId,message:error.message,code:error.code||null,transient,backoffMs:transient?backoffMs:null});if(!transient)throw error;if(!this.stopping)await this.sleep(backoffMs)}}await this.activeTick;try{await this.heartbeatFn(this.config.workerId,null,{status:'stopped',stoppedAt:new Date().toISOString()})}catch(error){this.log({level:'warn',event:'worker.final_heartbeat_failed',workerId:this.config.workerId,message:error.message})}this.log({level:'info',event:'worker.stopped',workerId:this.config.workerId});return{stopped:true}}
}
