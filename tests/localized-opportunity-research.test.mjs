import assert from 'node:assert/strict';
import {compileExecutionPlan} from '../lib/execution-kernel.mjs';

for(const prompt of [
  'entrepreneurship ideas in Nigeria',
  'enterprenuer ship ideas in nigerai',
  'business opportunities in Ghana',
  'startup ideas for Kenya market'
]){
  const plan=compileExecutionPlan(prompt);
  assert.equal(plan.kind,'research',`${prompt} must route to current research`);
  assert.equal(plan.requiresFreshEvidence,true);
}
const creative=compileExecutionPlan('give me five silly app ideas');
assert.notEqual(creative.kind,'research','generic creative ideation should not force live market research');
console.log('localized-opportunity-research: PASS');
