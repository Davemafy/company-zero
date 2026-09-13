import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';
import {searchPublicWeb} from './public-web.mjs';

const timeoutMs=()=>Math.max(2000,Math.min(8000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||4500)));

function fallbackInstantValue(text,reason='model_unavailable',publicEvidence=null){
  const short=text.slice(0,90);
  const sources=(publicEvidence?.results||[]).slice(0,8);
  const sourceBlock=sources.length?`\n\n## Public evidence collected\n${sources.map((x,i)=>`${i+1}. ${x.title||x.url}\n   ${x.url}${x.snippet?`\n   ${x.snippet}`:''}`).join('\n')}`:'';
  const content=`# First useful artifact\n\n## Objective\n${text}\n\n## Working brief\nCompany Zero accepted the mission and created a usable starting artifact immediately instead of leaving the screen blocked.\n\n## What is known\n- The requested outcome is: ${text}\n- No external facts, contacts, purchases, messages, measurements, or completed actions are claimed without evidence.${sourceBlock}\n\n## Immediate execution frame\n1. Turn the request into concrete acceptance criteria.\n2. Use the public evidence above when the task depends on current external facts.\n3. Produce the next artifact revision from grounded evidence.\n4. Ask for access only when a specific irreversible or external action reaches the execution frontier.\n\n## Truth boundary\nThis is an immediate recovery artifact. It exists so the user receives durable value even when the fast model path is unavailable. External outcomes remain unverified until grounded evidence exists.\n`;
  return {title:`First artifact — ${short}`,summary:'Immediate durable working artifact.',files:[{name:'first-artifact.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:String(reason||'model_unavailable'),model:null};
}
const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';

async function collectEvidence(text,context){
  const route=String(context?.interactionRoute||'');
  const needsFreshEvidence=Boolean(context?.needsFreshEvidence)||route==='investigate';
  if(!needsFreshEvidence)return null;
  try{return await searchPublicWeb(text,{limit:8,timeoutMs:2200})}
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
    system:`You are Company Zero's instant-value worker. Your only job is to give the user something concretely useful within seconds. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.

Rules:
- Produce an actual usable artifact, not status copy and not a description of future work.
- Keep it compact enough to generate quickly.
- Infer low-risk reversible assumptions instead of asking setup questions.
- If the request depends on unavailable external/current facts, do NOT invent them.
- When publicEvidence is present, treat its URLs/titles/snippets as the only grounded external facts available for this fast pass. Cite the source URL next to every lead, company, current claim, or factual recommendation derived from it.
- For lead/client/prospect tasks, return a concrete ranked shortlist only when publicEvidence supports it. If the evidence is insufficient, return the strongest grounded shortlist you can and clearly mark what still needs verification.
- Never claim purchases, messages sent, customers found, money raised, deployments, measurements, or other external outcomes without supplied evidence.
- Prefer 1-3 files maximum.
- The result is a real working artifact. It may be revised later, but it must already be useful now.`,
    user:JSON.stringify({request:text,context,publicEvidence})
  });}
  catch(error){return fallbackInstantValue(text,error?.message||'instant_value_failed',publicEvidence)}
  const raw=r.json||{};const files=[];const seen=new Set();
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,3):[]){const name=safeName(f?.name);if(seen.has(name))continue;const content=String(f?.content||'').trim();if(content.length<40)continue;seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)});}
  if(!files.length)return fallbackInstantValue(text,'instant_value_empty',publicEvidence);
  return {title:String(raw.title||`First useful draft — ${text.slice(0,60)}`).slice(0,120),summary:String(raw.summary||'Immediate useful draft while deeper work continues.').slice(0,400),files,provisional:true,model:r.model||null,usage:r.usage||null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,resultCount:publicEvidence.results.length}:null};
}
