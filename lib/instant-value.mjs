import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {DomainError} from './contracts.mjs';
import {searchPublicWeb} from './public-web.mjs';
import {compileExecutionPlan,usefulFallback,qualityCheck} from './execution-kernel.mjs';

const timeoutMs=()=>Math.max(5000,Math.min(18000,Number(process.env.INSTANT_VALUE_TIMEOUT_MS||14000)));
const progress=async(onProgress,type,message,data={})=>{try{await onProgress?.({type,message,data})}catch{}};
const safeName=name=>String(name||'first-value.md').replace(/\\/g,'/').split('/').filter(Boolean).map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').slice(0,100)||'file').join('/').slice(0,400)||'first-value.md';
const mime=name=>name.endsWith('.json')?'application/json':name.endsWith('.csv')?'text/csv':'text/markdown';
const host=url=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return String(url||'').slice(0,60)}};

function missingLeadContextArtifact(text,brand='this brand'){
  const safeBrand=String(brand||'this brand').replace(/[^a-z0-9 &._'-]/gi,'').trim()||'this brand';
  const content=`# I need one detail before I can find real prospects\n\nI can find and rank the 5 serious prospects, but I cannot reliably identify **${safeBrand}** or what it sells from the request/public search alone.\n\nSend **either**:\n- the store / product / Instagram URL, **or**\n- what ${safeBrand} sells and the market you want to target.\n\nThat is enough. I will use it to research actual prospects and return names, fit, source links, and an outreach angle. I will not pad the list with invented leads.`;
  return {title:`One detail needed for ${safeBrand}`,summary:`Send ${safeBrand}'s URL or what it sells. Then I can research 5 real prospects instead of guessing.`,files:[{name:'one-detail-needed.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:'missing_brand_context',needsInput:true,question:`Send ${safeBrand}'s store/product URL, or tell me what it sells and the target market.`,model:null,publicEvidence:null};
}

function leadContextGap(text,evidence){
  const lower=String(text||'').toLowerCase();if(!/\b(clients?|customers?|leads?|prospects?)\b/.test(lower))return null;
  if(/https?:\/\//i.test(text)||/\b(?:we|i|it|brand|business)\s+(?:sell|sells|selling|offer|offers|make|makes)\b/i.test(text))return null;
  const match=String(text||'').match(/\bbrand\s+([a-z0-9][a-z0-9&'._-]{1,50})\b/i);if(!match)return null;
  const brand=match[1];const needle=brand.toLowerCase();
  const identified=(evidence?.results||[]).some(item=>{const hay=`${item.title||''} ${item.snippet||''} ${item.url||''}`.toLowerCase();return hay.includes(needle)&&/\b(brand|shop|store|e-?commerce|retail|official|products?|about|contact)\b/.test(hay)});
  return identified?null:{brand};
}

async function collectEvidence(text,plan,onProgress){
  if(!plan.requiresFreshEvidence){
    await progress(onProgress,'ASSUMPTIONS_SET',`No live lookup needed for this pass. Proceeding with reversible assumptions for ${plan.kind.replaceAll('_',' ')}.`,{kind:plan.kind});
    return null;
  }
  await progress(onProgress,'RESEARCH_STARTED',`Looking for current evidence for: ${text.slice(0,120)}`,{kind:plan.kind,request:text});
  try{
    const result=await searchPublicWeb(text,{limit:8,timeoutMs:2400});
    const results=result?.results||[];
    const domains=[...new Set(results.map(x=>host(x.url)).filter(Boolean))].slice(0,5);
    const queries=(result?.queries||[]).slice(0,4);
    const detail=[queries.length?`queries: ${queries.join(' · ')}`:'',domains.length?`sources: ${domains.join(', ')}`:''].filter(Boolean).join(' | ');
    await progress(onProgress,'RESEARCH_FINISHED',`${results.length} source${results.length===1?'':'s'} found${detail?` — ${detail}`:''}.`,{count:results.length,queries:result?.queries||[],domains});
    return result;
  }catch(error){
    await progress(onProgress,'RESEARCH_DEGRADED',`Public research failed with ${String(error?.message||error).slice(0,120)}. Continuing without pretending evidence exists.`,{error:String(error?.message||error)});
    return {ok:false,queries:[],results:[],reason:error?.message||'public_search_failed'};
  }
}

function normalizeModelResult(r){
  const raw=r?.json||{};const files=[];const seen=new Set();
  for(const f of Array.isArray(raw.files)?raw.files.slice(0,3):[]){
    const name=safeName(f?.name);if(seen.has(name))continue;
    const content=String(f?.content||'').trim();if(content.length<80)continue;
    seen.add(name);files.push({name,mimeType:String(f?.mimeType||mime(name)),content:content.slice(0,120000)});
  }
  return {title:String(raw.title||'Working result').slice(0,120),summary:String(raw.summary||'A useful first result is ready.').slice(0,400),files,provisional:true,degraded:false,model:r?.model||null,usage:r?.usage||null};
}

export async function buildInstantValue({request,context=null,onProgress=null}={}){
  const text=String(request||'').trim();if(!text)throw new DomainError('instant_value_request_required',422);
  await progress(onProgress,'INTERPRETING_REQUEST',`Reading the request and deciding what concrete output can move it forward: “${text.slice(0,100)}${text.length>100?'…':''}”`,{});
  const plan=compileExecutionPlan(text,context||{});
  await progress(onProgress,'PLAN_COMPILED',`Plan: ${plan.workUnits.map((u,i)=>`${i+1}) ${u.title}`).join(' → ')}`,{kind:plan.kind,objective:plan.objective,workUnits:plan.workUnits,expectedOutputs:plan.expectedOutputs});

  const publicEvidence=await collectEvidence(text,plan,onProgress);
  const contextGap=leadContextGap(text,publicEvidence);
  if(contextGap){await progress(onProgress,'INPUT_NEEDED',`I can’t identify ${contextGap.brand} well enough to rank real prospects. One brand/product detail is required.`,{brand:contextGap.brand});return missingLeadContextArtifact(text,contextGap.brand);}

  if(!tensormuxConfigured()){
    await progress(onProgress,'REASONING_UNAVAILABLE',`The reasoning provider is unavailable for this run. Building the strongest ${plan.kind.replaceAll('_',' ')} fallback from what is already known.`,{kind:plan.kind});
    return usefulFallback(text,plan,{reason:'instant_value_model_not_configured',publicEvidence});
  }

  const firstUnit=plan.workUnits[0]?.title||plan.objective;
  await progress(onProgress,'EXECUTION_STARTED',`Working on: ${firstUnit}`,{workUnits:plan.workUnits,activeUnit:plan.workUnits[0]||null});
  let r;
  try{
    r=await completeJsonWithTensorMux({
      timeoutMs:timeoutMs(),
      system:`You are Company Zero's execution worker. The user asked for an outcome, not a workflow explanation. Return strict JSON: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.

You receive an executionPlan. Follow it.
- Produce the first concrete useful result now.
- Work through the executionPlan workUnits mentally; do not narrate internal chain-of-thought.
- The files must contain domain substance, not status text, apologies, setup notes, or a generic future-work checklist.
- Infer low-risk reversible assumptions and state only assumptions that materially affect the output.
- If publicEvidence exists, current factual claims, prospects, companies, contact paths, and recommendations must include source URLs.
- For lead generation: return concrete candidates, why each fits, source URL, and a specific outreach angle. Do not invent a lead.
- For company creation: return a specific market wedge, target customer, positioning, first product/offer, business model, validation plan, and immediate next assets. Do not answer with "register a company" boilerplate.
- For product builds: return build-ready scope/components/interfaces/acceptance criteria, not vague strategy.
- Never claim an external side effect happened unless evidence proves it.
- Prefer 1-3 substantial files that a user can actually use.`,
      user:JSON.stringify({request:text,executionPlan:plan,context,publicEvidence})
    });
  }catch(error){
    await progress(onProgress,'EXECUTION_DEGRADED',`The model call failed (${String(error?.message||error).slice(0,120)}). Switching to the domain fallback instead of stalling.`,{error:String(error?.message||error),kind:plan.kind});
    return usefulFallback(text,plan,{reason:error?.message||'instant_value_failed',publicEvidence});
  }

  const built=normalizeModelResult(r);
  const fileNames=built.files.map(f=>f.name);
  await progress(onProgress,'MODEL_RETURNED',`Model returned ${built.files.length} candidate file${built.files.length===1?'':'s'}${fileNames.length?`: ${fileNames.join(', ')}`:''}.`,{model:r.model||null,fileNames,usage:r.usage||null});
  built.publicEvidence=publicEvidence?.ok?{queries:publicEvidence.queries,results:(publicEvidence.results||[]).slice(0,8)}:null;
  const qa=qualityCheck(built,plan);
  await progress(onProgress,'QUALITY_CHECK',qa.ok?`Usefulness gate passed for ${fileNames.join(', ')||'the result'}.`:`Usefulness gate failed: ${qa.reasons.join(', ')}.`,{model:r.model||null,reasons:qa.reasons,fileNames});
  if(!qa.ok){
    await progress(onProgress,'QUALITY_REJECTED',`Rejecting the weak draft because of: ${qa.reasons.join(', ')}. Building a stronger deterministic fallback.`,{reasons:qa.reasons});
    return usefulFallback(text,plan,{reason:`quality:${qa.reasons.join(',')}`,publicEvidence});
  }

  await progress(onProgress,'RESULT_COMPOSED',`Ready to save ${built.files.length} usable file${built.files.length===1?'':'s'}: ${fileNames.join(', ')}.`,{fileCount:built.files.length,kind:plan.kind,fileNames});
  return built;
}
