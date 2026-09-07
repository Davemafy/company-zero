import {mkdir,writeFile} from 'node:fs/promises';

const base=String(process.env.COMPANY_ZERO_BASE_URL||'').replace(/\/$/,'');
if(!base)throw Error('COMPANY_ZERO_BASE_URL_required');
const goal=process.env.CZ_GOLDEN_GOAL||'Improve the measurable performance of this deployed webpage without breaking it.';
let context={};try{context=JSON.parse(process.env.CZ_GOLDEN_CONTEXT_JSON||'{}')}catch{throw Error('CZ_GOLDEN_CONTEXT_JSON_invalid')}
let constraints={};try{constraints=JSON.parse(process.env.CZ_GOLDEN_CONSTRAINTS_JSON||'{"dailyBudgetUsd":1}')}catch{throw Error('CZ_GOLDEN_CONSTRAINTS_JSON_invalid')}
const timeoutMs=Math.max(60000,Math.min(30*60_000,Number(process.env.CZ_GOLDEN_TIMEOUT_MS)||12*60_000));
const autoApprove=['1','true','yes','on'].includes(String(process.env.CZ_GOLDEN_AUTO_APPROVE||'').toLowerCase());

const api=async(path,{method='GET',body}={})=>{const r=await fetch(`${base}/api/v1${path}`,{method,headers:{'content-type':'application/json'},body:body==null?undefined:JSON.stringify(body)});const text=await r.text();let value;try{value=text?JSON.parse(text):{}}catch{value={raw:text}}if(!r.ok)throw Object.assign(Error(value?.error||`http_${r.status}`),{status:r.status,details:value});return value};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const startedAt=new Date().toISOString();
const started=await api('/outcomes',{method:'POST',body:{goal,context,constraints}});
const companyId=started.company?.id||started.session?.company_id||started.company_id;
const sessionId=started.session?.id;
if(!companyId||!sessionId)throw Error('production_start_missing_ids');
let finalSession=null,approvalIds=[];
const deadline=Date.now()+timeoutMs;
while(Date.now()<deadline){
  const hydrated=await api(`/companies/${companyId}/sessions/${sessionId}`);finalSession=hydrated.session;
  const approvals=(await api(`/companies/${companyId}/approvals`)).items||[];
  const pending=approvals.filter(x=>x.state==='pending');
  for(const approval of pending){if(!autoApprove)continue;await api(`/companies/${companyId}/approvals/${approval.id}/decision`,{method:'POST',body:{decision:'approved',decidedBy:'production-verifier',reason:'Explicit CZ_GOLDEN_AUTO_APPROVE opt-in for controlled verification mission.'}});approvalIds.push(approval.id)}
  if(['completed','awaiting_capabilities','awaiting_operation_plan','failed','terminated'].includes(finalSession.state))break;
  await sleep(2000);
}
const [company,evidence,controls,experiments,world,workers]=await Promise.all([
  api(`/companies/${companyId}`),api(`/companies/${companyId}/evidence`),api(`/companies/${companyId}/controls`),api(`/companies/${companyId}/experiments`),api(`/companies/${companyId}/world`),api('/runtime/workers')
]);
const records=company.records||[],kind=k=>records.filter(x=>x.kind===k),e=(evidence.items||[]);
const traces=e.filter(x=>x.kind==='trace'),observations=e.filter(x=>x.kind==='outcome_observation'&&x.data?.classification==='EXTERNAL_OBSERVATION'),verifications=e.filter(x=>x.kind==='outcome_verification'),decisions=controls.decisions||[],promotions=e.filter(x=>x.kind==='promotion_decision');
const sideEffects=traces.filter(x=>x.data?.sideEffectState==='confirmed');
const duplicateKeys=new Map();for(const t of sideEffects){const key=JSON.stringify([t.data?.capabilityId,t.data?.input,t.data?.organizationRevisionId]);duplicateKeys.set(key,(duplicateKeys.get(key)||0)+1)}
const duplicates=[...duplicateKeys.entries()].filter(([,n])=>n>1);
const checks={
  mission:Boolean(kind('mission').length),
  outcomeContract:Boolean(kind('outcome_contract').length),
  worldModel:Boolean(world.items?.some(x=>x.kind==='world_model')),
  capabilityRequirements:Boolean(kind('capability_access_request').length||kind('operation_plan').length),
  strategy:Boolean(kind('strategy_selection').length),
  organization:Boolean(kind('organization_revision').length),
  operationPlan:Boolean(e.some(x=>x.kind==='operation_plan')),
  queueJob:Boolean(kind('job').some(x=>!x.data?.operation)),
  workerClaim:Boolean((workers.items||[]).some(x=>x.healthy)),
  externalAction:Boolean(sideEffects.length),
  externalObservation:Boolean(observations.length),
  outcomeVerification:Boolean(verifications.length),
  governor:Boolean(decisions.length),
  noDuplicateSideEffect:duplicates.length===0
};
const terminal=finalSession?.state||'timeout';
const pass=terminal==='completed'&&Object.values(checks).every(Boolean);
const report={startedAt,completedAt:new Date().toISOString(),base,companyId,sessionId,goal,terminal,autoApprovedApprovalIds:approvalIds,checks,counts:{traces:traces.length,externalObservations:observations.length,outcomeVerifications:verifications.length,governorDecisions:decisions.length,experiments:(experiments.items||[]).length,promotions:promotions.length,sideEffects:sideEffects.length},duplicates,verdict:pass?'COMPANY ZERO END-TO-END: PASS':'COMPANY ZERO END-TO-END: FAIL'};
await mkdir('reports',{recursive:true});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const jsonPath=`reports/production-golden-path-${stamp}.json`,mdPath=`reports/production-golden-path-${stamp}.md`;await writeFile(jsonPath,JSON.stringify(report,null,2));
const rows=Object.entries(checks).map(([k,v])=>`| ${k} | ${v?'PASS':'FAIL'} |`).join('\n');await writeFile(mdPath,`# Company Zero production golden-path verification\n\n- Started: ${report.startedAt}\n- Completed: ${report.completedAt}\n- Company: ${companyId}\n- Session: ${sessionId}\n- Terminal state: ${terminal}\n- Goal: ${goal}\n\n| Check | Result |\n|---|---|\n${rows}\n\n## Counts\n\n\`\`\`json\n${JSON.stringify(report.counts,null,2)}\n\`\`\`\n\n## Verdict\n\n**${report.verdict}**\n`);
console.log(JSON.stringify({...report,reportFiles:[jsonPath,mdPath]},null,2));
