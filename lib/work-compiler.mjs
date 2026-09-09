import {DomainError} from './contracts.mjs';
import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';

const clean=(v,max=24)=>Array.isArray(v)?v.filter(Boolean).slice(0,max):[];
const ALLOWED_KINDS=new Set(['knowledge','decision','creative','product','operation','pipeline','measurement','evidence']);
const ALLOWED_AUTH=new Set(['none','approval_required','credential_required','financial_approval_required']);
const safeName=name=>{
  const raw=String(name||'').replace(/\\/g,'/').trim();
  const parts=raw.split('/').filter(Boolean);
  if(!parts.length||parts.some(x=>x==='..'))return null;
  return parts.map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').replace(/^\.+$/,'-').slice(0,100)||'file').join('/').slice(0,600)||null;
};
const mime=name=>name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.json')?'application/json':'text/markdown';

export function developmentWorkSpec(request){
  const goal=String(request||'').trim()||'Complete the requested outcome';
  return {
    request:goal,
    desiredOutcome:goal,
    assumptionsPolicy:'infer_low_risk_reversible_then_act',
    questionPolicy:'ask_only_when_missing_information_blocks_useful_progress_or_at_authority_boundary',
    successDefinition:'Produce a concrete, inspectable first version that materially advances the request without inventing external facts.',
    acceptanceCriteria:[
      'The output directly addresses the user request rather than describing how to address it.',
      'The output is concrete enough to use immediately for the non-external portion of the request.',
      'Assumptions are explicit when they materially affect the result.',
      'External actions or outcomes are never claimed without external evidence.'
    ],
    deliverables:[{
      key:'primary',
      title:'Concrete first version',
      kind:'product',
      purpose:goal,
      dependsOn:[],
      authority:'none',
      acceptanceCriteria:['Directly useful','Concrete','Inspectable','No invented evidence'],
      suggestedFiles:['v1.md']
    }],
    externalBoundaries:[],
    source:'deterministic_development_fallback'
  };
}

function normalizeSpec(raw,request){
  const base=developmentWorkSpec(request),v=raw&&typeof raw==='object'?raw:{};
  const ds=clean(v.deliverables,12).map((d,i)=>({
    key:String(d?.key||`d${i+1}`).slice(0,80),
    title:String(d?.title||`Deliverable ${i+1}`).slice(0,140),
    kind:ALLOWED_KINDS.has(String(d?.kind))?String(d.kind):'product',
    purpose:String(d?.purpose||d?.description||'').slice(0,1200),
    dependsOn:clean(d?.dependsOn,12).map(String),
    authority:ALLOWED_AUTH.has(String(d?.authority))?String(d.authority):'none',
    acceptanceCriteria:clean(d?.acceptanceCriteria,12).map(String),
    suggestedFiles:clean(d?.suggestedFiles,12).map(safeName).filter(Boolean)
  }));
  return {
    ...base,
    request:String(request||base.request),
    desiredOutcome:String(v.desiredOutcome||base.desiredOutcome),
    assumptionsPolicy:String(v.assumptionsPolicy||base.assumptionsPolicy),
    questionPolicy:String(v.questionPolicy||base.questionPolicy),
    successDefinition:String(v.successDefinition||base.successDefinition),
    acceptanceCriteria:clean(v.acceptanceCriteria,20).map(String).length?clean(v.acceptanceCriteria,20).map(String):base.acceptanceCriteria,
    deliverables:ds.length?ds:base.deliverables,
    externalBoundaries:clean(v.externalBoundaries,20).map(x=>typeof x==='string'?{description:x,authority:'approval_required'}:{description:String(x?.description||''),authority:ALLOWED_AUTH.has(String(x?.authority))?String(x.authority):'approval_required'}),
    source:'tensormux'
  };
}

