import assert from 'node:assert/strict';

process.env.NODE_ENV='development';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TENSORMUX_API_KEY;
delete process.env.TENSORMUX_BASE_URL;

const {createValueMissionWithArtifact,reviseValueMission,hydrateValueMission}=await import('../lib/mission-service.mjs');

const started=Date.now();
const first=await createValueMissionWithArtifact({goal:'find serious leads for my web design service',ownerSessionId:'test-owner'});
assert.ok(Date.now()-started<1500,'first artifact should not wait on background infrastructure when model is unavailable');
assert.equal(first.artifact.state,'ready');
assert.equal(first.artifact.data.deliverableVersion,1);
assert.ok(first.artifact.data.files?.[0]?.content?.length>120,'first artifact must contain visible useful content');
assert.equal(first.operating.session.data.currentStage,'ready');
assert.ok(first.operating.company.records.some(x=>x.kind==='artifact'&&x.id===first.artifact.id),'artifact must be present in the initial UI snapshot');

const revised=await reviseValueMission(first.operating.company.id,first.operating.session.id,'make the result more specific and add a qualification checklist');
assert.equal(revised.artifact.data.deliverableVersion,2);
assert.equal(revised.artifact.data.previousArtifactId,first.artifact.id);
assert.ok(revised.artifact.data.files?.[0]?.content?.includes('qualification checklist'),'revision must preserve the user instruction when reasoning is unavailable');

const hydrated=await hydrateValueMission(first.operating.company.id,first.operating.session.id);
assert.equal(hydrated.artifacts.length,2,'artifacts must survive hydration');
assert.equal(hydrated.artifacts[0].data.deliverableVersion,2);
assert.equal(hydrated.messages.filter(x=>x.data?.role==='user').length,1);
console.log('thin-product-loop: PASS');
