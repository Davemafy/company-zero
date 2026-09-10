import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';

const timeoutMs=()=>Math.max(3000,Math.min(15000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||9000)));
const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';

export async function buildInstantValue({request,context=null}={}){
  const text=String(request||'').trim();
  if(!text)throw new DomainError('instant_value_request_required',422);
  if(!tensormuxConfigured()){
    if(process.env.NODE_ENV==='production')throw new DomainError('instant_value_model_not_configured',503);
    return {title:`First useful draft — ${text.slice(0,60)}`,summary:'Immediate development draft while deeper work continues.',files:[{name:'first-value.md',mimeType:'text/markdown',content:`# First useful draft\n\n## Request\n${text}\n\n## What I can give you immediately\nA concrete first-pass artifact is available now while deeper evidence-backed work continues.\n\n## Truth boundary\nNo external fact or action is claimed in this development fallback.\n`}],provisional:true,model:null};
  }
  const r=await completeJsonWithTensorMux({
    timeoutMs:timeoutMs(),
    system:`You are Company Zero's instant-value worker. Your only job is to give the user something concretely useful within seconds while deeper work continues. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.

Rules:
- Produce an actual usable artifact, not status copy and not a description of future work.
- Keep it compact enough to generate quickly.
- Infer low-risk reversible assumptions instead of asking setup questions.
- If the request depends on unavailable external/current facts, do NOT invent them. Produce the strongest useful working artifact that can be created truthfully now: criteria, structure, copy, checklist, decision frame, draft, query plan, or execution-ready scaffold as appropriate.
- Never claim purchases, messages sent, customers found, money raised, deployments, measurements, or other external outcomes without supplied evidence.
- Prefer 1-3 files maximum.
- The result is a provisional first-value artifact; deeper Company Zero work may replace it later.`,
    user:JSON.stringify({request:text,context})
  });
  const raw=r.json||{};const files=[];const seen=new Set();
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,3):[]){const name=safeName(f?.name);if(seen.has(name))continue;const content=String(f?.content||'').trim();if(content.length<40)continue;seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)});}
  if(!files.length)throw new DomainError('instant_value_empty',502);
  return {title:String(raw.title||`First useful draft — ${text.slice(0,60)}`).slice(0,120),summary:String(raw.summary||'Immediate useful draft while deeper work continues.').slice(0,400),files,provisional:true,model:r.model||null,usage:r.usage||null};
}
