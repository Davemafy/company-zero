import {createHash} from 'node:crypto';
import {put,get,list,storageMode} from './store.mjs';

const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const BUCKET=process.env.CZ_ARTIFACT_BUCKET||'company-zero-artifacts';
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const record=(kind,data,companyId=null,state='active')=>({id:id(),company_id:companyId,kind,state,version:0,data,created_at:now(),updated_at:now()});
const sha256=value=>createHash('sha256').update(value).digest('hex');
const mem=globalThis.__CZ_ARTIFACT_ENGINE__||(globalThis.__CZ_ARTIFACT_ENGINE__={revisions:new Map(),artifacts:new Map(),artifactRevisions:new Map(),files:new Map(),locks:new Map()});

function storageHeaders(extra={}){return {apikey:KEY,authorization:`Bearer ${KEY}`,...extra}}
function restHeaders(extra={}){return storageHeaders({'content-type':'application/json','prefer':'return=representation',...extra})}
function isTextMime(mime=''){return /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded))/.test(String(mime).toLowerCase())}
function safeSegment(seg){const out=String(seg).replace(/[^a-zA-Z0-9._ -]/g,'-').replace(/^\.+$/,'-').slice(0,100);return out||'file'}
export function safeRelativePath(name){
  const raw=String(name||'file.bin').replace(/\\/g,'/');
  const parts=raw.split('/').filter(Boolean);
  if(!parts.length||parts.some(x=>x==='..'))throw Object.assign(Error('invalid_artifact_path'),{status:422,details:{name}});
  return parts.filter(x=>x!=='.').map(safeSegment).join('/').slice(0,600)||'file.bin';
}
function fileBuffer(file){
  if(Buffer.isBuffer(file?.buffer))return file.buffer;
  if(file?.bytes instanceof Uint8Array)return Buffer.from(file.bytes);
  if(typeof file?.base64==='string')return Buffer.from(file.base64,'base64');
  if(typeof file?.content==='string')return Buffer.from(file.content,'utf8');
  throw Object.assign(Error('artifact_file_content_required'),{status:422,details:{name:file?.name}});
}
function prepareFiles(files){
  const seen=new Set(),prepared=[];
  for(const file of files.slice(0,64)){
    const name=safeRelativePath(file?.name);if(seen.has(name))throw Object.assign(Error('artifact_path_collision'),{status:422,details:{path:name}});seen.add(name);
    const mimeType=String(file?.mimeType||guessMime(name));const buffer=fileBuffer(file);if(!buffer.length)throw Object.assign(Error('artifact_file_empty'),{status:422,details:{path:name}});
    prepared.push({name,mimeType,buffer,bytes:buffer.byteLength,sha256:sha256(buffer)});
  }
  if(!prepared.length)throw Object.assign(Error('deliverable_files_empty'),{status:422});
  return prepared;
}
function guessMime(name){const x=name.toLowerCase();if(x.endsWith('.html'))return'text/html';if(x.endsWith('.css'))return'text/css';if(x.endsWith('.js')||x.endsWith('.mjs'))return'text/javascript';if(x.endsWith('.json'))return'application/json';if(x.endsWith('.csv'))return'text/csv';if(x.endsWith('.md'))return'text/markdown';if(x.endsWith('.svg'))return'image/svg+xml';if(x.endsWith('.png'))return'image/png';if(x.endsWith('.jpg')||x.endsWith('.jpeg'))return'image/jpeg';if(x.endsWith('.pdf'))return'application/pdf';if(x.endsWith('.zip'))return'application/zip';return'application/octet-stream'}

