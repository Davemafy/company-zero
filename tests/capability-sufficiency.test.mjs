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
for(let i=0;i<12&&(await get(started.session.id)).state!=='operating';i++)await new WorkerService({workerId:`sufficiency-stage-${i}`}).tick();
const session=await get(started.session.id);
assert.equal(session.state,'operating','insufficient final-outcome coverage must not block useful safe progress');
const rows=await list({companyId:started.company.id,limit:500});
const blocker=rows.find(x=>x.kind==='capability_access_request'&&x.state==='open');
assert.equal(blocker,undefined,'capability access should be deferred until a concrete blocked step');
const gap=rows.find(x=>x.kind==='system_capability_gap'&&x.state==='open');
assert.ok(gap,'missing final outcome coverage must remain explicit');
assert.ok(gap.data.missingKinds.length>0);
assert.ok(gap.data.missingKinds.includes('verify')||gap.data.missingKinds.includes('observe')||gap.data.missingKinds.includes('actuator'));
assert.ok(rows.some(x=>x.kind==='job'&&!x.data.operation),'available capabilities must be used to create value now');
assert.ok(rows.some(x=>x.kind==='organization_revision'),'partial capability coverage may still launch a bounded organization');
const contract=rows.find(x=>x.kind==='outcome_contract');
assert.equal(contract.data.desiredState,'help me generate 100k in revenue','goal compiler must preserve the requested future outcome rather than assert success');
console.log('capability-sufficiency: PASS');
