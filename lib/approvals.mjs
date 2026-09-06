import {get,put,storageMode} from './store.mjs';

const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const memory=globalThis.__CZ_APPROVALS__||(globalThis.__CZ_APPROVALS__=new Map());
const headers=()=>({'content-type':'application/json',apikey:KEY,authorization:`Bearer ${KEY}`,'prefer':'return=representation'});
const now=()=>new Date().toISOString();

export async function approvalForInvocation({companyId,jobId,runId,organizationRevisionId,roleId,capabilityId,reason,risk,args,invocationKey}){
  if(storageMode()==='development-memory'){
    const existing=[...memory.values()].find(x=>x.company_id===companyId&&x.invocation_key===invocationKey);
    if(existing)return structuredClone(existing);
    const row={id:crypto.randomUUID(),company_id:companyId,job_id:jobId,run_id:runId,invocation_id:crypto.randomUUID(),invocation_key:invocationKey,organization_revision_id:organizationRevisionId,role_id:roleId,capability_id:capabilityId,reason,risk,arguments:args,state:'pending',decided_by:null,decision_reason:null,decided_at:null,created_at:now()};
    memory.set(row.id,row);return structuredClone(row);
  }
  const qs=new URLSearchParams({company_id:`eq.${companyId}`,invocation_key:`eq.${invocationKey}`,select:'*',limit:'1'});
  let r=await fetch(`${URL}/rest/v1/cz_approvals?${qs}`,{headers:headers()}),rows=await r.json();
  if(!r.ok)throw Error(rows.message||'approval_read_failed');
  const existing=rows[0];
  if(existing)return existing;
  const row={company_id:companyId,job_id:jobId,run_id:runId,invocation_id:crypto.randomUUID(),invocation_key:invocationKey,organization_revision_id:organizationRevisionId,role_id:roleId,capability_id:capabilityId,reason,risk,arguments:{input:args},state:'pending'};
  r=await fetch(`${URL}/rest/v1/cz_approvals?on_conflict=company_id,invocation_key`,{method:'POST',headers:{...headers(),prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(row)});rows=await r.json();if(!r.ok)throw Error(rows.message||'approval_write_failed');if(rows[0])return rows[0];const reread=await fetch(`${URL}/rest/v1/cz_approvals?${qs}`,{headers:headers()}),found=await reread.json();if(!reread.ok||!found[0])throw Error(found.message||'approval_write_race');return found[0];
}

export async function getApproval(id){
  if(storageMode()==='development-memory')return structuredClone(memory.get(id)||null);
  const r=await fetch(`${URL}/rest/v1/cz_approvals?id=eq.${id}&select=*`,{headers:headers()}),x=await r.json();if(!r.ok)throw Error(x.message||'approval_read_failed');return x[0]||null;
}

export async function decideApproval(id,{decision,decidedBy='user',reason=''}){
  if(!['approved','rejected'].includes(decision))throw Object.assign(Error('invalid_approval_decision'),{status:422});
  if(storageMode()==='development-memory'){
    const row=memory.get(id);if(!row)throw Object.assign(Error('approval_not_found'),{status:404});if(row.state!=='pending')throw Object.assign(Error('approval_already_decided'),{status:409});
    row.state=decision;row.decided_by=decidedBy;row.decision_reason=reason;row.decided_at=now();memory.set(id,row);return structuredClone(row);
  }
  const r=await fetch(`${URL}/rest/v1/cz_approvals?id=eq.${id}&state=eq.pending`,{method:'PATCH',headers:headers(),body:JSON.stringify({state:decision,decided_by:decidedBy,decision_reason:reason,decided_at:now()})}),x=await r.json();if(!r.ok)throw Error(x.message||'approval_write_failed');if(!x.length)throw Object.assign(Error('approval_already_decided_or_missing'),{status:409});return x[0];
}

export async function listApprovals(companyId){
  if(storageMode()==='development-memory')return [...memory.values()].filter(x=>x.company_id===companyId).map(x=>structuredClone(x));
  const r=await fetch(`${URL}/rest/v1/cz_approvals?company_id=eq.${companyId}&select=*&order=created_at.desc&limit=500`,{headers:headers()}),x=await r.json();if(!r.ok)throw Error(x.message||'approval_read_failed');return x;
}
