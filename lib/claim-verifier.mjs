import {completeJson,routeForPolicy,sanitizeProviderError} from './model-gateway.mjs';

const timeoutMs=()=>Math.max(8000,Math.min(60000,Number(process.env.CLAIM_VERIFIER_TIMEOUT_MS||36000)));
const progress=async(onProgress,event)=>{try{await onProgress?.(event)}catch{}};
const filesOf=result=>(Array.isArray(result?.files)?result.files:[]).map(f=>({name:String(f?.name||'artifact.md'),mimeType:String(f?.mimeType||'text/markdown'),content:String(f?.content||'')}));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9%$€£₦.]+/g,' ').replace(/\s+/g,' ').trim();
const labelRe=/\b(assumption|assumed|proposal|proposed|estimate|estimated|illustrative|hypothesis|hypothetical|target|placeholder|scenario|to validate|working range)\b/i;
function supportIsGrounded(support,{request='',publicEvidence=null}={}){
  const raw=String(support||'').trim();
  if(/^https?:\/\//i.test(raw)){const urls=new Set((publicEvidence?.results||[]).map(x=>String(x?.url||'').trim()).filter(Boolean));return urls.has(raw)}
  if(/^USER_INPUT:/i.test(raw)){const quote=raw.replace(/^USER_INPUT:/i,'').trim();return quote.length>=3&&norm(request).includes(norm(quote))}
  return false;
}
function locallyLabelledAssumption(claim,file,files){
  const content=String((files||[]).find(x=>x.name===file)?.content||'');if(!content)return false;
  const lines=content.split(/\r?\n/),nums=String(claim||'').match(/[$€£₦]?\s?\d+(?:[.,]\d+)?(?:%|[mk])?/gi)||[];
  const words=norm(claim).split(' ').filter(x=>x.length>=5).slice(0,5),indexes=[];
  lines.forEach((line,i)=>{const n=norm(line);if((nums.length&&nums.some(x=>n.includes(norm(x))))||(!nums.length&&words.filter(w=>n.includes(w)).length>=2))indexes.push(i)});
  return indexes.some(i=>labelRe.test([lines[i-1]||'',lines[i]||'',lines[i+1]||''].join(' ')));
}
const normalizeVerdict=(json,{request='',publicEvidence=null,files=[]}={})=>{
  const claims=(Array.isArray(json?.claims)?json.claims:[]).slice(0,40).map((x,i)=>{
    let status=['SUPPORTED','ASSUMPTION','UNSUPPORTED'].includes(String(x?.status||'').toUpperCase())?String(x.status).toUpperCase():'UNSUPPORTED';
    const support=Array.isArray(x?.support)?x.support.map(String).slice(0,5):[],claim=String(x?.claim||'').slice(0,1000),file=String(x?.file||'');
    let reason=String(x?.reason||'').slice(0,1000);
    if(status==='SUPPORTED'&&!support.some(item=>supportIsGrounded(item,{request,publicEvidence}))){status='UNSUPPORTED';reason='Claim cited only candidate text or unverifiable support; no supplied external receipt or verified user input supports it.'}
    if(status==='ASSUMPTION'&&!locallyLabelledAssumption(claim,file,files)){status='UNSUPPORTED';reason='Claim was classified as an assumption but is not locally labelled as an assumption/proposal/estimate in the artifact.'}
    return {id:String(x?.id||`claim-${i+1}`),claim,file,status,reason,support};
  });
  const rejected=claims.filter(x=>x.status==='UNSUPPORTED');
  return {passed:Boolean(json?.passed)&&rejected.length===0,summary:String(json?.summary||'').slice(0,1500),claims,rejected};
};

export async function verifyArtifactClaims({request,plan,result,publicEvidence=null,onProgress=null,onTelemetry=null}={}){
  const route=routeForPolicy('verifier'),verificationStartedAt=Date.now();
  await progress(onProgress,{type:'LATENCY_VERIFICATION_STARTED',message:'Verification timing started.',data:{verificationStartedAt,provider:route.provider,model:route.model}});
  await progress(onProgress,{type:'CLAIM_VERIFIER_STARTED',message:`Verifier started · ${route.provider}/${route.model} · checking numeric, current and external claims`,data:{provider:route.provider,model:route.model,policy:'verifier',verificationStartedAt}});
  try{
    const r=await completeJson({policy:'verifier',role:'claim_verifier',timeoutMs:timeoutMs(),temperature:0,onTelemetry,system:`You are Company Zero's independent claim verifier. Inspect the candidate artifacts claim by claim. Return strict JSON {"passed":boolean,"summary":string,"claims":[{"id":string,"claim":string,"file":string,"status":"SUPPORTED"|"ASSUMPTION"|"UNSUPPORTED","reason":string,"support":string[]}]}. Focus on numeric claims, prices, budgets, margins, market/customer facts, current facts, named external entities, product capabilities, performance claims, and claims that an external action occurred. A claim is SUPPORTED only when supplied external evidence directly supports it or it is explicitly supplied by the user. For SUPPORTED claims, the support array MUST contain the exact supplied evidence URL, or USER_INPUT:<exact quote from the request>. Candidate artifact text is never evidence for its own truth. A proposed target, estimate, scenario, hypothesis or assumption is ASSUMPTION only when the artifact labels that specific claim as such. Do not let a generic assumptions section excuse unrelated definitive claims. If a material factual claim is neither supported nor locally labelled as an assumption, mark it UNSUPPORTED. Do not invent support.`,user:JSON.stringify({request,mission:{kind:plan?.kind,contract:plan?.contract,truthPolicy:plan?.truthPolicy},candidateFiles:filesOf(result),publicEvidence})});
    const candidateFiles=filesOf(result),verdict=normalizeVerdict(r.json||{},{request,publicEvidence,files:candidateFiles}),verificationCompletedAt=Date.now();
    await progress(onProgress,{type:'LATENCY_VERIFICATION_COMPLETED',message:`Verification completed in ${verificationCompletedAt-verificationStartedAt}ms.`,data:{verificationStartedAt,verificationCompletedAt,verificationLatencyMs:verificationCompletedAt-verificationStartedAt,passed:verdict.passed,provider:r.provider,model:r.model}});
    await progress(onProgress,{type:verdict.passed?'CLAIM_VERIFIER_PASSED':'CLAIM_VERIFIER_REJECTED',message:verdict.passed?`Verifier passed claim-level truth check · ${r.provider}/${r.model}`:verdict.rejected.length?`Verifier rejected ${verdict.rejected.length} unsupported claim${verdict.rejected.length===1?'':'s'} · ${r.provider}/${r.model}`:`Verifier did not approve candidate · ${r.provider}/${r.model}`,data:{provider:r.provider,model:r.model,policy:r.policy,latencyMs:r.latencyMs,costUsd:r.costUsd,rejected:verdict.rejected,claims:verdict.claims,verificationStartedAt,verificationCompletedAt}});
    if(verdict.passed)await progress(onProgress,{type:'READY_ELIGIBLE',message:'Candidate is eligible for READY: structural QA and independent claim verification passed.',data:{verified:true,provider:r.provider,model:r.model,verificationCompletedAt}});
    return {...verdict,telemetry:r.telemetry,provider:r.provider,model:r.model,verificationStartedAt,verificationCompletedAt};
  }catch(error){const verificationCompletedAt=Date.now(),errorCode=sanitizeProviderError(error,error.provider||route.provider);await progress(onProgress,{type:'LATENCY_VERIFICATION_COMPLETED',message:`Verification failed after ${verificationCompletedAt-verificationStartedAt}ms.`,data:{verificationStartedAt,verificationCompletedAt,verificationLatencyMs:verificationCompletedAt-verificationStartedAt,passed:false,failed:true,provider:error.provider||route.provider,model:error.model||route.model,errorCode}});await progress(onProgress,{type:'CLAIM_VERIFIER_FAILED',message:`Verifier failed · ${error.provider||route.provider}/${error.model||route.model} · ${errorCode}. Result cannot become READY.`,data:{errorCode,error:String(error?.message||error),telemetry:error?.telemetry||null,verificationStartedAt,verificationCompletedAt}});return {passed:false,failed:true,summary:'claim_verifier_failed',claims:[],rejected:[],error:errorCode,telemetry:error?.telemetry||null,provider:error.provider||route.provider,model:error.model||route.model,verificationStartedAt,verificationCompletedAt};}
}

export async function repairRejectedClaims({request,plan,result,verdict,publicEvidence=null,onProgress=null,onTelemetry=null}={}){
  if(!verdict||verdict.passed||verdict.failed||!verdict.rejected?.length)return null;
  const route=routeForPolicy('specialist_executor'),repairStartedAt=Date.now();
  await progress(onProgress,{type:'CLAIM_REPAIR_STARTED',message:`Repair started · ${route.provider}/${route.model} · fixing ${verdict.rejected.length} rejected claim${verdict.rejected.length===1?'':'s'}`,data:{provider:route.provider,model:route.model,rejected:verdict.rejected,repairStartedAt}});
  try{
    const r=await completeJson({policy:'specialist_executor',role:'claim_repair',timeoutMs:timeoutMs(),temperature:0,onTelemetry,system:`You are Company Zero's bounded claim repair function. Return strict JSON {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. You get the original artifacts plus the verifier's rejected claims. Repair only what is needed for truthfulness while preserving useful work and the mission contract. For each rejected claim, either (1) ground it using supplied evidence, (2) explicitly relabel that specific claim as a proposal/assumption/estimate/hypothesis, or (3) remove it. Never invent evidence. Do not introduce new unsupported numeric/current/external claims. This is the only repair pass.`,user:JSON.stringify({request,mission:{kind:plan?.kind,contract:plan?.contract,truthPolicy:plan?.truthPolicy},candidateFiles:filesOf(result),rejectedClaims:verdict.rejected,publicEvidence})});
    const files=filesOf(r.json||{}).filter(f=>f.content.trim().length>=80).slice(0,8);
    if(!files.length)throw Object.assign(Error('claim_repair_returned_no_files'),{provider:r.provider,model:r.model});
    const repairCompletedAt=Date.now(),repaired={...result,title:String(r.json?.title||result?.title||'Repaired result').slice(0,120),summary:String(r.json?.summary||result?.summary||'Unsupported claims repaired.').slice(0,500),files,model:r.model,repairTelemetry:r.telemetry};
    await progress(onProgress,{type:'CLAIM_REPAIR_COMPLETED',message:`Repair completed · ${r.provider}/${r.model} · ${files.length} artifact${files.length===1?'':'s'} revised`,data:{provider:r.provider,model:r.model,policy:r.policy,latencyMs:r.latencyMs,costUsd:r.costUsd,fileNames:files.map(f=>f.name),repairStartedAt,repairCompletedAt,repairLatencyMs:repairCompletedAt-repairStartedAt}});
    return repaired;
  }catch(error){const errorCode=sanitizeProviderError(error,error.provider||route.provider);await progress(onProgress,{type:'CLAIM_REPAIR_FAILED',message:`Repair failed · ${error.provider||route.provider}/${error.model||route.model} · ${errorCode}. Result cannot become READY.`,data:{errorCode,error:String(error?.message||error),telemetry:error?.telemetry||null,repairStartedAt,repairCompletedAt:Date.now()}});return null;}
}
