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
  add('research',/^\s*(research|investigate|compare|verify|discover|look up)\b/,6);
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
  wants(/\bproduct lineup\b|\b(?:three|3)\b(?:\s+[a-z0-9&+/-]+){0,3}\s+products?\b|\binitial product\b/,'product_lineup');
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
    company_creation:{objective:'Assemble the smallest organization that can turn the requested venture outcome into usable operating assets.',units:['Define the venture contract and constraints','Choose the market wedge and target customer','Design positioning, offer and economics','Build launch assets and validation system','Evaluate every deliverable against the original outcome'],outputs:['brand-brief.md','launch-kit.md','economics-and-validation.md'],evidence:true},
    sales_strategy:{objective:'Turn an offer and target segment into a concrete, testable sales strategy without pretending assumptions are facts.',units:['Define the target customer as a hypothesis','Shape the offer and positioning','Choose channels and outreach paths','Set labelled pricing and economics assumptions','Define the first validation test'],outputs:['customer-hypothesis.md','offer-and-positioning.md','channel-plan.md','economics-assumptions.md','validation-plan.md'],evidence:true},
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

export function usefulFallback(request,plan,{reason='reasoning_unavailable',publicEvidence=null,roleTelemetry=null,roleTelemetrySummary=null}={}){
  const goal=clean(request),sources=(publicEvidence?.results||[]).slice(0,8);
  const evidence=publicEvidence?.ok?{queries:publicEvidence.queries||[],results:sources}:null;
  const telemetryFields={roleTelemetry:Array.isArray(roleTelemetry)?roleTelemetry.filter(Boolean):[],roleTelemetrySummary:roleTelemetrySummary||null};
  if(plan.kind==='company_creation'){
    const fashion=/\b(fashion|clothing|apparel|wear|garment)\b/i.test(goal);
    const brandBrief=fashion
      ? `# Provisional fashion brand brief

## Outcome
${goal}

## Status
PARTIAL working artifact. The execution providers degraded, so every market/customer/product choice below is a **PROPOSAL / ASSUMPTION**, not a verified fact.

## Working wedge — PROPOSAL
Launch as a focused label with **one recognizable hero garment or silhouette** and a small supporting capsule, rather than trying to prove a full collection at once.

## First customer — ASSUMPTION TO VALIDATE
A style-conscious repeat-wear buyer who wants a distinctive everyday piece without needing a full wardrobe replacement. Do not treat age, income, geography, willingness to pay, or market size as known until validated.

## Positioning — PROPOSAL
**A small wardrobe with a clear point of view: one strong silhouette, easy repeat wear, and deliberate drops.**

Draft message:
> Fewer pieces. Stronger point of view.

Draft CTA:
> Join the first drop.

## Product architecture — PROPOSAL
1. Pick one hero category that can carry the visual identity.
2. Add at most two complementary pieces only after the hero concept is coherent.
3. Keep colour/material choices narrow enough that feedback can identify what customers actually respond to.
4. Do not commit to production quantity, supplier, fabric performance, or delivery dates until those facts are verified.

## Naming brief
Choose a name only after trademark/domain/social-handle checks. The name should be short, pronounceable, visually strong in type, and broad enough to survive beyond the first product.

## Decisions that still require evidence
- Which customer segment responds most strongly.
- Which hero category earns actual intent, not compliments.
- Acceptable price range and margin.
- Supplier capability, minimums, lead time and quality.
- Which acquisition channel converts efficiently.

## Truth boundary
No market size, competitor performance, price benchmark, supplier capability, sales result or external action is asserted here as fact.
`
      : `# Provisional venture brief

## Outcome
${goal}

## Status
PARTIAL working artifact. The execution providers degraded, so the operating choices below are **PROPOSALS / ASSUMPTIONS**, not verified facts.

## Working wedge — PROPOSAL
Start with one narrowly defined first customer and one hero offer that solves a repeated, observable problem. Avoid a broad catalogue until real demand signals identify what deserves expansion.

## Positioning — PROPOSAL
Make the first offer easy to explain in one sentence: **For [specific early customer], we provide [specific outcome] through [specific first offer], without [main alternative/friction].**

## Offer architecture — PROPOSAL
1. One hero offer.
2. One primary acquisition path.
3. One explicit conversion action.
4. One validation loop before fixed-cost expansion.

## Decisions that still require evidence
- First customer segment.
- Willingness to pay.
- Delivery/supply constraints.
- Acquisition economics.
- Competitive alternatives and switching reason.

## Truth boundary
No market size, customer count, price benchmark, supplier capability, revenue or external action is asserted here as fact.
`;

    const launchKit=fashion
      ? `# Provisional fashion launch kit

## Outcome
${goal}

## Launch principle
This is a **reversible validation plan**, not evidence that demand exists.

## Landing page draft
**Headline:** Fewer pieces. Stronger point of view.

**Body:** A focused first drop built around one recognizable piece. Join early to see the concept, shape the details, and get first access when the product is ready.

**Primary CTA:** Join the first drop

**Proof area:** Do not fabricate testimonials, sell-through, waitlist size, press coverage, materials, sustainability claims, or delivery dates. Show only product/process evidence that actually exists.

## Social launch draft
> We are building the first drop around one idea: make one piece worth repeating. The concept is still being validated. If you would wear it, tell us what matters most — fit, fabric, colour, price, or styling — and join the first-drop list.

## Customer interview prompt
1. Show the concept without explaining the intended answer.
2. Ask what they think the product is for and when they would wear it.
3. Ask what they would compare it with before buying.
4. Ask what would stop them buying.
5. Ask for a concrete next action: waitlist, sizing preference, deposit only when fulfilment terms are real, or a follow-up.

## Validation sequence
1. Publish one concept page with one CTA.
2. Test a small set of clearly different creative angles around the same hero product.
3. Record visits, CTA actions, interview objections and repeated wording.
4. Keep a decision log: continue, revise, or stop.
5. Expand the assortment only after the hero concept produces a repeatable intent signal.

## Stop rules
Pause or revise if feedback is only aesthetic praise with no concrete buying intent, if fulfilment assumptions remain unknown, or if the required economics cannot support the proposed price.

## Truth boundary
This kit contains proposed copy and experiments. It does not claim that a launch, sale, customer acquisition, supplier agreement or product validation has happened.
`
      : `# Provisional launch kit

## Outcome
${goal}

## Launch principle
Treat this as a reversible validation plan, not evidence that demand exists.

## Draft message
We are testing a focused first offer for a specific early customer. The goal is to learn whether the problem, promise and offer are strong enough to earn a concrete next action before scaling spend or scope.

## Primary CTA
Choose one observable intent action appropriate to the venture: join a waitlist, request a demo, start a trial, book a call, or place an order only when fulfilment is genuinely ready.

## Validation sequence
1. Put one hero offer in front of a narrowly defined early customer.
2. Capture objections and alternative solutions in their own words.
3. Measure one conversion action.
4. Keep a continue / revise / stop decision log.
5. Expand only after the first offer earns repeatable intent.

## Truth boundary
No launch, customer acquisition, conversion rate, partnership or sale is claimed to have happened.
`;

    const evidenceLines=sources.length
      ? sources.map((x,i)=>`${i+1}. ${x.title||'Source'} — ${x.url}`).join('\n')
      : 'No external source receipts were available to this degraded pass.';
    const economics=`# Economics and validation sheet

## Outcome
${goal}

## Status
PARTIAL working artifact. Numerical values are intentionally left as variables until they are measured, quoted, or explicitly chosen as assumptions.

## Unit-economics model
Use:
- **P** = selling price per unit/order
- **C** = direct cost per unit/order
- **F** = fulfilment/transaction cost per unit/order
- **A** = attributable acquisition cost per converted customer
- **R** = expected refund/return allowance per unit/order
- **O** = fixed launch/operating cost for the test

Then calculate:
- **Gross profit per unit = P - C**
- **Contribution before acquisition = P - C - F - R**
- **Contribution after acquisition = P - C - F - R - A**
- **Break-even units = O / contribution after acquisition** when contribution is positive

Do not insert a price, margin, return rate, acquisition cost or break-even claim until its source or assumption is recorded beside it.

## Assumption register
| Variable | Current value | Status | Evidence needed |
| --- | --- | --- | --- |
| P | TBD | ASSUMPTION REQUIRED | customer price test / chosen launch price |
| C | TBD | UNKNOWN | real supplier or production quote |
| F | TBD | UNKNOWN | fulfilment/payment/shipping quote |
| A | TBD | UNKNOWN | measured campaign or sales-channel data |
| R | TBD | UNKNOWN | measured returns/refunds or explicit test allowance |
| O | TBD | ASSUMPTION REQUIRED | itemised test budget |

## Validation ledger
For every material decision record:
- hypothesis;
- smallest reversible test;
- observable signal;
- evidence URL / receipt / measurement;
- decision: continue, revise, stop.

## Collected public evidence receipts
These were collected as inputs for a later verified pass. **No market conclusion is inferred from these links in this degraded artifact.**

${evidenceLines}

## Provider failure
Execution degraded with: ${String(reason||'reasoning_unavailable')}

## Truth boundary
No unsupported market, customer, pricing, margin, supplier, sales or traction claim is promoted as fact.
`;

    return {
      title:fashion?'Provisional fashion venture starter pack':'Provisional venture starter pack',
      summary:'Useful reversible venture work is preserved as explicit proposals while provider execution and independent verification remain incomplete.',
      files:[
        {name:'brand-brief.md',mimeType:'text/markdown',content:brandBrief},
        {name:'launch-kit.md',mimeType:'text/markdown',content:launchKit},
        {name:'economics-and-validation.md',mimeType:'text/markdown',content:economics}
      ],
      provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:evidence,...telemetryFields
    };
  }
  if(plan.kind==='sales_strategy'){
    const content=`# Sales strategy hypothesis

## Outcome
${goal}

## Organization assembled
Market strategy → Offer design → Channel strategy → Economics → Verification.

## First move
Treat customer profile, product features, pricing, margins and channel choices as hypotheses until tested or researched. Build one premium offer, one primary channel and one measurable validation test before expanding.

## Truth boundary
No current market facts, named partner fit, demographic facts, pricing benchmarks or product capabilities are claimed without evidence.`;
    return {title:'Sales strategy contract preserved — execution degraded',summary:'A truthful sales-strategy frame is preserved without inventing luxury-market facts.',files:[{name:'sales-strategy-hypothesis.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:evidence,...telemetryFields};
  }
  if(plan.kind==='lead_generation'&&sources.length){const content=`# Grounded prospect evidence

## Objective
${goal}

${sources.map((x,i)=>`### ${i+1}. ${x.title||'Source'}
${x.url}
${x.snippet||''}`).join('\n\n')}

No prospect is labeled qualified beyond the evidence shown.`;return {title:'Grounded prospect evidence collected',summary:`${sources.length} public sources are ready for ranking.`,files:[{name:'prospect-evidence.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:evidence,...telemetryFields};}
  const content=`# Working result

## Objective
${goal}

## Execution plan
${plan.workUnits.map((u,i)=>`${i+1}. ${u.title}`).join('\n')}

## Truth boundary
${plan.truthPolicy}`;return {title:`Working result — ${goal.slice(0,70)}`,summary:'The mission contract is preserved while live reasoning recovers.',files:[{name:'working-result.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:evidence,...telemetryFields};
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
