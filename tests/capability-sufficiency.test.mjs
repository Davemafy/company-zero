import assert from 'node:assert/strict';
import {assessCapabilitySufficiency,deriveCapabilityRequirements} from '../lib/grounding.mjs';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

const revenueContract={desiredState:'help me generate 100k in revenue',successCriteria:[{metricId:'revenue_total',target:100000,operator:'>=',description:'Generate at least 100000 in attributable revenue'}]};
const observeOnly=[{id:'web',data:{name:'observe_public_web',operationKind:'observe',observes:['public_webpage_content'],changes:[],measurements:[],risk:'read'}}];
const insufficient=assessCapabilitySufficiency(revenueContract,observeOnly);
assert.equal(insufficient.sufficient,false);
assert.ok(insufficient.missing.some(x=>x.kind==='act'));
assert.ok(insufficient.missing.some(x=>x.kind==='verify'));

const complete=[
  ...observeOnly,
  {id:'act',data:{name:'perform_intervention',operationKind:'change',observes:[],changes:['revenue_total'],measurements:[],risk:'read'}},
  {id:'verify',data:{name:'verify_revenue',operationKind:'verify',observes:['revenue_total'],changes:[],measurements:[{metricId:'revenue_total'}],risk:'read'}}
];
const sufficient=assessCapabilitySufficiency(revenueContract,complete);
assert.equal(sufficient.sufficient,true);
assert.ok(sufficient.requiredCapabilityIds.includes('act'));
assert.ok(sufficient.requiredCapabilityIds.includes('verify'));

const observational=deriveCapabilityRequirements({desiredState:'Observe a public page',successCriteria:[]});
assert.equal(observational.act.required,false,'pure observation goals must not require a write capability');

const started=await startOperatingSession({
  goal:'help me generate 100k in revenue',
  providers:[{name:'Public Web Only',type:'http',baseUrl:'https://example.com',manifest:{capabilities:[{
    name:'observe_public_web',description:'Observe public page content only',endpoint:'/observe',method:'POST',risk:'read',operationKind:'observe',observes:['public_webpage_content'],inputSchema:{type:'object'},outputSchema:{type:'object'}
  }]}}]
});
for(let i=0;i<10&&(await get(started.session.id)).state!=='awaiting_capabilities';i++)await new WorkerService({workerId:`sufficiency-stage-${i}`}).tick();
const session=await get(started.session.id);
assert.equal(session.state,'awaiting_capabilities');
const rows=await list({companyId:started.company.id,limit:500});
const blocker=rows.find(x=>x.kind==='capability_access_request'&&x.state==='open');
assert.ok(blocker,'missing action/verification coverage must persist a blocker');
assert.equal(blocker.data.reasonCode,'outcome_capability_insufficient');
assert.ok(blocker.data.missingKinds.includes('act'));
assert.ok(blocker.data.missingKinds.includes('verify'));
assert.equal(rows.filter(x=>x.kind==='job'&&!x.data.operation).length,0,'insufficient capabilities must not dispatch mission work');
assert.equal(rows.filter(x=>x.kind==='organization_revision').length,0,'insufficient capability coverage must block before organization launch');
const contract=rows.find(x=>x.kind==='outcome_contract');
assert.equal(contract.data.desiredState,'help me generate 100k in revenue','goal compiler must preserve the requested future outcome rather than assert success');
console.log('capability-sufficiency: PASS');