export async function compileWorkSpec({request,mission=null,context=null}={}){
  const text=String(request||mission?.outcome||'').trim();
  if(!text)throw new DomainError('work_request_required',422);
  if(!tensormuxConfigured())return developmentWorkSpec(text);
  const r=await completeJsonWithTensorMux({
    timeoutMs:30000,
    system:`You are Company Zero's universal Work Compiler. Convert ANY natural-language desire into the smallest useful work contract without using an industry template. Work backward from what must be true for the user to consider the request materially advanced. Infer low-risk reversible details instead of asking setup questions. Ask only when useful progress is impossible or a consequential authority boundary is reached.\n\nReturn strict JSON with: desiredOutcome, assumptionsPolicy, questionPolicy, successDefinition, acceptanceCriteria[], deliverables[], externalBoundaries[]. Each deliverable must contain key, title, kind (knowledge|decision|creative|product|operation|pipeline|measurement|evidence), purpose, dependsOn[], authority (none|approval_required|credential_required|financial_approval_required), acceptanceCriteria[], suggestedFiles[].\n\nImportant laws:\n- The requested outcome is primary; research/planning are supporting work, never substitutes.\n- Produce useful non-external work immediately.\n- Do not invent customers, revenue, deployments, measurements, purchases, messages sent, or any external fact/action.\n- External claims require external evidence.\n- Do not create domain-specific agent personas unless the work itself requires a distinct responsibility.\n- Keep the graph minimal and causal.
- Never silently substitute documentation, advice, a plan, or generated files for causing a requested physical, transactional, communication, or external-system world change. When the requested world outcome is outside current execution authority, produce the strongest immediately useful non-external progress and state the boundary truthfully.
- Deliverable completion and requested-world-outcome completion are separate facts.`,
    user:JSON.stringify({request:text,mission:mission?.outcome||text,context:context||null})
  });
  return {...normalizeSpec(r.json,text),_usage:r.usage||null,model:r.model||null};
}

function normalizeBundle(raw,spec){
  const files=[];const seen=new Set();
  for(const item of clean(raw?.files,16)){
    const name=safeName(item?.name);if(!name||seen.has(name))continue;
    const content=String(item?.content||'');if(!content.trim())continue;
    seen.add(name);files.push({name,mimeType:String(item?.mimeType||mime(name)),content:content.slice(0,300000)});
  }
  if(!files.length)throw new DomainError('model_returned_no_deliverable_files',502);
  return {id:null,type:'general',title:String(raw?.title||spec.desiredOutcome).slice(0,120),summary:String(raw?.summary||spec.successDefinition).slice(0,500),files,createdAt:new Date().toISOString(),workSpec:{request:spec.request,desiredOutcome:spec.desiredOutcome,acceptanceCriteria:spec.acceptanceCriteria,deliverables:spec.deliverables}};
}

export async function generateWorkBundle({spec,mission=null}={}){
  if(!spec)throw new DomainError('work_spec_required',422);
  if(!tensormuxConfigured())throw new DomainError('studio_model_not_configured',503,{hint:'Configure TensorMux to generate universal deliverables.'});
  const r=await completeJsonWithTensorMux({
    timeoutMs:45000,
    system:`You are Company Zero's universal production worker. Produce the finished NON-EXTERNAL portion of the supplied work contract now. Return strict JSON only: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}.\n\nDo not return a meta-plan when a concrete usable artifact can be produced. Never imply the requested real-world outcome happened merely because you produced instructions or files for it. Use the work contract's suggestedFiles as guidance, not a rigid template. You may create multiple files when that makes the result more useful. Infer low-risk reversible assumptions. Clearly label assumptions that materially affect the result. Never claim an external action happened or an external fact is true unless it is explicitly present in supplied evidence. Do not invent citations. Do not include secrets.`,
    user:JSON.stringify({request:spec.request,mission:mission?.outcome||spec.request,workSpec:{...spec,_usage:undefined}})
  });
  return {artifact:normalizeBundle(r.json,spec),_usage:r.usage||null,builder:'tensormux-universal'};
}


