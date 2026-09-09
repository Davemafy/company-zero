const base=String(process.env.COMPANY_ZERO_BASE_URL||'').replace(/\/$/,'');
const requiredEnv=['COMPANY_ZERO_BASE_URL'];
const missing=requiredEnv.filter(k=>!process.env[k]);
const checks={};
if(missing.length){for(const k of missing)checks[`env:${k}`]=false}else checks['env:COMPANY_ZERO_BASE_URL']=true;
let health=null,workers=null;
if(base){
  try{const r=await fetch(`${base}/api/health`,{cache:'no-store'});health=await r.json();checks.apiHealth=Boolean(r.ok&&health?.ok);checks.durableStorage=health?.storage==='supabase';checks.reasoning=Boolean(health?.tensormuxConfigured);checks.observation=Boolean(health?.scrapyCloudConfigured||health?.zyteConfigured||health?.pageSpeedConfigured);checks.action=Boolean(health?.githubRepositoryConfigured);checks.verification=Boolean(health?.pageSpeedConfigured&&health?.vercelDeploymentConfigured)}catch(error){checks.apiHealth=false;checks.apiHealthError=error.message}
  try{const r=await fetch(`${base}/api/v1/runtime/workers`,{cache:'no-store'});workers=await r.json();checks.healthyWorker=Boolean(r.ok&&(workers.items||[]).some(x=>x.healthy))}catch(error){checks.healthyWorker=false;checks.workerError=error.message}
}
const pass=Object.entries(checks).filter(([,v])=>typeof v==='boolean').every(([,v])=>v===true);
const report={base,checks,health,workers:workers?.items||[],verdict:pass?'PRODUCTION PREFLIGHT: PASS':'PRODUCTION PREFLIGHT: FAIL'};
console.log(JSON.stringify(report,null,2));
if(!pass)process.exitCode=1;
