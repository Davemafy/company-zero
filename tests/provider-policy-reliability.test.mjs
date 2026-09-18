import assert from 'node:assert/strict';

process.env.TENSORMUX_BASE_URL='https://tensor.example';
process.env.TENSORMUX_API_KEY='tensor-test';
process.env.TENSORMUX_EXECUTION_MODEL='glm-4-7-flash';
process.env.AGENTROUTER_BASE_URL='https://agentrouter.example';
process.env.AGENTROUTER_API_KEY='agent-test';
process.env.AGENTROUTER_SPECIALIST_MODEL='glm-5.3';
process.env.AGENTROUTER_FRONTIER_MODEL='claude-opus-5';
process.env.AGENTROUTER_VERIFIER_MODEL='gpt-5.6-sol';

const {routeForPolicy,providerConfigured,providerConfigSnapshot,sanitizeProviderError,completeJson}=await import('../lib/model-gateway.mjs');
const {policyForRole}=await import('../lib/role-runtime.mjs');

assert.deepEqual(routeForPolicy('routine_executor'),{policy:'routine_executor',provider:'tensormux',model:'glm-4-7-flash',strictProvider:false});
assert.deepEqual(routeForPolicy('specialist_executor'),{policy:'specialist_executor',provider:'agentrouter',model:'glm-5.3',strictProvider:true});
assert.deepEqual(routeForPolicy('verifier'),{policy:'verifier',provider:'agentrouter',model:'gpt-5.6-sol',strictProvider:true});
assert.equal(policyForRole('brand'),'routine_executor');
assert.equal(policyForRole('go_to_market'),'routine_executor');
assert.equal(policyForRole('finance'),'specialist_executor');
assert.equal(policyForRole('venture_strategy'),'specialist_executor');

delete process.env.AGENTROUTER_API_KEY;
assert.equal(providerConfigured('agentrouter'),false);
const specialist=routeForPolicy('specialist_executor');
assert.equal(specialist.provider,'agentrouter','specialist recovery must not collapse back onto TensorMux');
assert.equal(specialist.strictProvider,true);
assert.equal(routeForPolicy('verifier').provider,'agentrouter','verifier must stay independent even when unavailable');

assert.equal(sanitizeProviderError(Object.assign(new Error('bad'),{status:401}),'agentrouter'),'agentrouter_http_401');
assert.equal(sanitizeProviderError(Object.assign(new Error('rate'),{status:429}),'agentrouter'),'agentrouter_http_429');
assert.equal(sanitizeProviderError(Object.assign(new Error('down'),{status:503}),'agentrouter'),'agentrouter_http_503');
assert.equal(sanitizeProviderError(Object.assign(new Error('agentrouter_timeout'),{status:504}),'agentrouter'),'agentrouter_timeout');
assert.equal(sanitizeProviderError(new Error('agentrouter_invalid_response_shape'),'agentrouter'),'agentrouter_invalid_response_shape');

process.env.AGENTROUTER_BASE_URL='https://agentrouter.org';
process.env.AGENTROUTER_API_KEY='agent-test';
assert.equal(providerConfigSnapshot().agentrouter.base,'https://agentrouter.org','project AgentRouter host must remain on the key-issuing gateway');

const savedFetch=globalThis.fetch,calls=[];
try{
  globalThis.fetch=async (url,opts={})=>{calls.push({url:String(url),headers:opts.headers,body:JSON.parse(String(opts.body||'{}'))});return new Response(JSON.stringify({status:'ok'}),{status:200,headers:{'content-type':'application/json'}})};
  const telemetry=[];
  await assert.rejects(()=>completeJson({policy:'specialist_executor',role:'shape-test',onTelemetry:x=>telemetry.push(x),system:'Return JSON',user:'{}'}),error=>error?.message==='agentrouter_invalid_response_shape');
  assert.equal(calls[0].url,'https://agentrouter.org/v1/chat/completions');
  assert.equal(calls[0].headers?.Originator,'codex_cli_rs');
  assert.equal(calls[0].headers?.Version,'0.101.0');
  assert.match(String(calls[0].headers?.['User-Agent']||''),/^codex_cli_rs\//);
  assert.equal(calls[0].headers?.authorization,'Bearer agent-test');
  assert.equal(telemetry.at(-1)?.success,false,'HTTP 200 without model content must be a failed provider call');
}finally{globalThis.fetch=savedFetch}

console.log('provider-policy-reliability: PASS');
