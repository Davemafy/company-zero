import assert from 'node:assert/strict';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

const started=await startOperatingSession({goal:'make a car company',v1Mode:true});
const initial=await list({companyId:started.company.id,limit:500});
assert.ok(initial.some(x=>x.kind==='deliverable_contract'&&x.data.version===1));
assert.ok(initial.some(x=>x.kind==='capability'&&x.data.internalAction==='studio.build'));

for(let i=0;i<12;i++){
  const session=await get(started.session.id);
  if(['operating','awaiting_capabilities','awaiting_operation_plan','failed','completed'].includes(session.state))break;
  await new WorkerService({workerId:`universal-v1-${i}`}).tick();
}

const session=await get(started.session.id);
const records=await list({companyId:started.company.id,limit:1200});
assert.equal(session.state,'operating');
assert.ok(records.some(x=>x.kind==='deliverable_graph'));
assert.ok(records.some(x=>x.kind==='system_capability_gap'&&x.data.reasonCode==='external_capability_incomplete'));
assert.equal(records.filter(x=>x.kind==='capability_access_request'&&x.state==='open').length,0);
const plan=records.find(x=>x.kind==='operation_plan');
assert.ok(plan?.data?.operations?.some(x=>x.operation==='build_deliverable'));

await new WorkerService({workerId:'universal-v1-execute'}).tick();
const after=await list({companyId:started.company.id,limit:1400});
assert.ok(after.some(x=>x.kind==='artifact'&&x.state==='ready'));
assert.ok(after.some(x=>x.kind==='outcome_verification'));
console.log('universal-v1-product: PASS');
