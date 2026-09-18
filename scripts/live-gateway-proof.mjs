import assert from 'node:assert/strict';

const base=String(process.env.COMPANY_ZERO_BASE_URL||'https://companyzero-hq.vercel.app').replace(/\/$/,'');
const goal=String(process.env.CZ_GATEWAY_PROOF_GOAL||'make a fashion brand');
let cookie='';

const api=async(path,{method='GET',body}={})=>{
  const headers={'content-type':'application/json'};
  if(cookie)headers.cookie=cookie;
  const response=await fetch(base+'/api/v1'+path,{method,headers,body:body==null?undefined:JSON.stringify(body)});
  const setCookie=response.headers.get('set-cookie');
  if(setCookie&&!cookie)cookie=setCookie.split(';')[0];
  const text=await response.text();
  let value;try{value=text?JSON.parse(text):{}}catch{value={raw:text}};
  if(!response.ok)throw Object.assign(Error(value?.error||('http_'+response.status)),{status:response.status,details:value});
  return value;
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const health=await fetch(base+'/api/health',{cache:'no-store'}).then(r=>r.json());
assert.equal(health?.aiGatewayConfigured,true,'production Vercel API must report AI Gateway configured');

const startedAt=Date.now();
const start=await api('/interactions',{method:'POST',body:{message:goal}});
assert.equal(start.kind,'work','proof request must enter durable work');
const companyId=start.operating?.company?.id,sessionId=start.operating?.session?.id;
assert.ok(companyId&&sessionId,'production start must return company/session ids');
console.log('GATEWAY_PROOF_STARTED='+JSON.stringify({companyId,sessionId,goal}));

let hydrated=null,latest=null,records=[],terminalJob=null;
const deadline=Date.now()+10*60_000;
while(Date.now()<deadline){
  hydrated=await api('/companies/'+companyId+'/sessions/'+sessionId);
  records=hydrated.company?.records||[];
  const artifacts=(hydrated.artifacts||records.filter(x=>x.kind==='artifact'&&x.data?.sessionId===sessionId))
    .filter(x=>['ready','partial'].includes(x.state))
    .sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1)||String(b.created_at).localeCompare(String(a.created_at)));
  latest=artifacts[0]||null;
  terminalJob=records.find(x=>x.kind==='job'&&x.id===hydrated.session?.data?.firstValueJobId)||null;
  if(latest&&['READY','PARTIAL'].includes(latest.data?.readiness||''))break;
  if(['failed','dead_letter'].includes(terminalJob?.state))break;
  await sleep(2000);
}
assert.ok(latest,'live proof must terminate with a persisted candidate artifact');

const files=Array.isArray(latest.data?.files)?latest.data.files:[];
assert.ok(files.some(f=>String(f?.content||'').trim().length>=160),'live proof must preserve substantive candidate work');

const events=records.filter(x=>x.kind==='runtime_event'&&x.data?.sessionId===sessionId);
const gatewayEvents=events.filter(x=>{
  const d=x.data?.data||{};
  return d.provider==='vercel_gateway'||d.from?.provider==='vercel_gateway'||d.to?.provider==='vercel_gateway';
});
assert.ok(gatewayEvents.length>0,'live mission produced no Vercel AI Gateway runtime event');

const completedGatewayRoles=events.filter(x=>x.data?.type==='ROLE_COMPLETED'&&x.data?.data?.provider==='vercel_gateway');
const failedGatewayRoles=events.filter(x=>x.data?.type==='ROLE_FAILED'&&x.data?.data?.provider==='vercel_gateway');
const verifierEvents=events.filter(x=>String(x.data?.type||'').startsWith('CLAIM_VERIFIER_'));
const verifierProvider=latest.data?.claimVerification?.provider||verifierEvents.map(x=>x.data?.data?.provider).find(Boolean)||null;
const readiness=latest.data?.readiness;

if(latest.data?.qa?.passed===true){
  assert.equal(verifierProvider,'vercel_gateway','structurally valid candidate must use the independent Vercel Gateway verifier');
}
if(readiness==='READY'){
  assert.equal(latest.data?.claimVerification?.passed,true,'READY requires verifier pass');
  assert.equal(verifierProvider,'vercel_gateway','READY verifier must be Vercel Gateway');
  assert.notEqual(latest.data?.degraded,true,'READY cannot be degraded');
}

const summary={
  companyId,sessionId,goal,readiness,
  artifactState:latest.state,
  files:files.map(f=>f.name),
  qa:latest.data?.qa||null,
  degraded:Boolean(latest.data?.degraded),
  degradedReason:latest.data?.degradedReason||null,
  claimVerification:latest.data?.claimVerification||null,
  completedGatewayRoles:completedGatewayRoles.map(x=>({role:x.data?.data?.role,model:x.data?.data?.model})),
  failedGatewayRoles:failedGatewayRoles.map(x=>({role:x.data?.data?.role,model:x.data?.data?.model,errorCode:x.data?.data?.errorCode})),
  gatewayEvents:gatewayEvents.slice(-30).map(x=>({type:x.data?.type,message:x.data?.message,data:x.data?.data})),
  verifierEvents:verifierEvents.map(x=>({type:x.data?.type,message:x.data?.message,data:x.data?.data})),
  elapsedMs:Date.now()-startedAt
};
console.log('GATEWAY_PROOF_RESULT='+JSON.stringify(summary));
