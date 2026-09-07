function configured(){return Boolean(process.env.TENSORMUX_BASE_URL&&process.env.TENSORMUX_API_KEY)}
function base(){return String(process.env.TENSORMUX_BASE_URL||'').replace(/\/$/,'')}
function model(){return process.env.TENSORMUX_RUNTIME_MODEL||process.env.TENSORMUX_MODEL||'glm-4-7-flash'}
function timeoutMs(){const n=Number(process.env.TENSORMUX_TIMEOUT_MS||60000);return Number.isFinite(n)?Math.min(180000,Math.max(5000,n)):60000}

export function tensormuxConfigured(){return configured()}

export async function auditRunWithTensorMux({mission,organization,job,run,traces,evaluation}){
  if(!configured())return{configured:false,skipped:true,reason:'tensormux_not_configured'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs());
  const payload={
    model:model(),
    temperature:0,
    response_format:{type:'json_object'},
    messages:[
      {role:'system',content:'You are an audit layer for an autonomous organization runtime. You do not decide whether execution passed and you cannot promote or modify the organization. Inspect the supplied persisted trace and return strict JSON with keys summary, anomalies (array of strings), recommendations (array of strings), confidence (0 to 1). Base every statement only on supplied evidence.'},
      {role:'user',content:JSON.stringify({
        mission:{outcome:mission?.outcome||'',metrics:mission?.metrics||[]},
        organization:{revision:organization?.revision,roles:(organization?.roles||[]).map(r=>({name:r.name,purpose:r.purpose}))},
        job:{id:job?.id,payload:job?.payload},
        run:{id:run?.id,status:run?.status,costUsd:run?.costUsd,latencyMs:run?.latencyMs,output:run?.output},
        evaluation:{passed:evaluation?.passed,results:evaluation?.results||[]},
        traces:(traces||[]).map(t=>({role:t.data?.roleName,capability:t.data?.capabilityName,status:t.data?.status,input:t.data?.input,output:t.data?.output,error:t.data?.error,latencyMs:t.data?.latencyMs,costUsd:t.data?.costUsd}))
      })}
    ]
  };
  try{
    const r=await fetch(`${base()}/chat/completions`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.TENSORMUX_API_KEY}`},body:JSON.stringify(payload),signal:controller.signal});
    const text=await r.text();
    let body;try{body=text?JSON.parse(text):{}}catch{body={raw:text.slice(0,5000)}}
    if(!r.ok)throw Object.assign(Error(`tensormux_http_${r.status}`),{details:body});
    const content=body?.choices?.[0]?.message?.content??'';
    let audit;try{audit=JSON.parse(content)}catch{audit={summary:String(content).slice(0,5000),anomalies:[],recommendations:[],confidence:null}}
    return{configured:true,skipped:false,model:model(),audit,usage:body?.usage||null,id:body?.id||null};
  }finally{clearTimeout(timer)}
}
