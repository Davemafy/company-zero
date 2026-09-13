import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';
import {searchPublicWeb} from './public-web.mjs';

const timeoutMs=()=>Math.max(5000,Math.min(18000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||14000)));

function fallbackInstantValue(text,reason='model_unavailable',publicEvidence=null){
  const short=text.slice(0,90);
  const sources=(publicEvidence?.results||[]).slice(0,10);
  const sourceBlock=sources.length?`\n\n## Grounded public evidence\n${sources.map((x,i)=>`${i+1}. **${x.title||x.url}**\n   ${x.url}${x.snippet?`\n   ${x.snippet}`:''}`).join('\n\n')}`:'';
  const content=sources.length
    ? `# Evidence-backed first pass\n\n## Objective\n${text}\n\nCompany Zero gathered live public-web evidence, but the reasoning pass did not complete in time. The evidence is preserved below so the user gets real research instead of a fake progress screen.${sourceBlock}\n\n## Next useful move\nUse these sources to rank the strongest candidates against the mission, verify fit/contact details, then produce the next revision. No external action is claimed as completed.`
    : `# First useful artifact\n\n## Objective\n${text}\n\n## Current result\nThe mission was accepted, but live research/reasoning was unavailable during this request. No fake leads, measurements, or completed actions are being invented.\n\n## Next useful move\nRetry the mission or revise this artifact when live evidence is available. Company Zero should not call this outcome complete.`;
  return {title:sources.length?`Evidence collected — ${short}`:`Couldn’t complete research — ${short}`,summary:sources.length?`${sources.length} live public sources were captured; ranking still needs completion.`:'The request was saved, but a truthful useful result could not be completed yet.',files:[{name:sources.length?'public-evidence.md':'research-unavailable.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:String(reason||'model_unavailable'),model:null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,results:sources}:null};
}
const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';

async function collectEvidence(text,context){
  const route=String(context?.interactionRoute||'');
  const needsFreshEvidence=Boolean(context?.needsFreshEvidence)||route==='investigate';
  if(!needsFreshEvidence)return null;
  try{return await searchPublicWeb(text,{limit:10,timeoutMs:1800})}
  catch(error){return {ok:false,queries:[],results:[],reason:error?.message||'public_search_failed'}}
}

export async function buildInstantValue({request,context=null}={}){
  const text=String(request||'').trim();
  if(!text)throw new DomainError('instant_value_request_required',422);
  const publicEvidence=await collectEvidence(text,context);
  if(!tensormuxConfigured())return fallbackInstantValue(text,'instant_value_model_not_configured',publicEvidence);
  let r;
  try{r=await completeJsonWithTensorMux({
    timeoutMs:timeoutMs(),
    system:`You are Company Zero's instant-value worker. Give the user a useful result, not workflow theatre. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.

Rules:
- Produce the requested result as far as the supplied evidence allows.
- Do not output status prose, architecture notes, setup instructions, or a generic future-work checklist unless the user explicitly asked for those.
- Infer low-risk reversible assumptions instead of asking setup questions.
- If publicEvidence exists, use it. Every current factual claim, lead, prospect, company, contact path, or recommendation derived from the web must include its source URL.
- For lead/client/prospect tasks, rank concrete candidates. Explain fit, likely value, and a next outreach angle. Do not call a candidate verified if the evidence does not support that.
- If evidence is weak, say exactly which fields remain unverified, but still return the strongest grounded shortlist possible.
- Never claim purchases, messages sent, customers won, deployments, measurements, or external changes without evidence.
- Prefer 1-3 files maximum and make the primary file immediately readable/useful.`,
    user:JSON.stringify({request:text,context,publicEvidence})
  });}
  catch(error){return fallbackInstantValue(text,error?.message||'instant_value_failed',publicEvidence)}
  const raw=r.json||{};const files=[];const seen=new Set();
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,3):[]){const name=safeName(f?.name);if(seen.has(name))continue;const content=String(f?.content||'').trim();if(content.length<80)continue;seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)});}
  if(!files.length)return fallbackInstantValue(text,'instant_value_empty',publicEvidence);
  return {title:String(raw.title||`Result — ${text.slice(0,60)}`).slice(0,120),summary:String(raw.summary||'A useful first result is ready.').slice(0,400),files,provisional:true,degraded:false,model:r.model||null,usage:r.usage||null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,results:(publicEvidence.results||[]).slice(0,10)}:null};
}
