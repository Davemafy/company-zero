import {json,body,method} from './_utils.mjs';
const BASE=(process.env.TENSORMUX_BASE_URL||'').replace(/\/$/,'');
const KEY=process.env.TENSORMUX_API_KEY||'';
const MODEL=process.env.TENSORMUX_MODEL||'llama-3.1-8b';
const actions=new Set(['synthesize','diagnose','propose']);
export default async function handler(req,res){
  if(!method(req,res,['POST'])) return;
  if(!BASE)return json(res,503,{ok:false,error:'brain_not_configured'});
  try{
    const {action,payload}=await body(req); if(!actions.has(action))return json(res,400,{ok:false,error:'invalid_action'});
    const started=Date.now(); const r=await fetch(`${BASE}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',...(KEY?{authorization:`Bearer ${KEY}`}:{})},body:JSON.stringify({model:MODEL,temperature:.08,max_tokens:1400,messages:[{role:'system',content:'You are Company Zero Organization Brain. Design organizations, diagnose organizational failures, and propose structural changes. Never grade your own proposal. Never invent outcomes or evidence IDs. Use only AVAILABLE_TOOLS. Return strict JSON only.'},{role:'user',content:prompt(action,payload)}]})});
    if(!r.ok)return json(res,502,{ok:false,error:`provider_${r.status}`,detail:(await r.text()).slice(0,400)});
    const raw=await r.json(), text=raw?.choices?.[0]?.message?.content||''; return json(res,200,{ok:true,source:'tensormux',model:MODEL,latencyMs:Date.now()-started,result:parse(text)});
  }catch(e){return json(res,500,{ok:false,error:'brain_exception',detail:String(e?.message||e)})}
}
function prompt(a,p){if(a==='synthesize')return `MISSION=${JSON.stringify(p.mission)}\nAVAILABLE_TOOLS=${JSON.stringify(p.availableTools)}\nMEMORY=${JSON.stringify(p.memory||[])}\nDesign the SMALLEST organization that can attempt the mission. Return {"roles":[{"name":"...","tool":"available tool","purpose":"...","instructions":"bounded role instruction"}],"rationale":"..."}.`;if(a==='diagnose')return `MISSION=${JSON.stringify(p.mission)}\nCURRENT_ORG=${JSON.stringify(p.org)}\nFAILED_OUTCOMES=${JSON.stringify(p.failures)}\nFAILED_TRACES=${JSON.stringify(p.traces)}\nAVAILABLE_TOOLS=${JSON.stringify(p.availableTools)}\nInfer the smallest failure supported by supplied evidence. Return {"failureMode":"capability_gap|ordering_gap|tool_gap|verification_gap|local_failure","confidence":0.0,"evidenceIds":["failed IDs only"],"reason":"...","neededCapability":{"name":"...","tool":"available tool or null","purpose":"...","instructions":"..."}}.`;return `MISSION=${JSON.stringify(p.mission)}\nCURRENT_ORG=${JSON.stringify(p.org)}\nDIAGNOSIS=${JSON.stringify(p.diagnosis)}\nAVAILABLE_TOOLS=${JSON.stringify(p.availableTools)}\nPropose at most 3 minimal competing restructures. Do not predict success. Return {"mutations":[{"type":"add_role|remove_role|move_role|swap_tool|insert_verifier","label":"...","evidenceIds":["diagnosis IDs only"],"role":{"name":"...","tool":"available tool","purpose":"...","instructions":"..."},"targetIndex":0,"insertIndex":0,"rationale":"..."}]}.`}
function parse(t){const c=t.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();try{return JSON.parse(c)}catch{}const s=c.indexOf('{'),e=c.lastIndexOf('}');if(s>=0&&e>s)return JSON.parse(c.slice(s,e+1));throw new Error('non_json')}
