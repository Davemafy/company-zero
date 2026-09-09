import assert from 'node:assert/strict';
import {invokeStudioCapability} from '../lib/studio.mjs';

const cap=action=>({internalAction:action,inputSchema:{type:'object',additionalProperties:true},outputSchema:{type:'object'}});
const cases=[
  {prompt:'Build me a portfolio website',type:'website',check:a=>{const n=new Set(a.files.map(f=>f.name));return n.has('index.html')&&n.has('styles.css')&&n.has('main.js')&&/viewport/i.test(a.files.find(f=>f.name==='index.html').content)}},
  {prompt:'Research Nigerian fintech',type:'report',check:a=>a.files.some(f=>f.name==='report.md'&&/Evidence status|evidence/i.test(f.content))},
  {prompt:'Launch my app',type:'campaign',check:a=>['launch-plan.md','social-copy.md','landing-copy.md'].every(n=>a.files.some(f=>f.name===n))},
  {prompt:'Get me clients',type:'general',check:a=>a.files.length>=3&&a.files.some(f=>/assumptions/i.test(f.name))},
  {prompt:'Make a car company',type:'general',check:a=>a.files.length>=3&&a.files.some(f=>/Version 1/i.test(f.content))}
];
for(const c of cases){const planned=await invokeStudioCapability(cap('studio.plan'),{brief:c.prompt},{mission:{outcome:c.prompt}});assert.equal(planned.output.deliverableType,c.type);assert.ok(Array.isArray(planned.output.acceptanceCriteria)&&planned.output.acceptanceCriteria.length);const built=await invokeStudioCapability(cap('studio.build'),planned.output,{mission:{outcome:c.prompt}});assert.ok(c.check(built.output.artifact),`${c.prompt}: semantic acceptance contract failed`);const reviewed=await invokeStudioCapability(cap('studio.review'),{artifact:built.output.artifact,plan:planned.output},{mission:{outcome:c.prompt}});assert.equal(reviewed.output.qa.passed,true)}
console.log('v1-quality-contract: PASS');
