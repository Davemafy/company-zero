export function stableStringify(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function collectSessionLineage(records=[],sessionId){
  const session=records.find(x=>x.id===sessionId&&x.kind==='operating_session')||null;
  const jobIds=new Set(records.filter(x=>x.kind==='job'&&(x.data?.operatingSessionId===sessionId||x.id===session?.data?.jobId)).map(x=>x.id));
  if(session?.data?.jobId)jobIds.add(session.data.jobId);
  const runIds=new Set(records.filter(x=>x.kind==='run'&&jobIds.has(x.data?.jobId)).map(x=>x.id));
  for(const job of records.filter(x=>x.kind==='job'&&jobIds.has(x.id)))if(job.data?.runId)runIds.add(job.data.runId);
  return{session,jobIds,runIds};
}

export function approvalsForLineage(approvals=[],lineage){
  return approvals.filter(x=>x.state==='pending'&&(lineage.runIds.has(x.run_id)||lineage.jobIds.has(x.job_id)));
}

export function duplicateConfirmedSideEffects(traces=[]){
  const counts=new Map();
  for(const t of traces.filter(x=>x.data?.sideEffectState==='confirmed')){
    const key=stableStringify({capabilityId:t.data?.capabilityId||null,input:t.data?.input||null,organizationRevisionId:t.data?.organizationRevisionId||null});
    counts.set(key,(counts.get(key)||0)+1);
  }
  return[...counts.entries()].filter(([,count])=>count>1).map(([fingerprint,count])=>({fingerprint,count}));
}

export function terminalVerdict({terminal,checks}){
  const pass=terminal==='completed'&&Object.values(checks).every(Boolean);
  return{pass,verdict:pass?'COMPANY ZERO END-TO-END: PASS':'COMPANY ZERO END-TO-END: FAIL'};
}
