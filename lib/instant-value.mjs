import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';

const timeoutMs=()=>Math.max(2000,Math.min(8000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||4500)));

function fallbackInstantValue(text,reason='model_unavailable'){
  const short=text.slice(0,90);
  const content=`# First useful artifact\n\n## Objective\n${text}\n\n## Working brief\nCompany Zero accepted the mission and created a usable starting artifact immediately instead of leaving the screen blocked.\n\n## What is known\n- The requested outcome is: ${text}\n- No external facts, contacts, purchases, messages, measurements, or completed actions are claimed without evidence.\n\n## Immediate execution frame\n1. Turn the request into concrete acceptance criteria.\n2. Gather only the external evidence needed to make the next useful version stronger.\n3. Produce the next artifact revision from that evidence.\n4. Ask for access only when a specific irreversible or external action reaches the execution frontier.\n\n## Truth boundary\nThis is an immediate recovery artifact. It exists so the user receives durable value even when the fast model path is unavailable. Deeper work should replace it with evidence-backed output.\n`;
  return {title:`First artifact — ${short}`,summary:'Immediate durable working artifact.',files:[{name:'first-artifact.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:String(reason||'model_unavailable'),model:null};
}
const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';

export async function buildInstantValue({request,context=null}={}){
  const text=String(request||'').trim();
  if(!text)throw new DomainError('instant_value_request_required',422);
  if(!tensormuxConfigured())return fallbackInstantValue(text,'instant_value_model_not_configured');
  let r;
  try{r=await completeJsonWithTensorMux({
    timeoutMs:timeoutMs(),
    system:`You are Company Zero's instant-value worker. Your only job is to give the user something concretely useful within seconds. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.

Rules:
- Produce an actual usable artifact, not status copy and not a description of future work.
- Keep it compact enough to generate quickly.
- Infer low-risk reversible assumptions instead of asking setup questions.
- If the request depends on unavailable external/current facts, do NOT invent them. Produce the strongest useful working artifact that can be created truthfully now: criteria, structure, copy, checklist, decision frame, draft, query plan, or execution-ready scaffold as appropriate.
- Never claim purchases, messages sent, customers found, money raised, deployments, measurements, or other external outcomes without supplied evidence.
- Prefer 1-3 files maximum.
- The result is a real working artifact. It may be revised later, but it must already be useful now.`,
    user:JSON.stringify({request:text,context})
  });}
  catch(error){return fallbackInstantValue(text,error?.message||'instant_value_failed')}
  const raw=r.json||{};const files=[];const seen=new Set();
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,3):[]){const name=safeName(f?.name);if(seen.has(name))continue;const content=String(f?.content||'').trim();if(content.length<40)continue;seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)});}
  if(!files.length)return fallbackInstantValue(text,'instant_value_empty');
  return {title:String(raw.title||`First useful draft — ${text.slice(0,60)}`).slice(0,120),summary:String(raw.summary||'Immediate useful draft while deeper work continues.').slice(0,400),files,provisional:true,model:r.model||null,usage:r.usage||null};
}
