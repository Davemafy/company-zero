import {completeJsonWithTensorMux,tensormuxConfigured,tensormuxModel} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';
import {searchPublicWeb} from './public-web.mjs';
import {compileExecutionPlan,usefulFallback,qualityCheck} from './execution-kernel.mjs';
import {verifyArtifactClaims,repairRejectedClaims} from './claim-verifier.mjs';

const executionTimeoutMs=()=>Math.max(8000,Math.min(45000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||32000)));
const plannerTimeoutMs=()=>Math.max(2000,Math.min(10000,Number(process.env.PLANNER_TIMEOUT_MS||6000)));
const plannerRetryTimeoutMs=()=>Math.max(plannerTimeoutMs(),Math.min(14000,Number(process.env.PLANNER_RETRY_TIMEOUT_MS||9000)));
const fallbackPlannerTimeoutMs=()=>Math.max(plannerRetryTimeoutMs(),Math.min(20000,Number(process.env.FALLBACK_PLANNER_TIMEOUT_MS||14000)));
const progress=async(onProgress,type,message,data={})=>{try{await onProgress?.({type,message,data})}catch{}};
const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return String(url||'').slice(0,60)}};

function missingLeadContextArtifact(brand='this brand'){
  const safeBrand=String(brand||'this brand').replace(/[^a-z0-9 &._'-]/gi,'').trim()||'this brand';
  const content=`# One detail needed before prospect research\n\nI can find and rank real prospects, but I cannot reliably identify **${safeBrand}** or what it sells.\n\nSend its store/product URL, or what it sells and the target market. I will not invent leads.`;
  return {title:`One detail needed for ${safeBrand}`,summary:`Send ${safeBrand}'s URL or what it sells so I can research real prospects.`,files:[{name:'one-detail-needed.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:'missing_brand_context',needsInput:true,question:`Send ${safeBrand}'s store/product URL, or tell me what it sells and the target market.`,model:null,publicEvidence:null};
}

function leadContextGap(text,evidence,plan){
  if(plan?.kind!=='lead_generation')return null;
  const lower=String(text||'').toLowerCase();if(!/\b(clients?|leads?|prospects?)\b/.test(lower))return null;
  if(/https?:\/\//i.test(text)||/\b(?:we|i|it|brand|business)\s+(?:sell|sells|selling|offer|offers|make|makes)\b/i.test(text))return null;
  const match=String(text||'').match(/\b(?:brand|business)\s+(?!for\b|that\b|which\b)([a-z0-9][a-z0-9&'._-]{1,50})\b/i);if(!match)return null;
  const brand=match[1],needle=brand.toLowerCase();
  const identified=(evidence?.results||[]).some(item=>`${item.title||''} ${item.snippet||''} ${item.url||''}`.toLowerCase().includes(needle));
  return identified?null:{brand};
}

function researchQuery(text,plan){
  if(plan.kind==='lead_generation'||plan.kind==='research')return text.slice(0,700);
  const location=(text.match(/\b(?:in|for)\s+([A-Z][A-Za-z -]{2,30})(?:[.,]|\s|$)/)||[])[1]||'';
  const subject=(text.match(/\b(bread|bakery|car|fashion|food|software|logistics|retail|restaurant|energy|education|health|finance|travel)\b/i)||[])[1]||plan.kind.replaceAll('_',' ');
  return `${subject} market pricing competitors ${location}`.trim();
}

async function collectEvidence(text,plan,onProgress){
  if(!plan.requiresFreshEvidence){await progress(onProgress,'ASSUMPTIONS_SET','No live lookup required for the first pass. Reversible assumptions are allowed; unsupported current facts are not.',{kind:plan.kind});return null;}
  const query=researchQuery(text,plan);await progress(onProgress,'RESEARCH_STARTED',`Gathering evidence that materially affects the mission: ${query}`,{kind:plan.kind,query});
  try{const result=await searchPublicWeb(query,{limit:8,timeoutMs:3000});const results=result?.results||[];const domains=[...new Set(results.map(x=>host(x.url)).filter(Boolean))].slice(0,5);await progress(onProgress,'RESEARCH_FINISHED',`${results.length} source${results.length===1?'':'s'} found${domains.length?` — ${domains.join(', ')}`:''}.`,{count:results.length,queries:result?.queries||[],domains});return result}catch(error){await progress(onProgress,'RESEARCH_DEGRADED',`Research degraded (${String(error?.message||error).slice(0,100)}). Continuing with labelled assumptions.`,{error:String(error?.message||error)});return {ok:false,queries:[],results:[],reason:error?.message||'public_search_failed'}}
}

function normalizeModelResult(r){const raw=r?.json||{},files=[],seen=new Set();for(const f of Array.isArray(raw.files)?raw.files.slice(0,6):[]){const name=safeName(f?.name);if(seen.has(name))continue;const content=String(f?.content||'').trim();if(content.length<80)continue;seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)})}return {title:String(raw.title||'Working result').slice(0,120),summary:String(raw.summary||'A useful first result is ready.').slice(0,400),files,provisional:true,degraded:false,model:r?.model||null,usage:r?.usage||null,roleOutputs:r?.roleOutputs||null,roleTelemetry:r?.roleTelemetry||null}}

function normalizePlannerPlan(basePlan,json){
  const units=Array.isArray(json?.workUnits)?json.workUnits.map(x=>String(x||'').trim()).filter(Boolean).slice(0,7):[];
  const outputs=Array.isArray(json?.expectedOutputs)?json.expectedOutputs.map(x=>safeName(x)).filter(Boolean).slice(0,6):[];
  return {...basePlan,objective:String(json?.objective||basePlan.objective).trim().slice(0,500)||basePlan.objective,workUnits:(units.length?units:basePlan.workUnits.map(x=>x.title)).map((title,index)=>({id:index+1,title,state:index===0?'active':'queued'})),expectedOutputs:outputs.length?outputs:basePlan.expectedOutputs,requiresFreshEvidence:typeof json?.requiresFreshEvidence==='boolean'?json.requiresFreshEvidence:basePlan.requiresFreshEvidence,plannerRationale:String(json?.reason||'').trim().slice(0,500)||null};
}

const plannerSystem='You are Company Zero mission planner. Return strict JSON only: {"objective":string,"workUnits":string[],"expectedOutputs":string[],"requiresFreshEvidence":boolean,"reason":string}. Preserve the user outcome, constraints, requested deliverables and ask policy. Never turn a venture-building mission into lead generation merely because customers are mentioned. Plan concrete artifacts, not workflow theatre. You may refine execution order, but you may not change the mission kind, organization, contract, budget constraints or requested deliverables.';
async function runPlanner({text,context,basePlan,model,timeoutMs}){const r=await completeJsonWithTensorMux({model,timeoutMs,temperature:0,system:plannerSystem,user:JSON.stringify({request:text,basePlan,context})});return {response:r,plan:normalizePlannerPlan(basePlan,r.json||{})}}

async function planMission(text,context,onProgress){
  const basePlan=compileExecutionPlan(text,context||{});await progress(onProgress,'ORGANIZATION_ASSEMBLED',`Assembled ${basePlan.organization.functions.join(' → ')} for a ${basePlan.kind.replaceAll('_',' ')} mission.`,{organization:basePlan.organization,contract:basePlan.contract});if(!tensormuxConfigured())return basePlan;
  const fastModel=tensormuxModel('planner'),fallbackModel=tensormuxModel('planner_fallback');let firstError=null,retryError=null;
  await progress(onProgress,'PLANNER_STARTED',`Fast planner (${fastModel}) is testing the shortest useful path against the mission contract.`,{model:fastModel,attempt:1,timeoutMs:plannerTimeoutMs(),contract:basePlan.contract});
  try{const {response,plan}=await runPlanner({text,context,basePlan,model:fastModel,timeoutMs:plannerTimeoutMs()});await progress(onProgress,'PLANNER_FINISHED',`Fast planner kept the ${plan.kind.replaceAll('_',' ')} organization and chose ${plan.workUnits.length} execution steps.`,{model:response.model,attempt:1,workUnits:plan.workUnits,expectedOutputs:plan.expectedOutputs,contract:plan.contract});return plan}catch(error){firstError=error;await progress(onProgress,'PLANNER_RETRYING',`Fast planner attempt 1 failed (${String(error?.message||error).slice(0,100)}). Retrying once with a bounded ${plannerRetryTimeoutMs()}ms window.`,{model:error?.model||fastModel,attempt:1,error:String(error?.message||error),nextAttempt:2,timeoutMs:plannerRetryTimeoutMs(),contract:basePlan.contract})}
  try{const {response,plan}=await runPlanner({text,context,basePlan,model:fastModel,timeoutMs:plannerRetryTimeoutMs()});await progress(onProgress,'PLANNER_FINISHED',`Fast planner retry succeeded without changing the ${plan.kind.replaceAll('_',' ')} organization.`,{model:response.model,attempt:2,workUnits:plan.workUnits,expectedOutputs:plan.expectedOutputs,contract:plan.contract});return plan}catch(error){retryError=error;await progress(onProgress,'PLANNER_RETRY_FAILED',`Fast planner retry failed (${String(error?.message||error).slice(0,100)}). Escalating to the fallback planner before deterministic routing.`,{model:error?.model||fastModel,attempt:2,error:String(error?.message||error),fallbackModel,timeoutMs:fallbackPlannerTimeoutMs(),contract:basePlan.contract})}
  await progress(onProgress,'PLANNER_FALLBACK_STARTED',`Fallback planner (${fallbackModel}) is taking over with a larger reasoning window while preserving the same mission contract.`,{model:fallbackModel,timeoutMs:fallbackPlannerTimeoutMs(),sameAsFastModel:fallbackModel===fastModel,contract:basePlan.contract});
  try{const {response,plan}=await runPlanner({text,context,basePlan,model:fallbackModel,timeoutMs:fallbackPlannerTimeoutMs()});await progress(onProgress,'PLANNER_FALLBACK_SUCCEEDED',`Fallback planner recovered the mission with ${plan.workUnits.length} execution steps and the original ${plan.kind.replaceAll('_',' ')} organization intact.`,{model:response.model,workUnits:plan.workUnits,expectedOutputs:plan.expectedOutputs,contract:plan.contract});return plan}catch(error){await progress(onProgress,'PLANNER_FALLBACK_FAILED',`Fallback planner failed (${String(error?.message||error).slice(0,100)}). Only now switching to the deterministic plan.`,{model:error?.model||fallbackModel,error:String(error?.message||error),firstError:String(firstError?.message||firstError||''),retryError:String(retryError?.message||retryError||''),contract:basePlan.contract});await progress(onProgress,'PLANNER_DEGRADED',`All model planning attempts failed. Preserving the deterministic ${basePlan.kind.replaceAll('_',' ')} organization and the original mission contract.`,{kind:basePlan.kind,organization:basePlan.organization,contract:basePlan.contract});return basePlan}
}

function partialCandidate(built,reason,{claimVerification=null,publicEvidence=null}={}){
  return {...built,provisional:true,degraded:true,degradedReason:reason,publicEvidence:built?.publicEvidence||(publicEvidence?.ok?{queries:publicEvidence.queries,results:(publicEvidence.results||[]).slice(0,8)}:null),claimVerification:claimVerification||{passed:false,failed:true,reason}};
}

async function truthGate({text,plan,built,publicEvidence,onProgress}){
  const evidence=publicEvidence?.ok?publicEvidence:null;
  let verdict=await verifyArtifactClaims({request:text,plan,result:built,publicEvidence:evidence,onProgress});
  if(verdict.passed)return {...built,claimVerification:{passed:true,repaired:false,claims:verdict.claims,provider:verdict.provider,model:verdict.model}};
  if(verdict.failed)return partialCandidate(built,'claim_verifier_failed',{claimVerification:{passed:false,failed:true,error:verdict.error||'claim_verifier_failed',claims:verdict.claims||[],rejected:verdict.rejected||[],provider:verdict.provider||null,model:verdict.model||null},publicEvidence});
  const repaired=await repairRejectedClaims({request:text,plan,result:built,verdict,publicEvidence:evidence,onProgress});
  if(!repaired)return partialCandidate(built,'claim_repair_failed',{claimVerification:{passed:false,failed:true,claims:verdict.claims||[],rejected:verdict.rejected||[],provider:verdict.provider||null,model:verdict.model||null},publicEvidence});
  const repairedQa=qualityCheck(repaired,plan);await progress(onProgress,'REPAIRED_EVALUATOR_JUDGMENT',repairedQa.ok?'Evaluator: PASS — repaired artifacts still satisfy the mission contract.':`Evaluator: FAIL — repair damaged contract coverage: ${repairedQa.reasons.join(', ')}.`,{reasons:repairedQa.reasons,contract:repairedQa.contract,structuralFailure:repairedQa.structuralFailure,organization:plan.organization});
  if(!repairedQa.ok)return partialCandidate(repaired,`repair_quality:${repairedQa.reasons.join(',')}`,{claimVerification:{passed:false,failed:false,claims:verdict.claims||[],rejected:verdict.rejected||[]},publicEvidence});
  verdict=await verifyArtifactClaims({request:text,plan,result:repaired,publicEvidence:evidence,onProgress});
  if(!verdict.passed){await progress(onProgress,'CLAIM_REPAIR_REJECTED','Bounded repair did not clear claim verification. The repaired candidate is not eligible for READY.',{failed:verdict.failed||false,rejected:verdict.rejected||[]});return partialCandidate(repaired,'claim_repair_verification_failed',{claimVerification:{passed:false,failed:Boolean(verdict.failed),claims:verdict.claims||[],rejected:verdict.rejected||[],provider:verdict.provider||null,model:verdict.model||null},publicEvidence})}
  return {...repaired,publicEvidence:built.publicEvidence,provisional:built.provisional,degraded:false,claimVerification:{passed:true,repaired:true,claims:verdict.claims,provider:verdict.provider,model:verdict.model}};
}

export async function buildInstantValue({request,context=null,onProgress=null}={}){
  const text=String(request||'').trim();if(!text)throw new DomainError('instant_value_request_required',422);
  await progress(onProgress,'INTERPRETING_REQUEST',`Reading the outcome, constraints and requested deliverables: “${text.slice(0,100)}${text.length>100?'…':''}”`,{});
  const plan=await planMission(text,context,onProgress);await progress(onProgress,'PLAN_COMPILED',`Plan: ${plan.workUnits.map((u,i)=>`${i+1}) ${u.title}`).join(' → ')}`,{kind:plan.kind,objective:plan.objective,organization:plan.organization,contract:plan.contract,workUnits:plan.workUnits,expectedOutputs:plan.expectedOutputs,requiresFreshEvidence:plan.requiresFreshEvidence});
  const publicEvidence=await collectEvidence(text,plan,onProgress),contextGap=leadContextGap(text,publicEvidence,plan);if(contextGap){await progress(onProgress,'INPUT_NEEDED',`Prospecting is genuinely blocked: ${contextGap.brand} cannot be identified without inventing facts.`,{brand:contextGap.brand});return missingLeadContextArtifact(contextGap.brand)}
  if(!tensormuxConfigured()){await progress(onProgress,'REASONING_UNAVAILABLE',`Reasoning is unavailable. Preserving the ${plan.kind.replaceAll('_',' ')} organization and contract instead of substituting another workflow.`,{kind:plan.kind});return usefulFallback(text,plan,{reason:'instant_value_model_not_configured',publicEvidence})}
  const executionModel=tensormuxModel('execution');await progress(onProgress,'EXECUTION_STARTED',`Organization execution is producing artifacts for: ${plan.workUnits[0]?.title||plan.objective}`,{model:executionModel,workUnits:plan.workUnits,timeoutMs:executionTimeoutMs()});
  let r;try{r=await completeJsonWithTensorMux({model:executionModel,timeoutMs:executionTimeoutMs(),onProgress,system:`You are Company Zero's execution organization. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.\nThe original user outcome is the operating contract. Follow executionPlan.organization and executionPlan.contract.\nProduce concrete usable artifacts now, not a description of future work. Cover every requested contract item that can be completed safely. Infer reversible assumptions. Respect stated budgets and constraints. Label estimates. Use publicEvidence only when it actually supports a claim and include URLs for sourced current facts. Never invent research, suppliers, prospects, prices, actions or measurements. Ask for input only if executionPlan.contract.askPolicy permits it AND work is materially blocked. A missing optional detail must not stop reversible work. For company creation, act as venture strategy + brand + finance + go-to-market + verification, not as a prospecting team. Prefer multiple coherent deliverables when the user explicitly requests them.`,user:JSON.stringify({request:text,executionPlan:plan,context,publicEvidence})})}catch(error){await progress(onProgress,'EXECUTION_DEGRADED',`Executor failed (${String(error?.message||error).slice(0,100)}). Keeping the correct organization and mission contract for recovery.`,{error:String(error?.message||error),kind:plan.kind,model:error?.model||executionModel});return usefulFallback(text,plan,{reason:error?.message||'instant_value_failed',publicEvidence})}
  const built=normalizeModelResult(r),fileNames=built.files.map(f=>f.name);await progress(onProgress,'MODEL_RETURNED',`${r.model} returned ${built.files.length} candidate artifact${built.files.length===1?'':'s'}: ${fileNames.join(', ')||'none'}.`,{provider:r.provider||null,model:r.model||null,fileNames,usage:r.usage||null,roleTelemetry:r.roleTelemetry||null});built.publicEvidence=publicEvidence?.ok?{queries:publicEvidence.queries,results:(publicEvidence.results||[]).slice(0,8)}:null;
  const qa=qualityCheck(built,plan);await progress(onProgress,'EVALUATOR_JUDGMENT',qa.ok?'Evaluator: PASS — artifacts satisfy the current mission contract. Claim verification is still required before READY.':`Evaluator: FAIL — ${qa.reasons.join(', ')}.`,{reasons:qa.reasons,contract:qa.contract,structuralFailure:qa.structuralFailure,organization:plan.organization});
  if(!qa.ok){if(qa.structuralFailure)await progress(onProgress,'STRUCTURAL_FAILURE','The current organization failed the outcome contract. Recording this as structural evidence rather than calling the mission complete.',{organization:plan.organization,reasons:qa.reasons,contract:qa.contract});return partialCandidate(built,`quality:${qa.reasons.join(',')}`,{claimVerification:{passed:false,failed:false,reason:'structural_quality_failed',claims:[],rejected:[]},publicEvidence})}
  const verified=await truthGate({text,plan,built,publicEvidence,onProgress});
  if(!verified?.claimVerification?.passed)return verified;
  const verifiedFiles=(verified.files||[]).map(f=>f.name);await progress(onProgress,'RESULT_COMPOSED',`Claim verification approved ${verified.files.length} artifact${verified.files.length===1?'':'s'}${verified.claimVerification.repaired?' after one repair pass':''}: ${verifiedFiles.join(', ')}.`,{fileCount:verified.files.length,kind:plan.kind,fileNames:verifiedFiles,model:verified.model||r.model,organization:plan.organization,claimVerified:true,repaired:verified.claimVerification.repaired});return verified;
}
