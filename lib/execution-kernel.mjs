const clean=s=>String(s||'').trim();

function classify(text,interactionRoute=''){
  const lower=text.toLowerCase();
  const scores={general:0,lead_generation:0,company_creation:0,sales_strategy:0,research:0,product_build:0,artifact_creation:0,optimization:0};
  const add=(kind,re,n)=>{if(re.test(lower))scores[kind]+=n};
  add('company_creation',/\b(make|build|create|start|launch|form)\b[^.]{0,80}\b(company|startup|business|brand|venture|store|bakery)\b|\b(company|startup|business|brand|venture|store|bakery)\b[^.]{0,80}\b(make|build|create|start|launch|form)\b/,8);
  add('company_creation',/\b(brand name|visual identity|pricing strategy|business model|product lineup|go-to-market|launch plan|unit economics|starting budget|positioning|validation)\b/,4);
  add('sales_strategy',/\b(sell|market|distribute|position)\b[^.]{0,100}\b(to|for)\b[^.]{0,80}\b(people|customers?|buyers?|professionals?|families|businesses|hnwis?|rich|wealthy|luxury|premium)\b/,8);
  add('sales_strategy',/\b(luxury|premium|high[- ]end|hnwi|wealthy|rich)\b/,2);
  add('lead_generation',/\b(find|identify|research|rank|give me|return)\b[^.]{0,60}\b(clients?|leads?|prospects?)\b/,7);
  add('lead_generation',/\b(outreach|prospecting|qualified leads?)\b/,2);
  add('research',/\b(research|investigate|compare|verify|discover|look up)\b/,3);
  add('product_build',/\b(site|website|landing page|web page|app|api|software|code|frontend|backend|product)\b[^.]{0,50}\b(build|make|create|fix|improve|ship|design|launch)\b|\b(build|make|create|fix|improve|ship|design|launch)\b[^.]{0,50}\b(site|website|landing page|web page|app|api|software|code|frontend|backend|product)\b/,6);
  add('artifact_creation',/\b(write|draft|prepare|summarize|generate)\b/,2);
  add('optimization',/\b(improve|reduce|increase|cut|optimi[sz]e|grow)\b/,2);
  if(interactionRoute==='investigate')scores.research+=5;
  if(scores.company_creation>=8&&scores.lead_generation<7)scores.company_creation+=4;
  return Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][1]>0?Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0]:'general';
}