export function validateArtifactBundle({type='general',files=[],qa=null,requireSemantic=false}={}){
  const errors=[],names=new Set(files.map(f=>f.name));
  if(!files.length)errors.push('files_required');
  for(const f of files){
    if(!f.bytes)errors.push(`empty:${f.name}`);
    if(f.bytes>10*1024*1024)errors.push(`file_too_large:${f.name}`);
    if(isTextMime(f.mimeType)){
      const text=f.buffer.toString('utf8');
      if(text.trim().length<20)errors.push(`text_too_short:${f.name}`);
      if(/(?:TODO|lorem ipsum|replace me|example\.com\/todo)/i.test(text))errors.push(`placeholder:${f.name}`);
      if(f.mimeType==='application/json'){try{JSON.parse(text)}catch{errors.push(`invalid_json:${f.name}`)}}
      if(f.mimeType==='text/csv'){const rows=text.trim().split(/\r?\n/);if(rows.length<2||!rows[0].includes(','))errors.push(`invalid_csv:${f.name}`)}
    }
  }
  const textFiles=files.filter(f=>isTextMime(f.mimeType));
  const substantiveText=textFiles.reduce((n,f)=>n+f.buffer.toString('utf8').trim().length,0);
  if(textFiles.length&&substantiveText<60)errors.push('artifact_not_substantive');
  if(type==='website'){
    const html=files.find(f=>f.name==='index.html');
    if(!html)errors.push('website_missing_index');
    else{const text=html.buffer.toString('utf8');if(!/(<!doctype html|<html\b)/i.test(text))errors.push('website_invalid_html');if(!/name=["']viewport["']/i.test(text))errors.push('website_missing_viewport');if(!/<title>[^<]+<\/title>/i.test(text))errors.push('website_missing_title')}
  }
  if(qa&&qa.passed===false)errors.push('upstream_qa_failed');
  if(requireSemantic&&(qa?.passed!==true||qa?.semanticVerified!==true))errors.push('semantic_qa_required');
  if(errors.length)throw Object.assign(Error('deliverable_quality_check_failed'),{status:422,details:{errors}});
  return {passed:true,checks:[...files.map(f=>({id:`file:${f.name}`,passed:true})),{id:'bundle_structure',passed:true},{id:'substantive_content',passed:!textFiles.length||substantiveText>=60},{id:'semantic_quality',passed:!requireSemantic||qa?.semanticVerified===true}],substantiveText};
}

async function assertBucket(){
  if(storageMode()!=='supabase')return false;
  const read=await fetch(`${URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,{headers:storageHeaders()});
  if(read.ok)return true;
  throw Object.assign(Error('artifact_bucket_not_provisioned'),{status:503,details:{bucket:BUCKET,hint:'Provision the private artifact bucket during deployment with npm run setup:artifacts. Runtime never creates infrastructure.'}});
}
async function uploadObject(path,buffer,mimeType){
  const r=await fetch(`${URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:storageHeaders({'content-type':mimeType||'application/octet-stream','x-upsert':'false'}),body:buffer});
  if(!r.ok)throw Object.assign(Error(r.status===409?'artifact_object_collision':'artifact_upload_failed'),{status:502,details:{path,httpStatus:r.status}});
}
async function deleteObject(path){
  const r=await fetch(`${URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:storageHeaders()});
  return r.ok||r.status===404;
}
async function downloadObject(path){
  const r=await fetch(`${URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:storageHeaders()});
  if(!r.ok)throw Object.assign(Error('artifact_download_failed'),{status:r.status===404?404:502,details:{path,httpStatus:r.status}});
  return Buffer.from(await r.arrayBuffer());
}
async function rpc(name,args){const r=await fetch(`${URL}/rest/v1/rpc/${name}`,{method:'POST',headers:restHeaders(),body:JSON.stringify(args)});const out=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error(out?.message||`${name}_failed`),{status:502,details:out});return out}
async function tableInsert(table,row){const r=await fetch(`${URL}/rest/v1/${table}`,{method:'POST',headers:restHeaders(),body:JSON.stringify(row)});const out=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error(out?.message||`${table}_insert_failed`),{status:502,details:out});return out?.[0]||null}
async function tablePatch(table,query,patch){const r=await fetch(`${URL}/rest/v1/${table}?${query}`,{method:'PATCH',headers:restHeaders(),body:JSON.stringify(patch)});const out=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error(out?.message||`${table}_patch_failed`),{status:502,details:out});return out}
async function tableSelect(table,query){const r=await fetch(`${URL}/rest/v1/${table}?${query}`,{headers:restHeaders()});const out=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(Error(out?.message||`${table}_read_failed`),{status:502,details:out});return out||[]}

