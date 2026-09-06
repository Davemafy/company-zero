function configured(){return Boolean((process.env.NEATLOGS_WRITE_KEY||process.env.NEATLOGS_API_KEY)&&process.env.NEATLOGS_PROJECT)}
function key(){return process.env.NEATLOGS_WRITE_KEY||process.env.NEATLOGS_API_KEY||''}
function base(){return String(process.env.NEATLOGS_INGEST_URL||'https://ingest.neatlogs.com').replace(/\/$/,'')}
const clean=v=>v===undefined?null:v;

export function neatlogsConfigured(){return configured()}

export async function exportRunToNeatlogs({company,mission,organization,job,run,traces,evaluation,modelAudit}){
  if(!configured())return{configured:false,skipped:true,reason:'neatlogs_not_configured'};
  const children=(traces||[]).map(t=>({
    name:t.data?.roleName||t.data?.capabilityName||'runtime step',
    kind:'TOOL',
    tool_name:t.data?.capabilityName||'capability',
    input:clean(t.data?.input),
    output:clean(t.data?.output??(t.data?.error?{error:t.data.error}:null)),
    duration_ms:Number(t.data?.latencyMs||0),
    attributes:{
      'neatlogs.tool.status':String(t.data?.status||t.state||''),
      'neatlogs.tool.capability_id':String(t.data?.capabilityId||''),
      'neatlogs.tool.role_id':String(t.data?.roleId||'')
    }
  }));
  children.push({
    name:'independent evaluation',kind:'EVALUATOR',
    input:{missionMetrics:mission?.metrics||[],runStatus:run?.status},
    output:{passed:evaluation?.passed,results:evaluation?.results||[]},
    attributes:{'neatlogs.evaluator.name':String(evaluation?.evaluator||'independent_contract')}
  });
  if(modelAudit&&!modelAudit.skipped)children.push({
    name:'TensorMux trace audit',kind:'LLM',model:modelAudit.model,
    input:{runId:run?.id,evaluationId:evaluation?.id},output:modelAudit.audit,
    tokens:modelAudit.usage?{prompt:Number(modelAudit.usage.prompt_tokens||0),completion:Number(modelAudit.usage.completion_tokens||0),total:Number(modelAudit.usage.total_tokens||0)}:undefined
  });
  const body={
    name:'company-zero-production-run',
    project:process.env.NEATLOGS_PROJECT,
    input:{companyId:company?.id,companyName:company?.data?.name,jobId:job?.id,payload:job?.payload,organizationRevision:organization?.revision},
    output:{status:run?.status,passed:evaluation?.passed,costUsd:run?.costUsd,latencyMs:run?.latencyMs},
    attributes:{
      'neatlogs.session.id':String(company?.id||''),
      'neatlogs.workflow.run_id':String(run?.id||''),
      'neatlogs.workflow.organization_revision':String(organization?.revision??'')
    },
    duration_ms:Number(run?.latencyMs||0),
    children
  };
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const r=await fetch(`${base()}/v1/trace`,{method:'POST',headers:{'content-type':'application/json','x-api-key':key()},body:JSON.stringify(body),signal:controller.signal});
    const text=await r.text();let out;try{out=text?JSON.parse(text):{}}catch{out={raw:text.slice(0,2000)}}
    if(!r.ok)throw Object.assign(Error(`neatlogs_http_${r.status}`),{details:out});
    return{configured:true,skipped:false,...out};
  }finally{clearTimeout(timer)}
}
