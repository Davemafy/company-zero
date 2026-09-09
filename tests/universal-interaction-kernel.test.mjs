import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyInteraction,answerInteraction} from '../lib/interaction-kernel.mjs';

process.env.NODE_ENV='test';

const q=await classifyInteraction('What does this error code mean?');
assert.equal(q.route,'answer');
assert.equal(q.model,null,'plain questions should not wait for a routing model call');
const c=await classifyInteraction('Create a concise launch brief for this idea');
assert.equal(c.route,'create');
const i=await classifyInteraction('Research the latest public docs for this SDK');
assert.equal(i.route,'investigate');
const o=await classifyInteraction('Increase the verified conversion rate of my deployed checkout');
assert.equal(o.route,'operate');

const oldFetch=globalThis.fetch;
const oldEnv={...process.env};
try{
  process.env.TENSORMUX_BASE_URL='https://reasoning.test/v1';
  process.env.TENSORMUX_API_KEY='test';
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({answer:'Spain has a prime minister as head of government and a king as head of state.'})}}]}),{status:200});
  const direct=await answerInteraction('Who is the president of Spain?');
  assert.match(direct.answer,/prime minister/i);
}finally{
  globalThis.fetch=oldFetch;
  for(const k of Object.keys(process.env))if(!(k in oldEnv))delete process.env[k];
  Object.assign(process.env,oldEnv);
}

const src=fs.readFileSync(new URL('../lib/interaction-kernel.mjs',import.meta.url),'utf8').toLowerCase();
for(const forbidden of ['president of spain','make dinner','software job','fashion company'])assert.equal(src.includes(forbidden),false,`production router must not special-case ${forbidden}`);
console.log('universal-interaction-kernel: PASS');