async function withMemLock(key,fn){const prior=mem.locks.get(key)||Promise.resolve();let release;const gate=new Promise(r=>release=r);mem.locks.set(key,prior.then(()=>gate));await prior;try{return await fn()}finally{release();if(mem.locks.get(key)===gate)mem.locks.delete(key)}}
async function reserveRevision(companyId,{deliverableContractId,sessionId,missionId,artifactKey,type,title,summary,source}){
  if(storageMode()==='supabase')return rpc('cz_reserve_deliverable_artifact_revision',{p_company_id:companyId,p_contract_id:deliverableContractId,p_session_id:sessionId,p_mission_id:missionId,p_artifact_key:artifactKey,p_type:type,p_title:title,p_summary:summary,p_source:source});
  return withMemLock(`${companyId}:${deliverableContractId}`,async()=>{
    let artifact=[...mem.artifacts.values()].find(x=>x.companyId===companyId&&x.contractId===deliverableContractId&&x.artifactKey===artifactKey);
    if(!artifact){artifact={id:id(),companyId,contractId:deliverableContractId,artifactKey,type};mem.artifacts.set(artifact.id,artifact)}
    const matching=[...mem.revisions.values()].filter(x=>x.companyId===companyId&&x.contractId===deliverableContractId);const prior=matching.filter(x=>x.state==='ready').sort((a,b)=>b.version-a.version)[0];const nextVersion=Math.max(0,...matching.map(x=>x.version))+1;
    const delivery={id:id(),companyId,contractId:deliverableContractId,sessionId,missionId,version:nextVersion,previousRevisionId:prior?.id||null,state:'staging',title,summary,source,createdAt:now()};mem.revisions.set(delivery.id,delivery);
    const arNo=Math.max(0,...[...mem.artifactRevisions.values()].filter(x=>x.artifactId===artifact.id).map(x=>x.revision))+1;
    const ar={id:id(),companyId,artifactId:artifact.id,deliverableRevisionId:delivery.id,revision:arNo,state:'staging',manifest:{}};mem.artifactRevisions.set(ar.id,ar);
    return {artifactId:artifact.id,artifactRevisionId:ar.id,artifactRevision:arNo,deliverableRevisionId:delivery.id,deliverableVersion:delivery.version,previousDeliverableRevisionId:delivery.previousRevisionId};
  });
}
async function stageFileMetadata(companyId,artifactRevisionId,file,storagePath){
  const row={id:id(),company_id:companyId,artifact_revision_id:artifactRevisionId,relative_path:file.name,mime_type:file.mimeType,byte_count:file.bytes,sha256:file.sha256,storage_bucket:storageMode()==='supabase'?BUCKET:null,storage_path:storageMode()==='supabase'?storagePath:null,state:'staging'};
  if(storageMode()==='supabase')return tableInsert('cz_artifact_files',row);
  mem.files.set(row.id,{...row,buffer:file.buffer});return row;
}
async function markFileReady(artifactRevisionId,path){if(storageMode()==='supabase')return tablePatch('cz_artifact_files',`artifact_revision_id=eq.${artifactRevisionId}&relative_path=eq.${encodeURIComponent(path)}`,{state:'ready',updated_at:now()});for(const f of mem.files.values())if(f.artifact_revision_id===artifactRevisionId&&f.relative_path===path)f.state='ready'}
async function failReservation(companyId,reservation,error){
  if(storageMode()==='supabase')return rpc('cz_fail_deliverable_artifact_revision',{p_company_id:companyId,p_deliverable_revision_id:reservation.deliverableRevisionId,p_artifact_revision_id:reservation.artifactRevisionId,p_failure:{message:error.message,at:now()}});
  const d=mem.revisions.get(reservation.deliverableRevisionId);if(d){d.state='failed';d.failure={message:error.message,at:now()}}const ar=mem.artifactRevisions.get(reservation.artifactRevisionId);if(ar)ar.state='failed';for(const f of mem.files.values())if(f.artifact_revision_id===reservation.artifactRevisionId)f.state='failed';
}
async function finalizeReservation(companyId,reservation,{manifest,qa,compatArtifactId,deliverableContractId}){
  if(storageMode()==='supabase')return rpc('cz_finalize_deliverable_artifact_revision',{p_company_id:companyId,p_contract_id:deliverableContractId,p_deliverable_revision_id:reservation.deliverableRevisionId,p_artifact_revision_id:reservation.artifactRevisionId,p_manifest:manifest,p_qa:qa||null,p_compat_artifact_id:compatArtifactId});
  const d=mem.revisions.get(reservation.deliverableRevisionId);d.state='ready';d.qa=qa||null;const ar=mem.artifactRevisions.get(reservation.artifactRevisionId);ar.state='ready';ar.manifest=manifest;for(const f of mem.files.values())if(f.artifact_revision_id===reservation.artifactRevisionId)f.state='ready';
  const contract=await get(deliverableContractId);if(contract?.kind==='deliverable_contract'){contract.state='ready';Object.assign(contract.data,{status:'ready',latestArtifactId:compatArtifactId,latestVersion:reservation.deliverableVersion,latestDeliverableRevisionId:reservation.deliverableRevisionId,deliverableRevisionCount:[...mem.revisions.values()].filter(x=>x.companyId===companyId&&x.contractId===deliverableContractId&&x.state==='ready').length,completedArtifactKeys:contract.data.expectedArtifactKeys||['primary'],updatedAt:now()});await put(contract,{expectedVersion:contract.version})}
  return {deliverableVersion:reservation.deliverableVersion,deliverableRevisionId:reservation.deliverableRevisionId};
}

