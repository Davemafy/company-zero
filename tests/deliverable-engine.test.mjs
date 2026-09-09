import assert from 'node:assert/strict';
import {persistDeliverableArtifact,loadArtifactFiles,artifactHistory} from '../lib/deliverable-engine.mjs';
import {put,get} from '../lib/store.mjs';

const companyId=crypto.randomUUID(),sessionId=crypto.randomUUID(),missionId=crypto.randomUUID();
let contract={id:crypto.randomUUID(),company_id:companyId,kind:'deliverable_contract',state:'building',version:0,data:{sessionId,missionId,version:1,status:'building'},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
contract=await put(contract);
const v1=await persistDeliverableArtifact(companyId,{sessionId,missionId,deliverableContractId:contract.id,title:'Test Deliverable',type:'website',files:[{name:'index.html',mimeType:'text/html',content:'<!doctype html><meta name="viewport" content="width=device-width"><title>Test</title><h1>Hello world deliverable</h1>'},{name:'styles.css',mimeType:'text/css',content:'body { font-family: sans-serif; min-height: 100vh; }'}]});
assert.equal(v1.data.deliverableVersion,1);assert.equal(v1.data.files.length,2);assert.ok(v1.data.files.every(f=>f.sha256&&f.bytes>0));
const loaded=await loadArtifactFiles(v1);assert.match(loaded.files.find(x=>x.name==='index.html').content,/Hello world/);
const v2=await persistDeliverableArtifact(companyId,{sessionId,missionId,deliverableContractId:contract.id,title:'Test Deliverable',type:'website',files:[{name:'index.html',mimeType:'text/html',content:'<!doctype html><meta name="viewport" content="width=device-width"><title>Test V2</title><h1>Hello world version two</h1>'}]});
assert.equal(v2.data.deliverableVersion,2);assert.equal(v2.data.previousArtifactId,v1.id);
const history=await artifactHistory(companyId,contract.id);assert.deepEqual(history.map(x=>x.data.deliverableVersion),[1,2]);
const updated=await get(contract.id);assert.equal(updated.state,'ready');assert.equal(updated.data.latestVersion,2);assert.equal(updated.data.latestArtifactId,v2.id);assert.equal(updated.data.deliverableRevisionCount,2);assert.deepEqual(updated.data.completedArtifactKeys,['primary']);
console.log('deliverable-engine: PASS');