function requestedContract(text,kind){
  const lower=text.toLowerCase();const required=[];
  const wants=(re,label)=>{if(re.test(lower))required.push(label)};
  wants(/brand name|name and explain|strong brand name/,'brand_name');
  wants(/product lineup|three products|initial product/,'product_lineup');
  wants(/pricing|price/,'pricing');
  wants(/packaging|visual identity|visual direction/,'brand_direction');
  wants(/launch offer/,'launch_offer');
  wants(/30-day|go-to-market|launch plan/,'go_to_market');
  wants(/unit economics/,'unit_economics');
  wants(/budget|where the initial money|where.*money should go/,'budget_allocation');
  wants(/instagram.*post/,'instagram_post');
  wants(/customer-facing launch message|launch message/,'launch_message');
  wants(/partnership outreach|outreach message/,'partnership_outreach');
  wants(/brand brief/,'brand_brief');
  wants(/validation tracker/,'validation_tracker');
  return {kind,required:[...new Set(required)],askPolicy:/don'?t wait|do not wait|unless.*blocked/.test(lower)?'continue_unless_blocked':'ask_if_materially_blocked'};
}

export function compileExecutionPlan(request,{interactionRoute='',needsFreshEvidence=false}={}){
  const text=clean(request);const kind=classify(text,interactionRoute);
  const templates={
    lead_generation:{objective:'Return concrete, ranked prospects the user can act on.',units:['Identify the offer and target buyer','Gather current prospect evidence','Rank candidates by fit','Produce outreach angles and next actions'],outputs:['ranked-prospects.md','outreach-angles.md'],evidence:true},
    company_creation:{objective:'Assemble the smallest organization that can turn the requested venture outcome into usable operating assets.',units:['Define the venture contract and constraints','Choose the market wedge and target customer','Design positioning, offer and economics','Build launch assets and validation system','Evaluate every deliverable against the original outcome'],outputs:['brand-brief.md','launch-kit.md','economics-and-validation.md'],evidence:false},
    sales_strategy:{objective:'Turn an offer and target segment into a concrete, testable sales strategy without pretending assumptions are facts.',units:['Define the target customer as a hypothesis','Shape the offer and positioning','Choose channels and outreach paths','Set labelled pricing and economics assumptions','Define the first validation test'],outputs:['customer-hypothesis.md','offer-and-positioning.md','channel-plan.md','economics-assumptions.md','validation-plan.md'],evidence:false},
    research:{objective:'Answer the research question with current, attributable evidence.',units:['Clarify the decision the research must support','Collect current evidence','Compare and synthesize findings','Return a decision-ready conclusion'],outputs:['research-brief.md'],evidence:true},
    product_build:{objective:'Produce a build-ready first version, not a generic plan.',units:['Infer the smallest useful scope','Choose implementation approach','Specify concrete screens/components/interfaces','Produce build artifacts or implementation instructions','Define verification'],outputs:['build-spec.md','acceptance-checklist.md'],evidence:false},
    optimization:{objective:'Define the measurable change, diagnose likely causes, and produce the first intervention.',units:['Define the metric and current-state assumptions','Find likely bottlenecks','Choose the highest-leverage reversible intervention','Define measurement and rollback'],outputs:['optimization-plan.md'],evidence:needsFreshEvidence},
    artifact_creation:{objective:'Produce the requested artifact directly.',units:['Infer format and audience','Draft the artifact','Check for completeness and usability'],outputs:['deliverable.md'],evidence:false},
    general:{objective:'Translate the request into the first concrete useful result.',units:['Infer the intended outcome','Choose the smallest useful deliverable','Produce it','Evaluate it against the request'],outputs:['result.md'],evidence:needsFreshEvidence}
  };
  const spec=templates[kind]||templates.general;const contract=requestedContract(text,kind);
  const functions=kind==='company_creation'?['venture_strategy','brand','finance','go_to_market','verification']:kind==='lead_generation'?['prospect_research','qualification','outreach','verification']:kind==='sales_strategy'?['market_strategy','offer_design','channel_strategy','economics','verification']:['planning','execution','verification'];
  return {kind,request:text,objective:spec.objective,workUnits:spec.units.map((title,index)=>({id:index+1,title,state:index===0?'active':'queued'})),expectedOutputs:spec.outputs,requiresFreshEvidence:Boolean(needsFreshEvidence||spec.evidence),contract,organization:{mission:kind,functions},assumptionsPolicy:'Infer low-risk reversible details; ask only when a missing fact would materially change the result or an irreversible action is required.',truthPolicy:'Do not claim external actions, measurements, customers, purchases, deployments, research, or verification without evidence. When no external evidence is available, clearly label market, customer, feature, pricing, margin and channel specifics as proposals, assumptions or hypotheses.'};
}

export function usefulFallback(request,plan,{reason='reasoning_unavailable',publicEvidence=null}={}){
  const goal=clean(request);const sources=(publicEvidence?.results||[]).slice(0,8);
  if(plan.kind==='company_creation'){
    const content=`# Venture operating brief\n\n## Outcome\n${goal}\n\n## Organization assembled\nVenture strategy → Brand → Finance → Go-to-market → Verification. This organization is provisional and should be restructured if its outputs fail the mission contract.\n\n## First operating move\nStart with one narrow customer segment, three testable offers at most, a constrained launch budget, and direct validation before fixed-cost expansion.\n\n## Required deliverables still owed\n${(plan.contract?.required||[]).map(x=>`- ${x.replaceAll('_',' ')}`).join('\n')||'- venture brief\n- offer\n- validation plan'}\n\n## Truth boundary\nThe reasoning provider degraded. No current market facts, suppliers, prices, sales or external actions are claimed without evidence. This artifact preserves the mission contract instead of silently substituting another workflow.`;
    return {title:'Venture contract preserved — execution degraded',summary:'The correct venture-building organization and deliverable contract were preserved; deeper execution can retry without changing the mission.',files:[{name:'venture-contract.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:null};
  }
  if(plan.kind==='sales_strategy'){
    const content=`# Sales strategy hypothesis\n\n## Outcome\n${goal}\n\n## Organization assembled\nMarket strategy → Offer design → Channel strategy → Economics → Verification.\n\n## First move\nTreat customer profile, product features, pricing, margins and channel choices as hypotheses until tested or researched. Build one premium offer, one primary channel and one measurable validation test before expanding.\n\n## Truth boundary\nNo current market facts, named partner fit, demographic facts, pricing benchmarks or product capabilities are claimed without evidence.`;
    return {title:'Sales strategy contract preserved — execution degraded',summary:'A truthful sales-strategy frame is preserved without inventing luxury-market facts.',files:[{name:'sales-strategy-hypothesis.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:null};
  }
  if(plan.kind==='lead_generation'&&sources.length){const content=`# Grounded prospect evidence\n\n## Objective\n${goal}\n\n${sources.map((x,i)=>`### ${i+1}. ${x.title||'Source'}\n${x.url}\n${x.snippet||''}`).join('\n\n')}\n\nNo prospect is labeled qualified beyond the evidence shown.`;return {title:'Grounded prospect evidence collected',summary:`${sources.length} public sources are ready for ranking.`,files:[{name:'prospect-evidence.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:{queries:publicEvidence?.queries||[],results:sources}};}
  const content=`# Working result\n\n## Objective\n${goal}\n\n## Execution plan\n${plan.workUnits.map((u,i)=>`${i+1}. ${u.title}`).join('\n')}\n\n## Truth boundary\n${plan.truthPolicy}`;return {title:`Working result — ${goal.slice(0,70)}`,summary:'The mission contract is preserved while live reasoning recovers.',files:[{name:'working-result.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,results:sources}:null};
}

export function qualityCheck(result,plan){
  const files=Array.isArray(result?.files)?result.files:[];
  const text=files.map(f=>clean(f?.content)).join('\n').toLowerCase();
  const reasons=[];
  if(!files.length)reasons.push('no_files');
  if(text.length<220)reasons.push('too_thin');
  if(/could not complete|couldn.t complete|try again|reasoning service|request was saved|work is underway|will appear here/.test(text))reasons.push('workflow_theatre');
  if(plan.kind==='company_creation'&&!/(customer|position|offer|business model|validation|launch)/.test(text))reasons.push('missing_company_substance');
  if(plan.kind==='lead_generation'){
    if(!/https?:\/\//.test(text)||!/(prospect|client|lead)/.test(text)||!/(fit|why|outreach|next action)/.test(text))reasons.push('missing_lead_substance');
  }
  if(plan.kind==='sales_strategy'&&!/(customer|segment|offer|position|channel|pricing|validation)/.test(text))reasons.push('missing_sales_substance');
  if(plan.kind==='research'){
    if(!/(https?:\/\/|source|citation|evidence)/.test(text)||!/(compare|finding|conclusion|recommend)/.test(text))reasons.push('missing_research_substance');
  }
  if(plan.kind==='product_build'){
    if(!/(component|screen|section|interface|endpoint|implementation|react|html|css|acceptance|cta|layout)/.test(text))reasons.push('missing_build_substance');
  }
  if(plan.kind==='optimization'){
    if(!/(metric|baseline|measure|experiment|intervention|rollback|target)/.test(text))reasons.push('missing_optimization_substance');
  }
  if(plan.kind==='artifact_creation'&&!/(draft|subject|headline|section|message|memo|brief|copy|content)/.test(text))reasons.push('missing_artifact_substance');
  const checks={brand_name:/brand|name/,product_lineup:/product|lineup/,pricing:/price|pricing|₦|ngn/,brand_direction:/packag|visual|identity/,launch_offer:/launch|offer/,go_to_market:/30.day|go.to.market|whatsapp|instagram/,unit_economics:/unit economics|margin|cost per|gross profit/,budget_allocation:/budget|allocation|₦|ngn/,instagram_post:/instagram/,launch_message:/launch message|customer-facing|whatsapp/,partnership_outreach:/partner|café|cafe|office|outreach/,brand_brief:/brand brief|positioning/,validation_tracker:/validation|tracker|experiment/};
  const missing=(plan.contract?.required||[]).filter(k=>checks[k]&&!checks[k].test(text));
  if(missing.length)reasons.push(`contract_mismatch:${missing.join('|')}`);
  const hasEvidence=Boolean(result?.publicEvidence?.results?.length);
  const hasSpecificNumbers=/[$€£₦]\s?\d|\b\d+(?:\.\d+)?%|\b\d+[mk]\+?\b/i.test(text);
  const labelsAssumptions=/\b(assumption|hypothesis|estimate|estimated|illustrative|proposed|target|placeholder|test range|to validate)\b/i.test(text);
  const definitiveClaims=/\b(unbreakable|100% waterproof|self-cleaning|increasingly values|deep appreciation|high propensity|direct access to hnwis|absolute dryness|zero maintenance)\b/i.test(text);
  if(!hasEvidence&&hasSpecificNumbers&&!labelsAssumptions)reasons.push('unlabelled_estimates');
  if(!hasEvidence&&definitiveClaims)reasons.push('unsupported_specific_claims');
  const structuralReasons=['missing_company_substance','missing_sales_substance','missing_lead_substance','missing_research_substance','missing_build_substance','missing_optimization_substance','missing_artifact_substance','unsupported_specific_claims'];
  return {ok:reasons.length===0,reasons,contract:{required:plan.contract?.required||[],missing},structuralFailure:missing.length>=2||structuralReasons.some(reason=>reasons.includes(reason))};
}
