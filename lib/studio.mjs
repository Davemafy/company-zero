import {DomainError,validateSchema} from './contracts.mjs';
import {completeJsonWithTensorMux,tensormuxConfigured} from './tensormux.mjs';
import {compileWorkSpec,generateWorkBundle,reviewWorkBundle,reviseWorkBundle} from './work-compiler.mjs';

export function studioProviderInput(){
  return {
    name:'Company Zero Studio',
    type:'internal',
    config:{builtin:'studio',version:1},
    capabilities:[
      {
        name:'understand_brief',
        description:'Turn a plain-language outcome into a concrete deliverable brief.',
        risk:'read',
        internalAction:'studio.plan',
        inputSchema:{type:'object',additionalProperties:true},
        outputSchema:{type:'object'}
      },
      {
        name:'build_deliverable',
        description:'Create the actual requested deliverable as inspectable files.',
        risk:'read',
        internalAction:'studio.build',
        operationKind:'change',
        changes:['deliverable'],
        effectModalities:['informational','digital'],
        stateDomains:['mission_state','mission_outcome','deliverable'],
        acceptsMissionEnvelope:true,
        inputSchema:{type:'object',additionalProperties:true},
        outputSchema:{type:'object'}
      },
      {
        name:'quality_review',
        description:'Review the generated deliverable and return the accepted artifact with QA evidence.',
        risk:'read',
        internalAction:'studio.review',
        inputSchema:{type:'object',additionalProperties:true},
        outputSchema:{type:'object'}
      }
    ]
  };
}

export async function invokeStudioCapability(cap,input,{mission}={}){
  const errors=validateSchema(cap.inputSchema,input);
  if(errors.length)throw new DomainError('invalid_capability_arguments',422,errors);
  const started=Date.now();
  let output;
  if(cap.internalAction==='studio.plan') output=await plan(input,mission);
  else if(cap.internalAction==='studio.build') output=await build(input,mission);
  else if(cap.internalAction==='studio.review') output=await review(input);
  else throw new DomainError('unknown_internal_capability',422,{action:cap.internalAction});
  const outErrors=validateSchema(cap.outputSchema,output);
  if(outErrors.length)throw new DomainError('invalid_capability_output',502,outErrors);
  return {output,cost:Number(output?._usage?.estimatedCostUsd||0),latencyMs:Date.now()-started};
}

async function plan(input,mission){
  const brief=extractBrief(input,mission);
  const workSpec=await compileWorkSpec({request:brief,mission});
  const deliverableType=inferType(brief);
  return {brief,deliverableType,goal:mission?.outcome||brief,acceptanceCriteria:workSpec.acceptanceCriteria,workSpec,createdBy:'Company Zero Work Compiler',_usage:workSpec._usage||null};
}

async function build(plan,mission){
  const brief=plan?.brief||mission?.outcome||'Create the requested deliverable';
  if(!tensormuxConfigured()){
    if(!fallbackAllowed())return missingModel();
    return {plan,artifact:fallbackArtifact(plan?.deliverableType||inferType(brief),brief),builder:'deterministic-development-fallback'};
  }
  const spec=plan?.workSpec||await compileWorkSpec({request:brief,mission});
  const built=await generateWorkBundle({spec,mission});
  const artifact={...built.artifact,type:plan?.deliverableType||'general'};
  return {plan:{...plan,workSpec:spec},artifact,_usage:built._usage||null,builder:built.builder};
}

