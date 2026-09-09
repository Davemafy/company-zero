import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get,list} from '../lib/store.mjs';

const goal='Research potential partner candidates and prepare a useful shortlist';
const started=await startOperatingSession({goal});
for(let i=0;i<12&&(await get(started.session.id)).state!=='operating';i++)await new WorkerService({workerId:`value-first-stage-${i}`}).tick();
assert.equal((await get(started.session.id)).state,'operating');
let rows=await list({companyId:started.company.id,limit:1000});
assert.equal(rows.some(x=>x.kind==='capability_access_request'&&x.state==='open'),false,'do not ask for access before exhausting useful current capabilities');
assert.ok(rows.some(x=>x.kind==='system_capability_gap'&&x.state==='open'),'deferred missing capabilities must remain visible to the runtime');
const worked=await new WorkerService({workerId:'value-first-execution'}).tick();
assert.equal(worked.run.state,'completed');
rows=await list({companyId:started.company.id,limit:1500});
const artifact=rows.find(x=>x.kind==='artifact'&&x.state==='ready'&&x.data.sessionId===started.session.id);
assert.ok(artifact,'useful progress must materialize as a retrievable artifact');
assert.ok((artifact.data.files||[]).length>0);
const text=(artifact.data.files||[]).map(f=>String(f.content||'')).join(' ');
assert.ok(text.length>120,'artifact must contain substantive material');
assert.ok(/partner|candidate|shortlist|research/i.test(text),'artifact should remain causally tied to the user request');
const verification=rows.find(x=>x.kind==='outcome_verification'&&x.data.sessionId===started.session.id);
assert.ok(verification,'requested world outcome must still be evaluated separately from artifact production');
assert.notEqual(verification.data.status,'achieved','artifact production must not fabricate final-world success');

const production=fs.readFileSync(new URL('../lib/universal.mjs',import.meta.url),'utf8')+fs.readFileSync(new URL('../lib/studio.mjs',import.meta.url),'utf8');
assert.equal(production.includes(goal),false,'value-first behavior must be generic, not prompt-special-cased');
console.log('value-first-progress: PASS');
