const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const memory=globalThis.__CZ_DEV_STORE__||(globalThis.__CZ_DEV_STORE__={records:new Map(),audit:[]});

export function storageMode(){return URL&&KEY?'supabase':process.env.NODE_ENV==='production'?'unconfigured':'development-memory'}
function headers(){return {'content-type':'application/json',apikey:KEY,authorization:`Bearer ${KEY}`,'prefer':'return=representation'}}
function assertDurable(){if(storageMode()==='unconfigured')throw Object.assign(Error('durable_storage_not_configured'),{status:503})}

export async function put(record,{expectedVersion}={}){
  assertDurable(); const now=new Date().toISOString(); const row={...record,updated_at:now};
  if(storageMode()==='development-memory'){
    const old=memory.records.get(row.id); if(expectedVersion!=null&&old?.version!==expectedVersion)throw Object.assign(Error('stale_version'),{status:409});
    row.created_at=old?.created_at||now; row.version=(old?.version||0)+1; memory.records.set(row.id,structuredClone(row)); return row;
  }
  if(expectedVersion!=null){
    const r=await fetch(`${URL}/rest/v1/cz_records?id=eq.${record.id}&version=eq.${expectedVersion}`,{method:'PATCH',headers:headers(),body:JSON.stringify({...row,version:expectedVersion+1})});
    const out=await r.json(); if(!r.ok)throw Error(out.message||'storage_write_failed'); if(!out.length)throw Object.assign(Error('stale_version'),{status:409}); return out[0];
  }
  const r=await fetch(`${URL}/rest/v1/cz_records?on_conflict=id`,{method:'POST',headers:{...headers(),prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
  const out=await r.json(); if(!r.ok)throw Error(out.message||'storage_write_failed'); return out[0];
}
export async function get(id){assertDurable();if(storageMode()==='development-memory')return structuredClone(memory.records.get(id)||null);const r=await fetch(`${URL}/rest/v1/cz_records?id=eq.${id}&select=*`,{headers:headers()});const x=await r.json();if(!r.ok)throw Error(x.message||'storage_read_failed');return x[0]||null}
export async function list({companyId,kind,limit=100}={}){assertDurable();if(storageMode()==='development-memory')return [...memory.records.values()].filter(x=>(!companyId||x.company_id===companyId)&&(!kind||x.kind===kind)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,limit).map(x=>structuredClone(x));let q=`select=*&order=updated_at.desc&limit=${Math.min(limit,500)}`;if(companyId)q+=`&company_id=eq.${companyId}`;if(kind)q+=`&kind=eq.${encodeURIComponent(kind)}`;const r=await fetch(`${URL}/rest/v1/cz_records?${q}`,{headers:headers()});const x=await r.json();if(!r.ok)throw Error(x.message||'storage_read_failed');return x}
export async function audit(event){assertDurable();const row={id:crypto.randomUUID(),...event,created_at:new Date().toISOString()};if(storageMode()==='development-memory'){memory.audit.push(row);return row}const r=await fetch(`${URL}/rest/v1/cz_audit_events`,{method:'POST',headers:headers(),body:JSON.stringify(row)});const x=await r.json();if(!r.ok)throw Error(x.message||'audit_write_failed');return x[0]}
