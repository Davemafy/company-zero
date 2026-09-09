import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyInteraction} from '../lib/interaction-kernel.mjs';

process.env.NODE_ENV='test';

const q=await classifyInteraction('What does this error code mean?');
assert.equal(q.route,'answer');
const c=await classifyInteraction('Create a concise launch brief for this idea');
assert.equal(c.route,'create');
const i=await classifyInteraction('Research the latest public docs for this SDK');
assert.equal(i.route,'investigate');
const o=await classifyInteraction('Increase the verified conversion rate of my deployed checkout');
assert.equal(o.route,'operate');

const src=fs.readFileSync(new URL('../lib/interaction-kernel.mjs',import.meta.url),'utf8').toLowerCase();
for(const forbidden of ['president of spain','make dinner','software job','fashion company'])assert.equal(src.includes(forbidden),false,`production router must not special-case ${forbidden}`);
console.log('universal-interaction-kernel: PASS');
