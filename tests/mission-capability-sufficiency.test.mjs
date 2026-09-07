import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

async function drive(sessionId,max=12){for(let i=0;i<max;i++){const session=await get(sessionId);if(['operating','awaiting_capabilities','awaiting_operation_plan'].includes(session.state))return session;await new WorkerService({workerId:`sufficiency-${sessionId.slice(0,6)}-${i}`}).tick()}return get(sessionId)}

const metric='outcome_metric_1';
const observer={name:'Public web observer',type:'http',baseUrl:'http://127.0.0.1:9',manifest:{capabilities:[{name:'observe_public_web',description:'Read public pages only. Cannot change or authoritatively verify business outcomes.',endpoint:'/observe',method:'POST',risk:'read',operationKind:'observe',observes:['public_webpage_content'],changes:[],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'}}]}};

const revenue=await startOperatingSession({goal:'help me generate 100k in revenue',providers:[observer]});
const revenueState=await drive(revenue.session.id);
const revenueRecords=await list({companyId:revenue.company.id,limit:500});
assert.equal(revenueState.state,'awaiting_capabilities');
assert.equal(revenueRecords.filter(x=>x.kind==='organization_revision').length,0,'must not build an executable company from observation-only capability');
assert.equal(revenueRecords.filter(x=>x.kind==='job'&&!x.data.operation).length,0,'must not queue outcome work while capability coverage is insufficient');
const blocker=revenueRecords.find(x=>x.kind==='capability_access_request'&&x.state==='open');
assert.ok(blocker);assert.equal(blocker.data.reasonCode,'capability_sufficiency_gap');
assert.ok(blocker.data.missingModes.includes('act'));assert.ok(blocker.data.missingModes.includes('verify'));assert.ok(blocker.data.missingModes.includes('observe'));
const contract=revenueRecords.find(x=>x.kind==='outcome_contract');assert.equal(contract.data.desiredState,'help me generate 100k in revenue');assert.match(contract.data.successCriteria[0].description,/^Condition to achieve and verify:/);

const capableProvider={name:'Generic outcome system',type:'http',baseUrl:'http://127.0.0.1:9',manifest:{capabilities:[
  {name:'measure_baseline',description:'Observe the target metric from an external record.',endpoint:'/baseline',method:'POST',risk:'read',operationKind:'observe',observes:[metric],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'},measurements:[{metricId:metric,path:'$.value',phase:'baseline',externalRefPath:'$.recordId'}]},
  {name:'apply_permitted_change',description:'Apply a reversible change toward the selected strategy.',endpoint:'/change',method:'POST',risk:'read',operationKind:'change',changes:[metric],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'}},
  {name:'verify_outcome',description:'Read the target metric after intervention from an authoritative external record.',endpoint:'/verify',method:'POST',risk:'read',operationKind:'verify',observes:[metric],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'},measurements:[{metricId:metric,path:'$.value',phase:'after',externalRefPath:'$.recordId'}]}
]}};

const capable=await startOperatingSession({goal:'Reach 100 verified units',providers:[capableProvider]});
const capableState=await drive(capable.session.id);
const capableRecords=await list({companyId:capable.company.id,limit:700});
assert.equal(capableState.state,'operating');
const selection=capableRecords.find(x=>x.kind==='strategy_selection'&&x.state==='selected');assert.equal(selection.data.capabilitySufficiency.sufficient,true);
assert.ok(capableRecords.some(x=>x.kind==='organization_revision'&&x.state==='production'));
assert.ok(capableRecords.some(x=>x.kind==='operation_plan'&&x.state==='validated'));
const roleNames=capableRecords.find(x=>x.kind==='organization_revision'&&x.state==='production').data.roles.map(x=>x.name);assert.ok(roleNames.every(x=>!/^Frame test$/i.test(x)));

const arbitrary=await startOperatingSession({goal:'Reduce verified queue delay below 20',providers:[capableProvider]});
const arbitraryState=await drive(arbitrary.session.id);assert.equal(arbitraryState.state,'operating','same sufficiency mechanism must work for a non-revenue mission');

const ui=await fs.readFile(new URL('../system.js',import.meta.url),'utf8');
assert.ok(ui.indexOf('request?`<h2>Blocked intentionally</h2>')<ui.indexOf('`<h2>Nothing right now</h2>'),'open access requests must win over the nothing-required fallback');

console.log('mission-capability-sufficiency: PASS');
