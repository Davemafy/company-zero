import assert from 'node:assert/strict';
import {createCompany,synthesize,launch,submitJob,hydrateCompany} from '../lib/platform-v1.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {get} from '../lib/store.mjs';

process.env.STUDIO_ALLOW_FALLBACK='true';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TENSORMUX_BASE_URL;
delete process.env.TENSORMUX_API_KEY;

const c=await createCompany({
  name:'Restaurant Launch Co',
  outcome:'Build and launch a website for my new restaurant',
  mode:'project',
  metrics:[{id:'success',source:'run.status',operator:'=',target:'completed'}],
  constraints:{dailyBudgetUsd:30,qualityFloor:.9}
});
assert.equal(c.data.mode,'project');
assert.ok(c.records.some(x=>x.kind==='capability_provider'&&x.data.type==='internal'));
assert.equal(c.records.filter(x=>x.kind==='capability').length,3);

const org=await synthesize(c.id);
assert.equal(org.data.roles.length,3);
await launch(c.id,org.id);
const job=await submitJob(c.id,{task:'Build and launch a website for my new restaurant. Make it warm, premium, and mobile friendly.'},{idempotencyKey:'project-e2e-1'});

const worker=new WorkerService({workerId:'project-e2e-worker',leaseSeconds:30});
const result=await worker.tick();
assert.equal(result.run.state,'completed');
assert.equal(result.run.data.output.qa.passed,true);
assert.equal(result.run.data.output.artifact.type,'website');
assert.ok(result.run.data.output.artifact.id);
assert.ok(result.run.data.output.artifact.files.some(f=>f.name==='index.html'&&f.content.includes('<!doctype html>')));
assert.ok(result.run.data.output.artifact.files.some(f=>f.name==='styles.css'));
assert.ok(result.run.data.output.artifact.files.some(f=>f.name==='main.js'));

const artifact=await get(result.run.data.output.artifact.id);
assert.equal(artifact.kind,'artifact');
assert.equal(artifact.state,'ready');
assert.equal(artifact.data.qa.passed,true);
assert.equal(artifact.data.jobId,job.id);

const hydrated=await hydrateCompany(await get(c.id));
assert.ok(hydrated.records.some(x=>x.kind==='artifact'&&x.id===artifact.id));
console.log('project deliverable e2e: PASS');
