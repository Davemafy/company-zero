import assert from 'node:assert/strict';
import {invokeStudioCapability} from '../lib/studio.mjs';

const prompts=[
  'Make a car company',
  'Build me a portfolio website',
  'Get me clients',
  'Research Nigerian fintech',
  'Launch my app'
];
for(const outcome of prompts){
  const plan=await invokeStudioCapability({internalAction:'studio.plan',inputSchema:{type:'object',additionalProperties:true},outputSchema:{type:'object'}},{brief:outcome},{mission:{outcome}});
  assert.ok(plan.output?.deliverableType);assert.ok(plan.output?.brief);
  const built=await invokeStudioCapability({internalAction:'studio.build',inputSchema:{type:'object',additionalProperties:true},outputSchema:{type:'object'}},plan.output,{mission:{outcome}});
  assert.ok(Array.isArray(built.output?.artifact?.files)&&built.output.artifact.files.length>0,`${outcome}: no files`);
  assert.ok(built.output.artifact.files.every(f=>String(f.content||'').trim().length>20),`${outcome}: empty file`);
  assert.ok(!JSON.stringify(built.output.artifact).match(/factory opened|revenue generated|customers acquired/i),`${outcome}: fabricated outcome`);
}
console.log('v1-torture-test: PASS');
