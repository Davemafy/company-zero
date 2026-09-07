import assert from 'node:assert/strict';

const oldEnv={...process.env};
const oldFetch=globalThis.fetch;
try{
  process.env.TENSORMUX_BASE_URL='https://tensormux.test/v1';
  process.env.TENSORMUX_API_KEY='test-key';
  process.env.TENSORMUX_MODEL='test-model';
  process.env.TENSORMUX_TIMEOUT_MS='60000';
  let seenSignal=null;
  globalThis.fetch=async (_url,opts={})=>{
    seenSignal=opts.signal;
    return new Response(JSON.stringify({id:'x',choices:[{message:{content:'{"ok":true}'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {proposeStructured}=await import(`../lib/reasoning.mjs?timeout-test=${Date.now()}`);
  const out=await proposeStructured({task:'test',instructions:'test',input:{}});
  assert.equal(out.value.ok,true);
  assert.ok(seenSignal instanceof AbortSignal);
  console.log('tensormux-timeout: PASS');
} finally {
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env)) if(!(k in oldEnv)) delete process.env[k];
  Object.assign(process.env,oldEnv);
}
