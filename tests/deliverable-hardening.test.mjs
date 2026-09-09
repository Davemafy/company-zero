import assert from 'node:assert/strict';
import {persistDeliverableArtifact,loadArtifactFiles,artifactHistory,safeRelativePath,validateArtifactBundle} from '../lib/deliverable-engine.mjs';
import {put,get} from '../lib/store.mjs';
import {readFile} from 'node:fs/promises';

const companyId=crypto.randomUUID(),sessionId=crypto.randomUUID(),missionId=crypto.randomUUID();
let contract={id:crypto.randomUUID(),company_id:companyId,kind:'deliverable_contract',state:'building',version:0,data:{sessionId,missionId,status:'building',expectedArtifactKeys:['primary']},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
contract=await put(contract);

assert.equal(safeRelativePath('src/index.js'),'src/index.js');
assert.equal(safeRelativePath('tests/index.js'),'tests/index.js');
assert.throws(()=>safeRelativePath('../secret.txt'),/invalid_artifact_path/);

const binary=Buffer.from([0,1,2,3,255,128,64]);
const a=await persistDeliverableArtifact(companyId,{sessionId,missionId,deliverableContractId:contract.id,title:'Nested binary bundle',type:'general',files:[
  {name:'src/index.js',mimeType:'text/javascript',content:'console.log("hello from src index");'},
  {name:'tests/index.js',mimeType:'text/javascript',content:'console.log("hello from test index");'},
  {name:'assets/logo.bin',mimeType:'application/octet-stream',buffer:binary}
]});
const loaded=await loadArtifactFiles(a);
assert.equal(loaded.files.find(x=>x.name==='assets/logo.bin').buffer.equals(binary),true);
assert.ok(loaded.files.some(x=>x.name==='src/index.js'));
assert.ok(loaded.files.some(x=>x.name==='tests/index.js'));

await assert.rejects(()=>persistDeliverableArtifact(companyId,{sessionId,missionId,deliverableContractId:contract.id,title:'Collision',files:[{name:'a/x.txt',content:'this is long enough to be a valid artifact file'},{name:'a/x.txt',content:'another valid body that collides exactly'}]}),/artifact_path_collision/);
assert.throws(()=>validateArtifactBundle({type:'general',files:[{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad}'),bytes:5}]}),/deliverable_quality_check_failed/);

const concurrent=await Promise.all([1,2].map(n=>persistDeliverableArtifact(companyId,{sessionId,missionId,deliverableContractId:contract.id,title:`Concurrent ${n}`,files:[{name:`v${n}.md`,mimeType:'text/markdown',content:`# Version ${n}\n\nA concrete non-empty deliverable body for concurrency testing.`}]})));
const versions=concurrent.map(x=>x.data.deliverableVersion).sort((x,y)=>x-y);
assert.deepEqual(versions,[2,3]);
const history=await artifactHistory(companyId,contract.id);assert.deepEqual(history.map(x=>x.data.deliverableVersion),[1,2,3]);

const updated=await get(contract.id);assert.equal(updated.state,'ready');assert.equal(updated.data.deliverableRevisionCount,3);assert.notEqual(updated.data.deliverableRevisionCount,updated.data.latestArtifactId);

const engine=await readFile(new URL('../lib/deliverable-engine.mjs',import.meta.url),'utf8');
assert.doesNotMatch(engine,/x-upsert['"]\s*:\s*['"]true/);
assert.doesNotMatch(engine,/storage\/v1\/bucket`,\{method:'POST'/);
assert.match(engine,/artifact_bucket_not_provisioned/);
const api=await readFile(new URL('../api/artifact.mjs',import.meta.url),'utf8');
assert.match(api,/ownerSessionId|ownsCompany/);assert.match(api,/iframe sandbox="allow-scripts"/);assert.doesNotMatch(api,/frame-ancestors 'none'/);
const migration=await readFile(new URL('../db/005_deliverable_artifacts.sql',import.meta.url),'utf8');
for(const table of ['cz_deliverable_revisions','cz_artifacts','cz_artifact_revisions','cz_artifact_files'])assert.match(migration,new RegExp(`create table if not exists ${table}`));
assert.match(migration,/pg_advisory_xact_lock/);
console.log('deliverable-hardening: PASS');

// Product artifact access is bound to the same HttpOnly browser session that owns the company.
import artifactHandler from '../api/artifact.mjs';
import {ensureBrowserSession} from '../lib/session-auth.mjs';
import {createCompany} from '../lib/platform-v1.mjs';
import {Readable} from 'node:stream';
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[String(k).toLowerCase()]=v},end(x){this.body=x}}}
const seedReq={headers:{}};const seedRes=response();const ownerSid=ensureBrowserSession(seedReq,seedRes);const cookie=String(seedRes.headers['set-cookie']).split(';')[0];
const owned=await createCompany({name:'Owned artifact test',outcome:'Produce a protected file',mode:'project',ownerSessionId:ownerSid,metrics:[],constraints:{}});
let ownedContract={id:crypto.randomUUID(),company_id:owned.id,kind:'deliverable_contract',state:'building',version:0,data:{status:'building',completionPolicy:'single_validated_bundle',expectedArtifactKeys:['primary']},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};ownedContract=await put(ownedContract);
const protectedArtifact=await persistDeliverableArtifact(owned.id,{deliverableContractId:ownedContract.id,title:'Protected',files:[{name:'readme.md',mimeType:'text/markdown',content:'# Protected artifact\n\nOnly the owner browser session should receive this manifest.'}]});
async function callArtifact(cookieHeader){const req=Readable.from([]);req.method='GET';req.query={id:protectedArtifact.id,mode:'manifest'};req.headers=cookieHeader?{cookie:cookieHeader}:{};const res=response();await artifactHandler(req,res);return res}
assert.equal((await callArtifact(cookie)).statusCode,200);assert.equal((await callArtifact('czsid=wrong.invalid')).statusCode,403);
console.log('artifact-session-ownership: PASS');
