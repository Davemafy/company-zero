import assert from 'node:assert/strict';

process.env.TENSORMUX_BASE_URL='https://tensor.example';
process.env.TENSORMUX_API_KEY='tensor-test';
process.env.TENSORMUX_EXECUTION_MODEL='glm-4-7-flash';
process.env.AGENTROUTER_BASE_URL='https://agentrouter.example';
process.env.AGENTROUTER_API_KEY='agent-test';
process.env.AGENTROUTER_SPECIALIST_MODEL='glm-5.3';
process.env.AGENTROUTER_FRONTIER_MODEL='claude-opus-5';
process.env.AGENTROUTER_VERIFIER_MODEL='gpt-5.6-sol';

const {routeForPolicy,providerConfigured,sanitizeProviderError}=await import('../lib/model-gateway.mjs');
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

console.log('provider-policy-reliability: PASS');
