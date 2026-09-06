export function toNeatlogsTrace({mission,org,run,diagnosis=null,decision=null,candidates=[]}){
  return {
    name:'company-zero-run',
    project:process.env.NEATLOGS_PROJECT||'company-zero',
    kind:'WORKFLOW',
    input:{mission:mission.title,domain:mission.domain,contract:{budget:mission.budget,qualityFloor:mission.qualityFloor,latencyCap:mission.latencyCap}},
    output:{accuracy:run.accuracy,cost:run.cost,latency:run.latency,violations:run.violations,decision:decision?.action||null},
    attributes:{
      'neatlogs.session.id':`cz-${mission.id}`,
      'neatlogs.workflow.name':'company-zero',
      'neatlogs.agent.role':'organization-governor'
    },
    children:[
      {
        name:'organization-execution',kind:'AGENT',
        input:{organization:org.id,roles:org.roles.map(r=>({name:r.name,tool:r.tool}))},
        output:{accuracy:run.accuracy,cost:run.cost,latency:run.latency},
        children:run.traces.flatMap(trace=>trace.stages.map(stage=>({
          name:`${trace.item}:${stage.tool}`,kind:'TOOL',tool_name:stage.tool,
          input:stage.input,output:stage.output,duration_ms:Math.max(1,Math.round(stage.latency*1000)),
          attributes:{'neatlogs.agent.role':stage.role,'neatlogs.tool.id':stage.tool}
        })))
      },
      {
        name:'independent-evaluation',kind:'EVALUATOR',
        input:{qualityFloor:mission.qualityFloor,budget:mission.budget,latencyCap:mission.latencyCap},
        output:{outcomes:run.outcomes,accuracy:run.accuracy,violations:run.violations},
        passed:run.violations.length===0,score:run.accuracy
      },
      ...(diagnosis?[{name:'failure-diagnosis',kind:'AGENT',input:{failed:run.outcomes.filter(x=>!x.pass)},output:diagnosis,attributes:{'neatlogs.agent.role':'organization-brain'}}]:[]),
      ...(candidates.length?[{name:'candidate-organizations',kind:'WORKFLOW',input:{count:candidates.length},output:candidates.map(c=>({label:c.mutation.label,accuracy:c.run.accuracy,cost:c.run.cost,latency:c.run.latency,hard:c.score.hard,score:c.score.score}))}]:[])
    ]
  };
}

export async function emitNeatlogs(trace){
  const key=process.env.NEATLOGS_WRITE_KEY||process.env.NEATLOGS_API_KEY||'';
  if(!key) return {ok:false,skipped:true,reason:'not_configured'};
  const endpoint=(process.env.NEATLOGS_INGEST_URL||'https://ingest.neatlogs.com').replace(/\/$/,'');
  const res=await fetch(`${endpoint}/v1/trace`,{method:'POST',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify(trace)});
  const text=await res.text();
  if(!res.ok) return {ok:false,status:res.status,error:text.slice(0,500)};
  try{return {ok:true,...JSON.parse(text)}}catch{return {ok:true,raw:text.slice(0,500)}}
}