async function review(input){
  let artifact=input?.artifact;
  if(!artifact||!Array.isArray(artifact.files)||!artifact.files.length)throw new DomainError('deliverable_missing_files',502);
  const spec=input?.plan?.workSpec||developmentReviewSpec(input?.plan,artifact);
  const maxRevisions=Math.max(0,Math.min(3,Number(process.env.STUDIO_MAX_REVISIONS||2)));
  const revisions=[];
  let result;
  for(let attempt=0;;attempt++){
    try{
      result=await reviewWorkBundle({spec,artifact});
      break;
    }catch(error){
      if(error?.message!=='deliverable_semantic_quality_failed'||attempt>=maxRevisions||!tensormuxConfigured())throw error;
      const revised=await reviseWorkBundle({spec,artifact,review:error,attempt:attempt+1});
      revisions.push({attempt:attempt+1,reason:error.message,semantic:error?.details?.semantic||null,builder:revised.builder});
      artifact={...revised.artifact,type:artifact.type||revised.artifact.type||'general'};
    }
  }
  const checks=[...result.checks];
  const names=new Set(artifact.files.map(f=>f.name));
  if(artifact.type==='website'){
    const html=artifact.files.find(f=>f.name==='index.html')?.content||'';
    checks.push({id:'website_entry',label:'Website has index.html',passed:names.has('index.html')});
    checks.push({id:'viewport',label:'Website is mobile-ready',passed:/name=["']viewport["']/i.test(html)});
    checks.push({id:'title',label:'Website has a page title',passed:/<title>[^<]+<\/title>/i.test(html)});
  }
  if(!checks.every(x=>x.passed))throw new DomainError('deliverable_quality_check_failed',422,{checks});
  return {artifact,qa:{passed:true,semanticVerified:!result.semantic?.skipped,checks,semantic:result.semantic||null,revisions,reviewedAt:new Date().toISOString()},plan:input.plan||null};
}

function developmentReviewSpec(plan,artifact){
  const request=String(plan?.brief||plan?.goal||artifact?.summary||artifact?.title||'Complete the requested outcome');
  return {request,desiredOutcome:request,successDefinition:'Produce a concrete useful first version without inventing external facts.',acceptanceCriteria:plan?.acceptanceCriteria||['Directly useful','Concrete','Truthful'],deliverables:[{key:'primary',title:artifact?.title||'Primary deliverable',kind:'product',purpose:request,dependsOn:[],authority:'none',acceptanceCriteria:plan?.acceptanceCriteria||[],suggestedFiles:(artifact?.files||[]).map(f=>f.name)}]};
}

function builderPrompt(type){
  const shared='You are the production worker inside Company Zero. Create the finished deliverable, not a plan. Return strict JSON only: {"title":string,"summary":string,"files":[{"name":string,"mimeType":string,"content":string}]}. Do not wrap file content in markdown fences. Never include secrets. Keep total output practical.';
  if(type==='website')return `${shared} Build a polished, responsive static website. Return exactly index.html, styles.css, main.js. index.html must reference styles.css and main.js, include semantic structure, viewport metadata, accessible labels, and real copy derived from the brief. No external JavaScript dependencies. Use CSS for a distinctive professional visual system. main.js should add only useful lightweight interactions.`;
  if(type==='report')return `${shared} Create a report as report.md. Clearly separate user-supplied facts from analysis. Do not invent citations, statistics or external research. If evidence is missing, state the gap in the report.`;
  if(type==='campaign')return `${shared} Create launch-plan.md, social-copy.md and landing-copy.md with complete usable campaign material derived only from the supplied brief.`;
  return `${shared} Create the strongest concrete Version 1 of the requested outcome now. Infer sensible low-risk, reversible assumptions instead of asking setup questions. For complex outcomes, return a coherent bundle of multiple named markdown/text artifacts rather than a single vague plan. Derive the bundle from the request, never from a vertical template. Research, reasoning and planning are supporting work, not substitutes for the requested deliverable. Clearly label assumptions and never invent external facts, completed real-world actions, customers, revenue, legal status, deployments, measurements or citations.`;
}

function normalizeArtifact(raw,type,brief){
  const files=Array.isArray(raw?.files)?raw.files:[];
  if(!files.length)throw new DomainError('model_returned_no_deliverable_files',502);
  const seen=new Set();
  const normalized=[];
  for(const item of files.slice(0,8)){
    const name=safeName(item?.name);
    if(!name||seen.has(name))continue;
    const content=String(item?.content||'');
    if(!content.trim())continue;
    seen.add(name); normalized.push({name,mimeType:String(item?.mimeType||mime(name)),content:content.slice(0,300000)});
  }
  if(type==='website'&&!normalized.some(f=>f.name==='index.html'))throw new DomainError('website_missing_index',502);
  return {id:null,type,title:String(raw?.title||titleFromBrief(brief)).slice(0,120),summary:String(raw?.summary||`Deliverable for: ${brief}`).slice(0,500),files:normalized,createdAt:new Date().toISOString()};
}

function fallbackArtifact(type,brief){
  if(type==='website'){
    const title=titleFromBrief(brief);
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="styles.css"></head><body><header><a class="brand" href="#">${escapeHtml(title)}</a><nav><a href="#about">About</a><a href="#contact">Contact</a></nav></header><main><section class="hero"><p class="kicker">BUILT BY COMPANY ZERO</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(brief)}</p><a class="cta" href="#contact">Get started</a></section><section id="about" class="grid"><article><span>01</span><h2>Clear purpose</h2><p>A focused experience built around the outcome you described.</p></article><article><span>02</span><h2>Responsive by default</h2><p>Designed to work cleanly across phones, tablets and desktop screens.</p></article><article><span>03</span><h2>Ready to edit</h2><p>Plain HTML, CSS and JavaScript with no framework lock-in.</p></article></section><section id="contact" class="contact"><p>READY WHEN YOU ARE</p><h2>Turn the brief into something people can use.</h2></section></main><footer>Company Zero · autonomous delivery</footer><script src="main.js"></script></body></html>`;
    const css=`*{box-sizing:border-box}body{margin:0;background:#0b0c09;color:#f2f4ed;font-family:Arial,sans-serif}a{color:inherit;text-decoration:none}header{height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 6vw;border-bottom:1px solid #282c22}.brand{font-weight:800}nav{display:flex;gap:24px;color:#aab09f}.hero{min-height:70vh;display:flex;flex-direction:column;justify-content:center;padding:8vw 6vw;max-width:1000px}.kicker,.grid span,.contact>p{font:12px monospace;letter-spacing:.12em;color:#d9ff72}.hero h1{font-size:clamp(48px,8vw,110px);line-height:.94;letter-spacing:-.06em;margin:12px 0 24px}.hero>p{max-width:720px;color:#aab09f;font-size:18px;line-height:1.7}.cta{margin-top:28px;background:#d9ff72;color:#0b0c09;padding:13px 18px;border-radius:10px;width:max-content;font-weight:800}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#282c22;margin:0 6vw}.grid article{background:#10120e;padding:32px}.grid p{color:#969d8f}.contact{margin:10vw 6vw;padding:7vw;border:1px solid #30352a;border-radius:24px}.contact h2{font-size:clamp(34px,5vw,70px);letter-spacing:-.05em;max-width:800px}footer{padding:28px 6vw;color:#7e8577;border-top:1px solid #282c22}@media(max-width:700px){nav{display:none}.grid{grid-template-columns:1fr}.hero{padding-top:18vw}}`;
    const js=`document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const id=a.getAttribute('href');if(id.length>1){e.preventDefault();document.querySelector(id)?.scrollIntoView({behavior:'smooth'})}}));`;
    return {id:null,type:'website',title,summary:`A working static website generated from the brief.`,files:[{name:'index.html',mimeType:'text/html',content:html},{name:'styles.css',mimeType:'text/css',content:css},{name:'main.js',mimeType:'text/javascript',content:js}],createdAt:new Date().toISOString()};
  }
  return {id:null,type,title:titleFromBrief(brief),summary:'Development fallback deliverable',files:type==='report'?[{name:'report.md',mimeType:'text/markdown',content:`# ${titleFromBrief(brief)}\n\n## Request\n\n${brief}\n\n## Evidence status\n\nNo external research was performed in this deterministic development fallback. Configure TensorMux and observation capabilities for production research.\n\n## Version 1\n\nThis file proves the report artifact path without inventing external facts.\n`}]:type==='campaign'?[{name:'launch-plan.md',mimeType:'text/markdown',content:`# ${titleFromBrief(brief)} — Launch V1\n\n## Request\n${brief}\n\n## Assumptions\nOnly reversible assumptions should be used until evidence or user authority is available.\n\n## Sequence\n1. Prepare positioning.\n2. Prepare launch assets.\n3. Validate before consequential external action.\n`},{name:'social-copy.md',mimeType:'text/markdown',content:`# Social Copy V1\n\nDraft copy for: ${brief}\n\nThis development fallback intentionally avoids invented traction, customers or metrics.\n`},{name:'landing-copy.md',mimeType:'text/markdown',content:`# Landing Copy V1\n\n## Headline\n${titleFromBrief(brief)}\n\n## Supporting copy\nA first-pass message derived only from the supplied request.\n`}]:[{name:'v1.md',mimeType:'text/markdown',content:`# ${titleFromBrief(brief)} — Version 1\n\n## Request\n${brief}\n\n## Concrete first version\nThis deterministic development fallback proves the multi-file deliverable pipeline. Production content is generated by TensorMux.\n`},{name:'assumptions.md',mimeType:'text/markdown',content:`# Reversible assumptions\n\n- Infer only low-risk details needed to begin.\n- Do not invent external facts, customers, revenue, deployments, legal status or measurements.\n- Ask only at genuine authority boundaries.\n`},{name:'next-actions.md',mimeType:'text/markdown',content:`# Next actions\n\nContinue building and validating the requested outcome: ${brief}\n\nExternal actions remain gated by connected capabilities and user authority.\n`}],createdAt:new Date().toISOString()};
}

function extractBrief(input,mission){
  if(typeof input==='string')return input;
  return String(input?.task||input?.brief||input?.request||input?.customerMessage||mission?.outcome||JSON.stringify(input||{}));
}
function inferType(s=''){const x=s.toLowerCase();if(/website|landing page|web page|site\b|frontend/.test(x))return'website';if(/research|report|analysis|market study/.test(x))return'report';if(/campaign|launch|social|marketing/.test(x))return'campaign';if(/document|proposal|memo|brief/.test(x))return'document';return'general'}
function criteria(type){return type==='website'?['Working index.html','Responsive layout','No obvious placeholders','Inspectable source files']:['Concrete finished files','No invented evidence','Inspectable output']}
function fallbackAllowed(){return process.env.NODE_ENV!=='production'||process.env.STUDIO_ALLOW_FALLBACK==='true'}
function missingModel(){throw new DomainError('studio_model_not_configured',503,{hint:'Configure TensorMux to produce project deliverables.'})}
function safeName(name){const raw=String(name||'').replace(/\\/g,'/');const parts=raw.split('/').filter(Boolean);if(!parts.length||parts.some(x=>x==='..'))return null;const clean=parts.filter(x=>x!=='.').map(x=>x.replace(/[^a-zA-Z0-9._ -]/g,'-').replace(/^\.+$/,'-').slice(0,100)||'file');return clean.join('/').slice(0,600)||null}
function mime(name){if(name.endsWith('.html'))return'text/html';if(name.endsWith('.css'))return'text/css';if(name.endsWith('.js'))return'text/javascript';if(name.endsWith('.json'))return'application/json';return'text/markdown'}
function titleFromBrief(s=''){return String(s).replace(/[.!?].*$/,'').trim().slice(0,70)||'Company Zero Deliverable'}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
