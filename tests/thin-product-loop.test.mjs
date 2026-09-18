import assert from 'node:assert/strict';

process.env.NODE_ENV='development';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TENSORMUX_API_KEY;
delete process.env.TENSORMUX_BASE_URL;

const {createValueMission,reviseValueMission,hydrateValueMission}=await import('../lib/mission-service.mjs');
const {WorkerService}=await import('../lib/worker-service.mjs');

const started=Date.now();
const created=await createValueMission({goal:'find serious leads for my web design service',ownerSessionId:'test-owner'});
assert.ok(Date.now()-started<1500,'mission acceptance must not wait for first-value model execution');
assert.ok(created.session.data.firstValueJobId,'first-value work must be durably queued');
const worked=await new WorkerService({workerId:'thin-product-first-value'}).tick();
assert.ok(worked?.artifact,'durable worker must materialize the first-value artifact');
const first={artifact:worked.artifact,operating:await hydrateValueMission(created.company.id,created.session.id)};
assert.equal(first.artifact.state,'partial','unverified candidate record state must be partial');
assert.equal(first.artifact.data.deliverableVersion,1);
assert.ok(first.artifact.data.files?.[0]?.content?.length>120,'first artifact must contain visible useful content');
assert.equal(first.artifact.data.readiness,'PARTIAL','unverified fallback must never be labelled READY');
assert.equal(first.artifact.data.qa?.claimVerified,false);
assert.equal(first.operating.session.data.state,'partial');
assert.equal(first.operating.session.data.currentStage,'producing_progress');
assert.ok(first.operating.company.records.some(x=>x.kind==='artifact'&&x.id===first.artifact.id),'artifact must be present after worker materialization');

const revised=await reviseValueMission(first.operating.company.id,first.operating.session.id,'make the result more specific and add a qualification checklist');
assert.equal(revised.artifact.data.deliverableVersion,2);
assert.equal(revised.artifact.data.previousArtifactId,first.artifact.id);
assert.ok(revised.artifact.data.files?.[0]?.content?.includes('qualification checklist'),'revision must preserve the user instruction when reasoning is unavailable');

const hydrated=await hydrateValueMission(first.operating.company.id,first.operating.session.id);
assert.equal(hydrated.artifacts.length,2,'artifacts must survive hydration');
assert.equal(hydrated.artifacts[0].data.deliverableVersion,2);
assert.equal(hydrated.messages.filter(x=>x.data?.role==='user').length,1);
console.log('thin-product-loop: PASS');
