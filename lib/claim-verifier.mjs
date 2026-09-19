import {completeJson,routeForPolicy,sanitizeProviderError} from './model-gateway.mjs';

const timeoutMs=()=>Math.max(8000,Math.min(60000,Number(process.env.CLAIM_VERIFIER_TIMEOUT_MS||36000)));
const progress=async(onProgress,event)=>{try{await onProgress?.(event)}catch{}};
const filesOf=result=>(Array.isArray(result?.files)?result.files:[]).map(f=>({name:String(f?.name||'artifact.md'),mimeType:String(f?.mimeType||'text/markdown'),content:String(f?.content||'')}));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9%$€£₦.]+/g,' ').replace(/\s+/g,' ').trim();
const labelRe=/\b(assumptions?|assumed|proposals?|proposed|estimates?|estimated|illustrative|hypotheses|hypothesis|hypothetical|targets?|placeholders?|scenarios?|to validate|working range)\b/i;
const CLAIM_VERDICT_SCHEMA={
  type:'object',
  properties:{
    passed:{type:'boolean'},
    summary:{type:'string'},
    claims:{type:'array',items:{type:'object',properties:{
      id:{type:'string'},claim:{type:'string'},file:{type:'string'},
      status:{type:'string',enum:['SUPPORTED','ASSUMPTION','UNSUPPORTED']},
      reason:{type:'string'},support:{type:'array',items:{type:'string'}}
    },required:['id','claim','file','status','reason','support'],additionalProperties:false}}
  },
  required:['passed','summary','claims'],
  additionalProperties:false
};
const verifierFallbackModel=()=>String(process.env.GROQ_VERIFIER_FALLBACK_MODEL||'openai/gpt-oss-20b').trim()||'openai/gpt-oss-20b';
function supportIsGrounded(support,{request='',publicEvidence=null}={}){
  const raw=String(support||'').trim();
  if(/^https?:\/\//i.test(raw)){const urls=new Set((publicEvidence?.results||[]).map(x=>String(x?.url||'').trim()).filter(Boolean));return urls.has(raw)}
  if(/^USER_INPUT:/i.test(raw)){const quote=raw.replace(/^USER_INPUT:/i,'').trim();return quote.length>=3&&norm(request).includes(norm(quote))}
  return false;
}
function inherentlyProposedClaim(claim,{plan=null,request=''}={}){
  const requestText=norm(request),claimText=norm(claim);
  const creationKind=String(plan?.kind||'')==='company_creation';
  const hasCreationVerb=['make','build','create','start','launch','form'].some(word=>requestText.split(' ').includes(word));
  const hasCreationObject=['company','startup','business','brand','venture'].some(word=>requestText.split(' ').includes(word));
  if(!creationKind&&!(hasCreationVerb&&hasCreationObject))return false;
  return claimText==='company name'||claimText.startsWith('company name ')||claimText==='brand name'||claimText.startsWith('brand name ');
}
function locallyLabelledAssumption(claim,file,files){
  const content=String((files||[]).find(x=>x.name===file)?.content||'');if(!content)return false;
  const lines=content.split(/\r?\n/),nums=String(claim||'').match(/[$€£₦]?\s?\d+(?:[.,]\d+)?(?:%|[mk])?/gi)||[];
  const words=norm(claim).split(' ').filter(x=>x.length>=5).slice(0,6),indexes=[];
  const compactNumber=value=>String(value||'').toLowerCase().replace(/[$€£₦,%\s,]/g,'');
  lines.forEach((line,i)=>{
    const n=norm(line),wordHits=words.filter(w=>n.includes(w)).length,lineNumber=compactNumber(line);
    const numberHit=nums.some(x=>{const needle=compactNumber(x);return needle&&lineNumber.includes(needle)});
    if((nums.length&&(numberHit||wordHits>=2))||(!nums.length&&wordHits>=2))indexes.push(i);
  });
  return indexes.some(i=>labelRe.test(norm([lines[i-1]||'',lines[i]||'',lines[i+1]||''].join(' '))));
}
const normalizeVerdict=(json,{request='',publicEvidence=null,files=[],plan=null}={})=>{
  const claims=(Array.isArray(json?.claims)?json.claims:[]).slice(0,40).map((x,i)=>{
    let status=['SUPPORTED','ASSUMPTION','UNSUPPORTED'].includes(String(x?.status||'').toUpperCase())?String(x.status).toUpperCase():'UNSUPPORTED';
    const support=Array.isArray(x?.support)?x.support.map(String).slice(0,5):[],claim=String(x?.claim||'').slice(0,1000),file=String(x?.file||'');
    let reason=String(x?.reason||'').slice(0,1000);
    const grounded=support.some(item=>supportIsGrounded(item,{request,publicEvidence}));
    const locallyLabelled=locallyLabelledAssumption(claim,file,files)||inherentlyProposedClaim(claim,{plan,request});
    if(status==='SUPPORTED'&&!grounded){
      if(locallyLabelled){status='ASSUMPTION';reason='Locally labelled as a proposal/target/estimate/assumption; candidate text is not being treated as external proof.'}
      else{status='UNSUPPORTED';reason='Claim cited only candidate text or unverifiable support; no supplied external receipt or verified user input supports it.'}
    }else if(status==='ASSUMPTION'&&!locallyLabelled){
      status='UNSUPPORTED';reason='Claim was classified as an assumption but is not locally labelled as an assumption/proposal/estimate in the artifact.';
    }else if(status==='UNSUPPORTED'&&locallyLabelled){
      status='ASSUMPTION';reason='Deterministic truth policy: the artifact locally labels this value as Proposed, Target, Estimate, Scenario, Hypothesis, or Assumption.';
    }
    return {id:String(x?.id||`claim-${i+1}`),claim,file,status,reason,support};
  });
  const rejected=claims.filter(x=>x.status==='UNSUPPORTED');
  const passed=claims.length?rejected.length===0:Boolean(json?.passed);
  return {passed,summary:String(json?.summary||'').slice(0,1500),claims,rejected};
};

export async function verifyArtifactClaims({request,plan,result,publicEvidence=null,onProgress=null,onTelemetry=null}={}){
  const route=routeForPolicy('verifier'),verificationStartedAt=Date.now();
  await progress(onProgress,{type:'LATENCY_VERIFICATION_STARTED',message:'Verification timing started.',data:{verificationStartedAt,provider:route.provider,model:route.model}});
  await progress(onProgress,{type:'CLAIM_VERIFIER_STARTED',message:`Verifier started · ${route.provider}/${route.model} · checking numeric, current and external claims`,data:{provider:route.provider,model:route.model,policy:'verifier',verificationStartedAt}});
  try{
    const verifierSystem=`You are Company Zero's independent claim verifier. Inspect the candidate artifacts claim by claim. Return the required structured verdict. Focus on numeric claims, prices, budgets, margins, market/customer facts, current facts, named external entities, product capabilities, performance claims, and claims that an external action occurred. A claim is SUPPORTED only when supplied external evidence directly supports it or it is explicitly supplied by the user. For SUPPORTED claims, the support array MUST contain the exact supplied evidence URL, or USER_INPUT:<exact quote from the request>. Candidate artifact text is never evidence for its own truth. A proposed target, estimate, scenario, hypothesis or assumption is ASSUMPTION only when the artifact labels that specific claim as such. Do not let a generic assumptions section excuse unrelated definitive claims. If a material factual claim is neither supported nor locally labelled as Proposed, Target, Estimate, Scenario, Hypothesis, or Assumption, mark it UNSUPPORTED. Treat those explicit local labels as non-factual planning claims, not as external observations. Do not invent support.`;
    const verifierUser=JSON.stringify({request,mission:{kind:plan?.kind,contract:plan?.contract,truthPolicy:plan?.truthPolicy},candidateFiles:filesOf(result),publicEvidence});
    const callVerifier=({model,structured=true,role='claim_verifier'})=>completeJson({policy:'verifier',role,model,timeoutMs:timeoutMs(),temperature:0,onTelemetry,...(structured?{responseSchema:CLAIM_VERDICT_SCHEMA,responseSchemaName:'company_zero_claim_verdict'}:{}),system:verifierSystem,user:verifierUser});
    let r;
    try{
      r=await callVerifier({model:route.model,structured:true});
    }catch(first){
      const firstCode=sanitizeProviderError(first,first.provider||route.provider),fallbackModel=verifierFallbackModel();
      if(firstCode==='groq_http_400'){
        await progress(onProgress,{type:'CLAIM_VERIFIER_RETRYING',message:`Verifier format retry · ${route.provider}/${route.model} using JSON Object mode after ${firstCode}`,data:{errorCode:firstCode,from:{provider:first.provider||route.provider,model:first.model||route.model,format:'json_schema'},to:{provider:route.provider,model:route.model,format:'json_object'}}});
        try{r=await callVerifier({model:route.model,structured:false,role:'claim_verifier_json_retry'})}
        catch(compat){
          const compatCode=sanitizeProviderError(compat,compat.provider||route.provider);
          if(!['groq_http_400','groq_http_429'].includes(compatCode))throw compat;
          await progress(onProgress,{type:'CLAIM_VERIFIER_RETRYING',message:`Verifier model retry · ${route.provider}/${fallbackModel} using JSON Object mode after ${compatCode}`,data:{errorCode:compatCode,from:{provider:compat.provider||route.provider,model:compat.model||route.model},to:{provider:route.provider,model:fallbackModel,format:'json_object'}}});
          r=await callVerifier({model:fallbackModel,structured:false,role:'claim_verifier_fallback_json'});
        }
      }else if(firstCode==='groq_http_429'){
        await progress(onProgress,{type:'CLAIM_VERIFIER_RETRYING',message:`Verifier model retry · ${route.provider}/${fallbackModel} after ${firstCode}`,data:{errorCode:firstCode,from:{provider:first.provider||route.provider,model:first.model||route.model},to:{provider:route.provider,model:fallbackModel,format:'json_schema'}}});
        try{r=await callVerifier({model:fallbackModel,structured:true,role:'claim_verifier_retry'})}
        catch(fallbackError){
          const fallbackCode=sanitizeProviderError(fallbackError,fallbackError.provider||route.provider);
          if(fallbackCode!=='groq_http_400')throw fallbackError;
          await progress(onProgress,{type:'CLAIM_VERIFIER_RETRYING',message:`Verifier format retry · ${route.provider}/${fallbackModel} using JSON Object mode after ${fallbackCode}`,data:{errorCode:fallbackCode,from:{provider:fallbackError.provider||route.provider,model:fallbackError.model||fallbackModel,format:'json_schema'},to:{provider:route.provider,model:fallbackModel,format:'json_object'}}});
          r=await callVerifier({model:fallbackModel,structured:false,role:'claim_verifier_fallback_json'});
        }
      }else throw first;
    }
    const candidateFiles=filesOf(result),verdict=normalizeVerdict(r.json||{},{request,publicEvidence,files:candidateFiles,plan}),verificationCompletedAt=Date.now();
    await progress(onProgress,{type:'LATENCY_VERIFICATION_COMPLETED',message:`Verification completed in ${verificationCompletedAt-verificationStartedAt}ms.`,data:{verificationStartedAt,verificationCompletedAt,verificationLatencyMs:verificationCompletedAt-verificationStartedAt,passed:verdict.passed,provider:r.provider,model:r.model}});
    await progress(onProgress,{type:verdict.passed?'CLAIM_VERIFIER_PASSED':'CLAIM_VERIFIER_REJECTED',message:verdict.passed?`Verifier passed claim-level truth check · ${r.provider}/${r.model}`:verdict.rejected.length?`Verifier rejected ${verdict.rejected.length} unsupported claim${verdict.rejected.length===1?'':'s'} · ${r.provider}/${r.model}`:`Verifier did not approve candidate · ${r.provider}/${r.model}`,data:{provider:r.provider,model:r.model,policy:r.policy,latencyMs:r.latencyMs,costUsd:r.costUsd,rejected:verdict.rejected,claims:verdict.claims,verificationStartedAt,verificationCompletedAt}});
    if(verdict.passed)await progress(onProgress,{type:'READY_ELIGIBLE',message:'Candidate is eligible for READY: structural QA and independent claim verification passed.',data:{verified:true,provider:r.provider,model:r.model,verificationCompletedAt}});
    return {...verdict,telemetry:r.telemetry,provider:r.provider,model:r.model,verificationStartedAt,verificationCompletedAt};
  }catch(error){const verificationCompletedAt=Date.now(),errorCode=sanitizeProviderError(error,error.provider||route.provider);await progress(onProgress,{type:'LATENCY_VERIFICATION_COMPLETED',message:`Verification failed after ${verificationCompletedAt-verificationStartedAt}ms.`,data:{verificationStartedAt,verificationCompletedAt,verificationLatencyMs:verificationCompletedAt-verificationStartedAt,passed:false,failed:true,provider:error.provider||route.provider,model:error.model||route.model,errorCode}});await progress(onProgress,{type:'CLAIM_VERIFIER_FAILED',message:`Verifier failed · ${error.provider||route.provider}/${error.model||route.model} · ${errorCode}. Result cannot become READY.`,data:{errorCode,error:String(error?.message||error),telemetry:error?.telemetry||null,verificationStartedAt,verificationCompletedAt}});return {passed:false,failed:true,summary:'claim_verifier_failed',claims:[],rejected:[],error:errorCode,telemetry:error?.telemetry||null,provider:error.provider||route.provider,model:error.model||route.model,verificationStartedAt,verificationCompletedAt};}
}

export async function repairRejectedClaims({request,plan,result,verdict,publicEvidence=null,onProgress=null,onTelemetry=null}={}){
  if(!verdict||verdict.passed||verdict.failed||!verdict.rejected?.length)return null;
  const repairStartedAt=Date.now(),policies=['specialist_executor','frontier_escalation'];
  const firstRoute=routeForPolicy(policies[0]);
  await progress(onProgress,{type:'CLAIM_REPAIR_STARTED',message:`Repair started · ${firstRoute.provider}/${firstRoute.model} · fixing ${verdict.rejected.length} rejected claim${verdict.rejected.length===1?'':'s'}`,data:{provider:firstRoute.provider,model:firstRoute.model,rejected:verdict.rejected,repairStartedAt}});
  let r=null,lastError=null;
  for(let index=0;index<policies.length;index++){
    const policy=policies[index],route=routeForPolicy(policy);
    if(index>0){
      const previous=routeForPolicy(policies[index-1]),errorCode=sanitizeProviderError(lastError,lastError?.provider||previous.provider);
      await progress(onProgress,{type:'CLAIM_REPAIR_ESCALATED',message:`Repair transport failed · ${errorCode} · continuing the same bounded repair pass on ${route.provider}/${route.model}`,data:{errorCode,from:{provider:lastError?.provider||previous.provider,model:lastError?.model||previous.model,policy:policies[index-1]},to:{provider:route.provider,model:route.model,policy},repairStartedAt}});
    }
    try{
      r=await completeJson({policy,role:'claim_repair',timeoutMs:timeoutMs(),temperature:0,onTelemetry,system:`You are Company Zero's single bounded claim repair function. Return strict JSON {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. You get the original artifacts plus the verifier's rejected claims. This is one semantic repair pass even if transport fails over between providers. Repair only what is needed for truthfulness while preserving every useful file and the mission contract. For each rejected claim, either (1) ground it using supplied evidence, (2) explicitly relabel that specific claim adjacent to the value as Proposed, Target, Estimate, Scenario, Hypothesis, or Assumption, or (3) remove it. Internally chosen company names, segments, headcount, prices, budgets, timelines, margins, performance goals and future actions are proposals/targets/estimates unless directly evidenced. Never present planned future actions as already completed. Never invent evidence. Do not introduce new unsupported numeric/current/external claims.`,user:JSON.stringify({request,mission:{kind:plan?.kind,contract:plan?.contract,truthPolicy:plan?.truthPolicy},candidateFiles:filesOf(result),rejectedClaims:verdict.rejected,publicEvidence})});
      break;
    }catch(error){lastError=error}
  }
  if(!r){
    const route=routeForPolicy(policies.at(-1)),error=lastError||Object.assign(Error('claim_repair_failed'),{provider:route.provider,model:route.model}),errorCode=sanitizeProviderError(error,error.provider||route.provider);
    await progress(onProgress,{type:'CLAIM_REPAIR_FAILED',message:`Repair failed · ${error.provider||route.provider}/${error.model||route.model} · ${errorCode}. Result cannot become READY.`,data:{errorCode,error:String(error?.message||error),telemetry:error?.telemetry||null,repairStartedAt,repairCompletedAt:Date.now()}});
    return null;
  }
  try{
    const files=filesOf(r.json||{}).filter(f=>f.content.trim().length>=80).slice(0,8);
    if(!files.length)throw Object.assign(Error('claim_repair_returned_no_files'),{provider:r.provider,model:r.model});
    const repairCompletedAt=Date.now(),repaired={...result,title:String(r.json?.title||result?.title||'Repaired result').slice(0,120),summary:String(r.json?.summary||result?.summary||'Unsupported claims repaired.').slice(0,500),files,model:r.model,repairTelemetry:r.telemetry};
    await progress(onProgress,{type:'CLAIM_REPAIR_COMPLETED',message:`Repair completed · ${r.provider}/${r.model} · ${files.length} artifact${files.length===1?'':'s'} revised`,data:{provider:r.provider,model:r.model,policy:r.policy,latencyMs:r.latencyMs,costUsd:r.costUsd,fileNames:files.map(f=>f.name),repairStartedAt,repairCompletedAt,repairLatencyMs:repairCompletedAt-repairStartedAt}});
    return repaired;
  }catch(error){
    const errorCode=sanitizeProviderError(error,error.provider||r.provider);
    await progress(onProgress,{type:'CLAIM_REPAIR_FAILED',message:`Repair failed · ${error.provider||r.provider}/${error.model||r.model} · ${errorCode}. Result cannot become READY.`,data:{errorCode,error:String(error?.message||error),telemetry:error?.telemetry||null,repairStartedAt,repairCompletedAt:Date.now()}});
    return null;
  }
}