export async function reconcileArtifactStaging({olderThanMinutes=30,limit=50}={}){
  if(storageMode()!=='supabase')return {checked:0,cleaned:0};
  const cutoff=new Date(Date.now()-olderThanMinutes*60000).toISOString();
  const stale=await tableSelect('cz_artifact_revisions',`state=eq.staging&created_at=lt.${encodeURIComponent(cutoff)}&select=id,company_id,deliverable_revision_id&limit=${Math.min(limit,100)}`);let cleaned=0;
  for(const ar of stale){const files=await tableSelect('cz_artifact_files',`artifact_revision_id=eq.${ar.id}&select=storage_path`);for(const f of files)if(f.storage_path)await deleteObject(f.storage_path).catch(()=>false);await failReservation(ar.company_id,{deliverableRevisionId:ar.deliverable_revision_id,artifactRevisionId:ar.id},Error('stale_artifact_staging_reconciled'));cleaned++}
  return {checked:stale.length,cleaned};
}

export async function persistDeliverableArtifact(companyId,{sessionId=null,missionId=null,deliverableContractId=null,artifactKey='primary',title='Company Zero Deliverable',summary='',type='general',files=[],jobId=null,runId=null,qa=null,source='studio'}={}){
  if(!Array.isArray(files)||!files.length)throw Object.assign(Error('deliverable_files_required'),{status:422});
  if(!deliverableContractId){
    let contract=record('deliverable_contract',{sessionId,missionId,version:1,title:`${title} · V1`,request:title,desiredOutcome:title,assumptionsPolicy:'infer_reversible_ask_at_authority_boundary',completionPolicy:'single_validated_bundle',expectedArtifactKeys:[artifactKey],completedArtifactKeys:[],status:'building',sourceJobId:jobId||null,sourceRunId:runId||null},companyId,'building');
    Object.assign(contract,await put(contract));deliverableContractId=contract.id;
  }
  const prepared=prepareFiles(files);const requireSemantic=source==='studio'&&process.env.NODE_ENV==='production';const validation=validateArtifactBundle({type,files:prepared,qa,requireSemantic});
  if(storageMode()==='supabase'){await assertBucket();await reconcileArtifactStaging({olderThanMinutes:30,limit:10}).catch(()=>{})}
  const reservation=await reserveRevision(companyId,{deliverableContractId,sessionId,missionId,artifactKey,type,title,summary,source});
  const uploaded=[];const fileRows=[];const durable=storageMode()==='supabase';
  try{
    for(const file of prepared){
      const storagePath=`companies/${companyId}/deliverables/${deliverableContractId}/revisions/${reservation.deliverableRevisionId}/artifacts/${reservation.artifactRevisionId}/${file.name}`;
      const row=await stageFileMetadata(companyId,reservation.artifactRevisionId,file,storagePath);fileRows.push(row);
      if(durable){await uploadObject(storagePath,file.buffer,file.mimeType);uploaded.push(storagePath);const roundTrip=await downloadObject(storagePath);if(roundTrip.byteLength!==file.buffer.byteLength||sha256(roundTrip)!==file.sha256)throw Object.assign(Error('artifact_retrieval_verification_failed'),{status:502,details:{path:storagePath}});await markFileReady(reservation.artifactRevisionId,file.name)}
    }
    const previousCompat=(await list({companyId,kind:'artifact',limit:5000})).filter(x=>x.data?.deliverableContractId===deliverableContractId&&x.data?.artifactKey===artifactKey&&x.state==='ready').sort((a,b)=>Number(b.data?.deliverableVersion||0)-Number(a.data?.deliverableVersion||0))[0];
    const compatId=id();const manifest={version:reservation.deliverableVersion,artifactRevision:reservation.artifactRevision,deliverableRevisionId:reservation.deliverableRevisionId,artifactRevisionId:reservation.artifactRevisionId,fileCount:prepared.length,totalBytes:prepared.reduce((n,f)=>n+f.bytes,0),createdAt:now(),validation,retrievalVerified:true};
    let artifact=record('artifact',{title,summary,type,artifactKey,sessionId,missionId,deliverableContractId,deliverableRevisionId:reservation.deliverableRevisionId,artifactIdentityId:reservation.artifactId,artifactRevisionId:reservation.artifactRevisionId,artifactRevision:reservation.artifactRevision,deliverableVersion:reservation.deliverableVersion,previousArtifactId:previousCompat?.id||null,jobId,runId,qa,source,storage:durable?'supabase-storage':'inline-development',bucket:durable?BUCKET:null,files:prepared.map(f=>({name:f.name,mimeType:f.mimeType,bytes:f.bytes,sha256:f.sha256,...(durable?{storagePath:`companies/${companyId}/deliverables/${deliverableContractId}/revisions/${reservation.deliverableRevisionId}/artifacts/${reservation.artifactRevisionId}/${f.name}`,bucket:BUCKET}:{content:isTextMime(f.mimeType)?f.buffer.toString('utf8'):undefined,base64:!isTextMime(f.mimeType)?f.buffer.toString('base64'):undefined})})),manifest},companyId,'staging');artifact.id=compatId;Object.assign(artifact,await put(artifact));
    await finalizeReservation(companyId,reservation,{manifest,qa:qa||validation,compatArtifactId:artifact.id,deliverableContractId});
    artifact.state='ready';Object.assign(artifact,await put(artifact,{expectedVersion:artifact.version}));
    return artifact;
  }catch(error){for(const path of uploaded.reverse())await deleteObject(path).catch(()=>false);await failReservation(companyId,reservation,error).catch(()=>{});throw error}
}

export async function loadArtifactFiles(artifactOrId){
  const artifact=typeof artifactOrId==='string'?await get(artifactOrId):artifactOrId;if(!artifact||artifact.kind!=='artifact')return null;
  const files=[];
  for(const f of artifact.data?.files||[]){
    let buffer;if(typeof f.content==='string')buffer=Buffer.from(f.content,'utf8');else if(typeof f.base64==='string')buffer=Buffer.from(f.base64,'base64');else if(f.storagePath)buffer=await downloadObject(f.storagePath);else continue;
    files.push({name:f.name,mimeType:f.mimeType,bytes:buffer.byteLength,sha256:f.sha256,buffer,...(isTextMime(f.mimeType)?{content:buffer.toString('utf8')}:{})});
  }
  return {artifact,files};
}

export async function artifactHistory(companyId,deliverableContractId){
  return (await list({companyId,kind:'artifact',limit:5000})).filter(x=>x.data?.deliverableContractId===deliverableContractId&&x.state==='ready').sort((a,b)=>Number(a.data?.deliverableVersion||1)-Number(b.data?.deliverableVersion||1));
}
