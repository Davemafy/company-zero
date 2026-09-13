import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';
import {searchPublicWeb} from './public-web.mjs';

const timeoutMs=()=>Math.max(5000,Math.min(18000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||14000)));

function fallbackInstantValue(text,reason='model_unavailable',publicEvidence=null){
  const short=text.slice(0,90);const sources=(publicEvidence?.results||[]).slice(0,10);
  const sourceBlock=sources.length?`\n\n## Grounded public evidence\n${sources.map((x,i)=>`${i+1}. **${x.title||x.url}**\n   ${x.url}${x.snippet?`\n   ${x.snippet}`:''}`).join('\n\n')}`:'';
  const content=sources.length
    ? `# Evidence collected\n\n## Objective\n${text}\n\nLive public evidence was collected, but the reasoning pass did not finish in time.${sourceBlock}\n\nNo lead or outcome is being claimed beyond what those sources support.`
    : `# Result unavailable\n\n## Objective\n${text}\n\nCompany Zero could not complete live research/reasoning for this request. No fake leads, measurements, or completed actions are being invented.`;
  return {title:sources.length?`Evidence collected — ${short}`:`Couldn’t complete — ${short}`,summary:sources.length?`${sources.length} live public sources were captured; synthesis did not complete.`:'The request was saved, but a truthful useful result could not be completed yet.',files:[{name:sources.length?'public-evidence.md':'result-unavailable.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:String(reason||'model_unavailable'),model:null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,results:sources}:null};
}

function missingLeadContextArtifact(text,brand='this brand'){
  const safeBrand=String(brand||'this brand').replace(/[^a-z0-9 &._'-]/gi,'').trim()||'this brand';
  const content=`# I need one detail before I can find real prospects\n\nI can find and rank the 5 serious prospects, but I cannot reliably identify **${safeBrand}** or what it sells from the request/public search alone.\n\nSend **either**:\n- the store / product / Instagram URL, **or**\n- what ${safeBrand} sells and the market you want to target.\n\nThat is enough. I will use it to research actual prospects and return names, fit, source links, and an outreach angle. I will not pad the list with invented leads.`;
  return {title:`One detail needed for ${safeBrand}`,summary:`Send ${safeBrand}'s URL or what it sells. Then I can research 5 real prospects instead of guessing.`,files:[{name:'one-detail-needed.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:'missing_brand_context',needsInput:true,question:`Send ${safeBrand}'s store/product URL, or tell me what it sells and the target market.`,model:null,publicEvidence:null};
}

function leadContextGap(text,evidence){
  const lower=String(text||'').toLowerCase();if(!/\b(clients?|customers?|leads?|prospects?)\b/.test(lower))return null;
  if(/https?:\/\//i.test(text)||/\b(?:we|i|it|brand|business)\s+(?:sell|sells|selling|offer|offers|make|makes)\b/i.test(text))return null;
  const match=String(text||'').match(/\bbrand\s+([a-z0-9][a-z0-9&'._-]{1,50})\b/i);if(!match)return null;
  const brand=match[1];const needle=brand.toLowerCase();
  const identified=(evidence?.results||[]).some(item=>{const hay=`${item.title||''} ${item.snippet||''} ${item.url||''}`.toLowerCase();return hay.includes(needle)&&/\b(brand|shop|store|e-?commerce|retail|official|products?|about|contact)\b/.test(hay)});
  return identified?null:{brand};
}

const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';

async function collectEvidence(text,context){
  const route=String(context?.interactionRoute||'');const needsFreshEvidence=Boolean(context?.needsFreshEvidence)||route==='investigate';if(!needsFreshEvidence)return null;
  try{return await searchPublicWeb(text,{limit:8,timeoutMs:1800})}catch(error){return {ok:false,queries:[],results:[],reason:error?.message||'public_search_failed'}}
}

export async function buildInstantValue({request,context=null}={}){
  const text=String(request||'').trim();if(!text)throw new DomainError('instant_value_request_required',422);
  const publicEvidence=await collectEvidence(text,context);
  const contextGap=leadContextGap(text,publicEvidence);if(contextGap)return missingLeadContextArtifact(text,contextGap.brand);
  if(!tensormuxConfigured())return fallbackInstantValue(text,'instant_value_model_not_configured',publicEvidence);
  let r;
  try{r=await completeJsonWithTensorMux({
    timeoutMs:timeoutMs(),
    system:`You are Company Zero's instant-value worker. Give the user the requested result, not workflow theatre. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.
Rules:
- Produce the requested result as far as supplied evidence allows.
- No status prose, architecture notes, setup instructions, or generic future-work checklist unless requested.
- Infer low-risk reversible assumptions.
- If publicEvidence exists, every current factual claim, lead, prospect, company, contact path, or recommendation derived from the web must include its source URL.
- For lead/client/prospect tasks, rank concrete candidates with fit, source URL, and a specific outreach angle. Do not call a candidate verified unless evidence supports it.
- If evidence is insufficient for the requested result, say exactly what single user detail is missing rather than inventing candidates.
- Never claim purchases, messages sent, customers won, deployments, measurements, or external changes without evidence.
- Prefer 1-3 immediately useful files.`,
    user:JSON.stringify({request:text,context,publicEvidence})
  });}catch(error){return fallbackInstantValue(text,error?.message||'instant_value_failed',publicEvidence)}
  const raw=r.json||{};const files=[];const seen=new Set();
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,3):[]){const name=safeName(f?.name);if(seen.has(name))continue;const content=String(f?.content||'').trim();if(content.length<80)continue;seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)});}
  if(!files.length)return fallbackInstantValue(text,'instant_value_empty',publicEvidence);
  return {title:String(raw.title||`Result — ${text.slice(0,60)}`).slice(0,120),summary:String(raw.summary||'A useful first result is ready.').slice(0,400),files,provisional:true,degraded:false,model:r.model||null,usage:r.usage||null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,results:(publicEvidence.results||[]).slice(0,8)}:null};
}
