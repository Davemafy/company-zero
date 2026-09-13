const clean=s=>String(s||'').trim();
const has=(s,re)=>re.test(s.toLowerCase());

export function compileExecutionPlan(request,{interactionRoute='',needsFreshEvidence=false}={}){
  const text=clean(request);const lower=text.toLowerCase();
  let kind='general';
  if(/\b(client|lead|prospect|customer)s?\b/.test(lower))kind='lead_generation';
  else if(/\b(company|startup|business|brand)\b/.test(lower)&&/\b(make|build|create|start|launch)\b/.test(lower))kind='company_creation';
  else if(/\b(research|find|investigate|compare|verify|discover|look up)\b/.test(lower)||interactionRoute==='investigate')kind='research';
  else if(/\b(site|website|app|api|software|code|frontend|backend|product)\b/.test(lower)&&/\b(build|make|create|fix|improve|ship|design)\b/.test(lower))kind='product_build';
  else if(/\b(write|draft|plan|prepare|summarize|explain|design|generate)\b/.test(lower))kind='artifact_creation';
  else if(/\b(improve|reduce|increase|cut|optimi[sz]e|grow)\b/.test(lower))kind='optimization';

  const templates={
    lead_generation:{
      objective:'Return concrete, ranked prospects the user can act on.',
      units:['Identify the offer and target buyer','Gather current prospect evidence','Rank candidates by fit','Produce outreach angles and next actions'],
      outputs:['ranked-prospects.md','outreach-angles.md'],
      evidence:true
    },
    company_creation:{
      objective:'Turn the vague company idea into a concrete venture the user can evaluate and continue building.',
      units:['Choose a plausible market wedge','Define customer, positioning, and business model','Specify the first product/service','Create a launch and validation plan','Expose the next authority boundary'],
      outputs:['company-blueprint.md','first-offer.md','validation-plan.md'],
      evidence:false
    },
    research:{
      objective:'Answer the research question with current, attributable evidence.',
      units:['Clarify the decision the research must support','Collect current evidence','Compare and synthesize findings','Return a decision-ready conclusion'],
      outputs:['research-brief.md'],
      evidence:true
    },
    product_build:{
      objective:'Produce a build-ready first version, not a generic plan.',
      units:['Infer the smallest useful scope','Choose implementation approach','Specify concrete screens/components/interfaces','Produce build artifacts or implementation instructions','Define verification'],
      outputs:['build-spec.md','acceptance-checklist.md'],
      evidence:false
    },
    optimization:{
      objective:'Define the measurable change, diagnose likely causes, and produce the first intervention.',
      units:['Define the metric and current-state assumptions','Find likely bottlenecks','Choose the highest-leverage reversible intervention','Define measurement and rollback'],
      outputs:['optimization-plan.md'],
      evidence:needsFreshEvidence
    },
    artifact_creation:{
      objective:'Produce the requested artifact directly.',
      units:['Infer format and audience','Draft the artifact','Check for completeness and usability'],
      outputs:['deliverable.md'],
      evidence:false
    },
    general:{
      objective:'Translate the request into the first concrete useful result.',
      units:['Infer the intended outcome','Choose the smallest useful deliverable','Produce it','State what remains unverified'],
      outputs:['result.md'],
      evidence:needsFreshEvidence
    }
  };
  const spec=templates[kind]||templates.general;
  return {
    kind,
    request:text,
    objective:spec.objective,
    workUnits:spec.units.map((title,index)=>({id:index+1,title,state:index===0?'active':'queued'})),
    expectedOutputs:spec.outputs,
    requiresFreshEvidence:Boolean(needsFreshEvidence||spec.evidence),
    assumptionsPolicy:'Infer low-risk reversible details; ask only when a missing fact would materially change the result or an irreversible action is required.',
    truthPolicy:'Do not claim external actions, measurements, customers, purchases, deployments, or verification without evidence.'
  };
}

