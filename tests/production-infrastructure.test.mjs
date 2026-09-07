import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WorkerRuntime,validateWorkerConfig,isTransientWorkerError} from '../lib/worker-runtime.mjs';
import {compileGoal} from '../lib/universal.mjs';

assert.throws(()=>validateWorkerConfig({}),/SUPABASE_URL_required/);
assert.throws(()=>validateWorkerConfig({SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'x',WORKER_LEASE_SECONDS:'2'}),/WORKER_LEASE_SECONDS_invalid/);
const config=validateWorkerConfig({SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'x',WORKER_ID:'test-worker',WORKER_LEASE_SECONDS:'30',WORKER_POLL_MS:'50',WORKER_MAX_BACKOFF_MS:'1000'});assert.equal(config.workerId,'test-worker');assert.equal(config.leaseSeconds,30);
assert.equal(isTransientWorkerError(new TypeError('fetch failed')),true);assert.equal(isTransientWorkerError(Error('invalid schema')),false);
assert.match(await readFile(new URL('../Procfile',import.meta.url),'utf8'),/^worker: npm run worker:production/m);
const oldNodeEnv=process.env.NODE_ENV,oldTensorUrl=process.env.TENSORMUX_BASE_URL,oldTensorKey=process.env.TENSORMUX_API_KEY;process.env.NODE_ENV='production';delete process.env.TENSORMUX_BASE_URL;delete process.env.TENSORMUX_API_KEY;await assert.rejects(()=>compileGoal('Reach a measurable target'),/tensormux_required_for_goal_compilation/);process.env.TENSORMUX_BASE_URL='http://127.0.0.1:1';process.env.TENSORMUX_API_KEY='configured-but-unreachable';await assert.rejects(()=>compileGoal('Reach a measurable target'),/tensormux_goal_compilation_failed/);process.env.NODE_ENV=oldNodeEnv;if(oldTensorUrl===undefined)delete process.env.TENSORMUX_BASE_URL;else process.env.TENSORMUX_BASE_URL=oldTensorUrl;if(oldTensorKey===undefined)delete process.env.TENSORMUX_API_KEY;else process.env.TENSORMUX_API_KEY=oldTensorKey;

let attempts=0,runtime;const waits=[];runtime=new WorkerRuntime({config,worker:{async tick(){attempts++;if(attempts===1)throw new TypeError('fetch failed');runtime.requestStop('test');return null}},sleep:async ms=>waits.push(ms),heartbeatFn:async()=>{},log:()=>{}});const result=await runtime.run();assert.equal(result.stopped,true);assert.equal(attempts,2);assert.ok(waits[0]>=250,'transient error did not back off');

let release;const active=new Promise(resolve=>release=resolve),events=[];const graceful=new WorkerRuntime({config,worker:{tick:()=>active},heartbeatFn:async()=>{},sleep:async()=>{},log:x=>events.push(x)});const running=graceful.run();await new Promise(resolve=>setImmediate(resolve));graceful.requestStop('SIGTERM');let stopped=false;running.then(()=>stopped=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,false,'worker stopped before active lease-safe tick completed');release(null);await running;assert.equal(stopped,true);assert.ok(events.some(x=>x.event==='worker.shutdown_requested'));

console.log('production-infrastructure: PASS');
