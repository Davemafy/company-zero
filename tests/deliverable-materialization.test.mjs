import assert from 'node:assert/strict';
import {persistDeliverableArtifact,loadArtifactFiles,validateArtifactBundle} from '../lib/deliverable-engine.mjs';
import {put} from '../lib/store.mjs';
import {readFile} from 'node:fs/promises';

const companyId=crypto.randomUUID(),sessionId=crypto.randomUUID(),missionId=crypto.randomUUID();
let contract={id:crypto.randomUUID(),company_id:companyId,kind:'deliverable_contract',state:'building',version:0,data:{sessionId,missionId,status:'building',expectedArtifactKeys:['primary']},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
contract=await put(contract);

assert.throws(()=>validateArtifactBundle({files:[{name:'tiny.md',mimeType:'text/markdown',buffer:Buffer.from('small'),bytes:5}]}),/deliverable_quality_check_failed/);
assert.throws(()=>validateArtifactBundle({files:[{name:'useful.md',mimeType:'text/markdown',buffer:Buffer.from('# Useful\n\n'+('Concrete material. '.repeat(12))),bytes:220}],qa:{passed:true,semanticVerified:false},requireSemantic:true}),/deliverable_quality_check_failed/);

const artifact=await persistDeliverableArtifact(companyId,{sessionId,missionId,deliverableContractId:contract.id,title:'Materialized V1',summary:'A concrete usable artifact.',files:[{name:'deliverable.md',mimeType:'text/markdown',content:'# Deliverable\n\n'+('This is concrete persisted material that the user can inspect immediately. '.repeat(5))}],qa:{passed:true,semanticVerified:true}});
assert.equal(artifact.state,'ready');
assert.equal(artifact.data.manifest.retrievalVerified,true);
assert.ok(artifact.data.manifest.validation.substantiveText>=60);
const loaded=await loadArtifactFiles(artifact);
assert.equal(loaded.files.length,1);
assert.match(loaded.files[0].content,/concrete persisted material/);

const api=await readFile(new URL('../api/artifact.mjs',import.meta.url),'utf8');
assert.match(api,/mode==='preview'/);
assert.match(api,/textPreview\(/);
const ui=await readFile(new URL('../system.js',import.meta.url),'utf8');
assert.match(ui,/DELIVERABLE UNAVAILABLE/);
assert.match(ui,/No grounded observation yet/);
assert.doesNotMatch(ui,/esc\(r\.after\?\?'—'\)/);
console.log('deliverable-materialization: PASS');