export async function reviseWorkBundle({spec,artifact,review,mission=null,attempt=1}={}){
  if(!spec||!artifact)throw new DomainError('work_revision_input_required',422);
  if(!tensormuxConfigured())throw new DomainError('studio_model_not_configured',503,{hint:'Configure TensorMux to revise universal deliverables.'});
  const semantic=review?.semantic||review?.details?.semantic||{};
  const r=await completeJsonWithTensorMux({
    timeoutMs:45000,
    system:`You are Company Zero's universal revision worker. Repair a rejected deliverable so it materially satisfies the supplied work contract. Return strict JSON only: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. Preserve useful material, fix every supplied failure, and make the smallest high-leverage revision. Do not use industry templates or keyword checklists. Do not invent external facts, completed actions, measurements, customers, revenue, deployments, purchases, messages, citations, or other evidence. If a missing external fact blocks completion, improve every non-external part and state the boundary truthfully.`,
    user:JSON.stringify({request:spec.request,mission:mission?.outcome||spec.request,attempt,workSpec:{...spec,_usage:undefined},review:{scores:semantic.scores||{},failures:clean(semantic.failures,24),unsupportedClaims:clean(semantic.unsupportedClaims,24),revisionInstructions:clean(semantic.revisionInstructions,24)},artifact:{title:artifact.title,summary:artifact.summary,files:(artifact.files||[]).map(f=>({name:f.name,content:f.content}))}})
  });
  return {artifact:normalizeBundle(r.json,spec),_usage:r.usage||null,builder:'tensormux-universal-revision',attempt};
}

function structuralReview(artifact){
  const checks=[];
  checks.push({id:'files_present',label:'Deliverable contains files',passed:Array.isArray(artifact?.files)&&artifact.files.length>0});
  for(const f of artifact?.files||[]){
    checks.push({id:`nonempty:${f.name}`,label:`${f.name} is substantive`,passed:typeof f.content==='string'&&f.content.trim().length>40});
    checks.push({id:`no_todo:${f.name}`,label:`${f.name} has no obvious TODO placeholder`,passed:!/(\bTODO\b|lorem ipsum|replace me)/i.test(String(f.content||''))});
  }
  return checks;
}

export async function reviewWorkBundle({spec,artifact}={}){
  if(!spec||!artifact)throw new DomainError('work_review_input_required',422);
  const checks=structuralReview(artifact);
  if(!checks.every(x=>x.passed))throw new DomainError('deliverable_quality_check_failed',422,{checks});
  if(!tensormuxConfigured())return {passed:true,checks,semantic:{skipped:true,reason:'tensormux_not_configured'}};
  const r=await completeJsonWithTensorMux({
    timeoutMs:30000,
    system:`You are Company Zero's universal outcome critic. Judge whether the produced files materially satisfy the supplied work contract. Do not reward polished meta-plans that fail to provide the requested usable output. Reject any artifact that represents instructions/documentation as proof that a requested real-world state actually occurred. Return strict JSON: {passed:boolean, scores:{directness:number,usefulness:number,completeness:number,truthfulness:number}, failures:string[], unsupportedClaims:string[], revisionInstructions:string[]}. Scores are 0..1. passed may be true only when directness>=0.8, usefulness>=0.75, completeness>=0.7, truthfulness>=0.95, and unsupportedClaims is empty. Evaluate semantically; do not use domain-specific keyword checklists.`,
    user:JSON.stringify({request:spec.request,successDefinition:spec.successDefinition,acceptanceCriteria:spec.acceptanceCriteria,deliverables:spec.deliverables,artifact:{title:artifact.title,summary:artifact.summary,files:(artifact.files||[]).map(f=>({name:f.name,content:f.content}))}})
  });
  const semantic=r.json||{};const scores=semantic.scores||{};
  const passed=semantic.passed===true&&Number(scores.directness)>=.8&&Number(scores.usefulness)>=.75&&Number(scores.completeness)>=.7&&Number(scores.truthfulness)>=.95&&clean(semantic.unsupportedClaims).length===0;
  const allChecks=[...checks,{id:'semantic_directness',label:'Directly addresses request',passed:Number(scores.directness)>=.8},{id:'semantic_usefulness',label:'Immediately useful',passed:Number(scores.usefulness)>=.75},{id:'semantic_completeness',label:'Sufficiently complete V1',passed:Number(scores.completeness)>=.7},{id:'semantic_truthfulness',label:'No unsupported external claims',passed:Number(scores.truthfulness)>=.95&&clean(semantic.unsupportedClaims).length===0}];
  if(!passed)throw new DomainError('deliverable_semantic_quality_failed',422,{checks:allChecks,semantic});
  return {passed:true,checks:allChecks,semantic,model:r.model||null};
}
