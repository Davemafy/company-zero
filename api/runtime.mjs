import {executeReferenceWorkload} from '../lib/runtime-core.mjs';
import {json,body,method} from './_utils.mjs';
const BASE=(process.env.TENSORMUX_BASE_URL||'').replace(/\/$/,'');
const KEY=process.env.TENSORMUX_API_KEY||'';
const MODEL=process.env.TENSORMUX_RUNTIME_MODEL||process.env.TENSORMUX_MODEL||'llama-3.1-8b';
export default async function handler(req,res){
  if(!method(req,res,['POST'])) return;
  try{
    const {mission,org,mode='reference'}=await body(req); if(!mission?.workload||!Array.isArray(org?.roles))return json(res,400,{ok:false,error:'invalid_payload'});
    const base=executeReferenceWorkload(mission,org); if(mode!=='live'||!BASE)return json(res,200,{ok:true,run:base,provider:BASE?'reference':'reference_no_provider'});
    const enriched=[]; for(const trace of base.traces){const outcome=base.outcomes.find(x=>x.id===trace.item);try{const started=Date.now();const r=await fetch(`${BASE}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',...(KEY?{authorization:`Bearer ${KEY}`}:{})},body:JSON.stringify({model:MODEL,temperature:0,max_tokens:180,messages:[{role:'system',content:'You are an execution auditor inside Company Zero. Do not change outcomes. Explain in one short JSON object which observed signals justify the runtime decision. Return JSON only.'},{role:'user',content:JSON.stringify({mission:{title:mission.title,domain:mission.domain,constraints:mission.constraints},trace,outcome})}]})});if(r.ok){const raw=await r.json();enriched.push({item:trace.item,model:MODEL,latencyMs:Date.now()-started,audit:parseJson(raw?.choices?.[0]?.message?.content||'{}')})}}catch{}}
    return json(res,200,{ok:true,run:{...base,mode:'live-tools+tensormux-audit',modelAudits:enriched},provider:'tensormux'});
  }catch(e){return json(res,500,{ok:false,error:'runtime_exception',detail:String(e?.message||e)})}
}
function parseJson(text){const c=text.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();try{return JSON.parse(c)}catch{}const s=c.indexOf('{'),e=c.lastIndexOf('}');if(s>=0&&e>s)return JSON.parse(c.slice(s,e+1));return {note:c.slice(0,240)}}
