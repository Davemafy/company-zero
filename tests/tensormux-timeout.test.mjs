import assert from 'node:assert/strict';

const oldEnv={...process.env};
const oldFetch=globalThis.fetch;
try{
  process.env.TENSORMUX_BASE_URL='https://tensormux.test/v1';
  process.env.TENSORMUX_API_KEY='test-key';
  process.env.TENSORMUX_MODEL='test-model';
  process.env.TENSORMUX_TIMEOUT_MS='60000';
  process.env.AI_GATEWAY_API_KEY='gateway-test';
  process.env.AI_GATEWAY_SPECIALIST_MODEL='anthropic/claude-sonnet-4.6';
  process.env.AI_GATEWAY_VERIFIER_MODEL='openai/gpt-5.6-sol';
  let seenSignal=null;
  globalThis.fetch=async (_url,opts={})=>{
    seenSignal=opts.signal;
    return new Response(JSON.stringify({id:'x',choices:[{message:{content:'{"ok":true}'}}]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const {proposeStructured}=await import(`../lib/reasoning.mjs?timeout-test=${Date.now()}`);
  const out=await proposeStructured({task:'test',instructions:'test',input:{}});
  assert.equal(out.value.ok,true);
  assert.ok(seenSignal instanceof AbortSignal);
  const gateway=await import(`../lib/model-gateway.mjs?provider-test=${Date.now()}`);
  assert.equal(gateway.routeForPolicy('specialist_executor').provider,'vercel_gateway');
  assert.equal(gateway.routeForPolicy('specialist_executor').strictProvider,true);
  assert.equal(gateway.routeForPolicy('verifier').model,'openai/gpt-5.6-sol');
  assert.equal(gateway.sanitizeProviderError(Object.assign(Error('rate limited'),{status:429,provider:'vercel_gateway'})),'vercel_gateway_http_429');
  assert.equal(gateway.sanitizeProviderError(Object.assign(Error('bad model'),{status:404,provider:'vercel_gateway',details:{error:'model not found'}})),'vercel_gateway_model_unavailable');
  console.log('tensormux-timeout: PASS');
} finally {
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env)) if(!(k in oldEnv)) delete process.env[k];
  Object.assign(process.env,oldEnv);
}