export function usefulFallback(request,plan,{reason='reasoning_unavailable',publicEvidence=null}={}){
  const goal=clean(request);const sources=(publicEvidence?.results||[]).slice(0,8);
  if(plan.kind==='company_creation'){
    const companyNoun=(goal.match(/\b(car|fashion|food|software|logistics|media|energy|education|health|finance|travel)\b/i)||[])[1]||'new';
    const content=`# ${companyNoun[0]?.toUpperCase()+companyNoun.slice(1)} company — first operating blueprint\n\n## Starting wedge\nStart narrow instead of pretending to build a giant company on day one. Pick one painful customer problem, one buyer, and one first offer that can be tested cheaply.\n\n## Customer\nEarly adopters who already spend money trying to solve the problem and can be reached directly.\n\n## Positioning\nA focused ${companyNoun} company that wins on one clear advantage: simpler ownership, lower total cost, better experience, or a sharply defined niche.\n\n## First offer\nDefine one flagship product/service with a concrete promise, target price range, and delivery model. Avoid a broad catalogue until demand is proven.\n\n## Business model\nPrimary revenue from the core offer. Add financing, service, software, accessories, or recurring support only after the core offer shows demand.\n\n## 7-day validation sprint\n1. Pick one customer segment.\n2. Write a one-sentence offer and price hypothesis.\n3. Create a landing page or sales sheet.\n4. Put it in front of 20 relevant people.\n5. Track replies, calls, deposits, or waitlist signups.\n6. Keep, change, or kill the concept based on evidence.\n\n## What Company Zero should do next\nTurn this blueprint into the actual first assets: name/positioning options, a landing-page brief, first-offer economics, and a validation script.\n\n## Truth boundary\nNo company has been registered, funded, manufactured, sold, or launched yet. This is the strongest useful first operating blueprint available while live reasoning is degraded.`;
    return {title:`First operating blueprint — ${goal.slice(0,70)}`,summary:'A concrete company blueprint and validation path is ready, even though live reasoning degraded.',files:[{name:'company-blueprint.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:null};
  }
  if(plan.kind==='lead_generation'&&sources.length){
    const content=`# Grounded prospect evidence\n\n## Objective\n${goal}\n\n${sources.map((x,i)=>`### ${i+1}. ${x.title||'Source'}\n${x.url}\n${x.snippet||''}`).join('\n\n')}\n\n## Next pass\nUse these sources to rank actual prospects by fit and prepare outreach angles. No prospect is being labeled qualified beyond the evidence shown above.`;
    return {title:'Grounded prospect evidence collected',summary:`${sources.length} public sources are ready for ranking.`,files:[{name:'prospect-evidence.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:{queries:publicEvidence?.queries||[],results:sources}};
  }
  const content=`# Working result\n\n## Objective\n${goal}\n\n## Execution plan\n${plan.workUnits.map((u,i)=>`${i+1}. ${u.title}`).join('\n')}\n\n## Current state\nThe live reasoning pass did not complete, so Company Zero is preserving a concrete execution plan instead of pretending the requested outcome happened.\n\n## Truth boundary\n${plan.truthPolicy}`;
  return {title:`Working result — ${goal.slice(0,70)}`,summary:'A concrete execution plan is ready; the live reasoning pass degraded.',files:[{name:'working-result.md',mimeType:'text/markdown',content}],provisional:true,degraded:true,degradedReason:reason,model:null,publicEvidence:publicEvidence?.ok?{queries:publicEvidence.queries,results:sources}:null};
}

export function qualityCheck(result,plan){
  const files=Array.isArray(result?.files)?result.files:[];
  const text=files.map(f=>clean(f?.content)).join('\n').toLowerCase();
  const reasons=[];
  if(!files.length)reasons.push('no_files');
  if(text.length<220)reasons.push('too_thin');
  if(/could not complete|try again|reasoning service|request was saved/.test(text))reasons.push('workflow_theatre');
  if(plan.kind==='company_creation'&&!/(customer|position|offer|business model|validation|launch)/.test(text))reasons.push('missing_company_substance');
  if(plan.kind==='lead_generation'&&!/(http|source|prospect|fit|outreach)/.test(text))reasons.push('missing_lead_substance');
  return {ok:reasons.length===0,reasons};
}
