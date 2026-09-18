import assert from 'node:assert/strict';

const oldEnv={...process.env};
const oldFetch=globalThis.fetch;
try{
  process.env.TENSORMUX_BASE_URL='https://tensormux.test/v1';
  process.env.TENSORMUX_API_KEY='test-key';
  process.env.TENSORMUX_MODEL='test-model';
  process.env.TENSORMUX_TIMEOUT_MS='60000';
  process.env.OPENROUTER_API_KEY='openrouter-test';
  process.env.GEMINI_API_KEY='gemini-test';
  process.env.GROQ_API_KEY='groq-test';
  let seenSignal=null;
  globalThis.fetch=async (_url,opts={})=>{
    seenSignal=opts.signal;
    const body=JSON.parse(String(opts.body||'{}'));
    return new Response(JSON.stringify({id:'x',model:body.model,choices:[{message:{content:'{"ok":true}'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {proposeStructured}=await import(`../lib/reasoning.mjs?timeout-test=${Date.now()}`);
  const out=await proposeStructured({task:'test',instructions:'test',input:{}});
  assert.equal(out.value.ok,true);
  assert.ok(seenSignal instanceof AbortSignal);
  const gateway=await import(`../lib/model-gateway.mjs?provider-test=${Date.now()}`);
  assert.equal(gateway.routeForPolicy('specialist_executor').provider,'openrouter');
  assert.equal(gateway.routeForPolicy('frontier_escalation').provider,'gemini');
  assert.equal(gateway.routeForPolicy('verifier').provider,'groq');
  assert.equal(gateway.routeForPolicy('verifier').model,'openai/gpt-oss-120b');
  assert.equal(gateway.sanitizeProviderError(Object.assign(Error('rate limited'),{status:429,provider:'openrouter'})),'openrouter_http_429');
  assert.equal(gateway.sanitizeProviderError(Object.assign(Error('bad model'),{status:404,provider:'gemini',details:{error:'model not found'}})),'gemini_model_unavailable');
  console.log('tensormux-timeout: PASS');
}finally{
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];
  Object.assign(process.env,oldEnv);
}
