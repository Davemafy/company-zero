import assert from 'node:assert/strict';
import {collectSessionLineage,approvalsForLineage,duplicateConfirmedSideEffects,terminalVerdict,stableStringify} from '../lib/production-proof.mjs';
const records=[
  {id:'s1',kind:'operating_session',data:{jobId:'j1'}},
  {id:'j1',kind:'job',data:{operatingSessionId:'s1',runId:'r1'}},
  {id:'j2',kind:'job',data:{operatingSessionId:'other',runId:'r2'}}
];
const lineage=collectSessionLineage(records,'s1');
assert.deepEqual([...lineage.jobIds],['j1']);assert.deepEqual([...lineage.runIds],['r1']);
const approvals=[{id:'a1',state:'pending',job_id:'j1',run_id:'r1'},{id:'a2',state:'pending',job_id:'j2',run_id:'r2'}];
assert.deepEqual(approvalsForLineage(approvals,lineage).map(x=>x.id),['a1']);
assert.equal(stableStringify({b:1,a:{d:2,c:3}}),stableStringify({a:{c:3,d:2},b:1}));
const traces=[
  {data:{sideEffectState:'confirmed',capabilityId:'change',organizationRevisionId:'o1',input:{b:2,a:1}}},
  {data:{sideEffectState:'confirmed',capabilityId:'change',organizationRevisionId:'o1',input:{a:1,b:2}}}
];
assert.equal(duplicateConfirmedSideEffects(traces)[0].count,2);
assert.equal(terminalVerdict({terminal:'completed',checks:{a:true,b:true}}).pass,true);
assert.equal(terminalVerdict({terminal:'completed',checks:{a:true,b:false}}).pass,false);
console.log('production-proof: PASS');
