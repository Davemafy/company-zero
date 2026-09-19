import assert from 'node:assert/strict';
import {compileExecutionPlan,qualityCheck} from '../lib/execution-kernel.mjs';

const plan=compileExecutionPlan('change my calendar to monday est');
assert.equal(plan.kind,'external_action');
assert.equal(plan.contract.externalActionRequired,true);
assert.equal(plan.contract.requestedOutcomeModality,'external_system');
assert.equal(plan.contract.completionEvidenceRequired,true);
assert.deepEqual(plan.organization.functions,['execution','verification']);

const planOnly={
  title:'Calendar Adjustment Plan',
  summary:'Prepared a truthful calendar adjustment guide.',
  files:[{name:'calendar-adjustment.md',mimeType:'text/markdown',content:('# Calendar Adjustment\n\nProposed: update the calendar to Monday EST. This is a guide and does not claim the calendar was actually changed.\n').repeat(3)}],
  roleTelemetrySummary:{expectedRoles:1,completedRoles:1}
};
const blocked=qualityCheck(planOnly,plan);
assert.equal(blocked.ok,false,'a plan must not satisfy an external action request');
assert.equal(blocked.structuralFailure,true);
assert.ok(blocked.reasons.includes('external_action_unverified'));

const executed={...planOnly,externalActionEvidence:{status:'completed',confirmed:true,receiptId:'calendar-change-123'}};
const allowed=qualityCheck(executed,plan);
assert.equal(allowed.reasons.includes('external_action_unverified'),false,'verified actuator evidence may clear the external-action gate');

const informational=compileExecutionPlan('draft a calendar adjustment guide');
assert.notEqual(informational.kind,'external_action','drafting a guide must remain an artifact request, not an external side effect');
console.log('external-action-readiness: PASS');
