import assert from 'node:assert/strict';
import {classifyInteraction} from '../lib/interaction-kernel.mjs';
import {buildInstantValue} from '../lib/instant-value.mjs';

process.env.NODE_ENV='test';
const t0=Date.now();
const q=await classifyInteraction('who is the president of Spain?');
assert.equal(q.route,'answer');
assert.equal(q.fastPath,true);
assert.ok(Date.now()-t0<500,'obvious routing must not wait on a model');
const c=await classifyInteraction('create a one-page launch brief');
assert.equal(c.route,'create');
const v=await buildInstantValue({request:'turn this rough idea into something useful'});
assert.ok(v.files.length>0);
assert.ok(v.files[0].content.length>80);
assert.equal(v.provisional,true);
console.log('instant-value: PASS');
