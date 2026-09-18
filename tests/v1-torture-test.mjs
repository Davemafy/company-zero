import assert from 'node:assert/strict';
import {compileExecutionPlan,usefulFallback,qualityCheck} from '../lib/execution-kernel.mjs';
import {invokeStudioCapability} from '../lib/studio.mjs';

const longBreadPrompt=`Launch an affordable premium bread brand in Abuja for busy young professionals and families with an initial budget of ₦350,000. Give me a strong brand name and explain the positioning. Define three realistic products including one healthier option. Explain the target customers, the problem being solved, and why they would switch. Give pricing assumptions, packaging direction, and a launch offer. Build a 30-day go-to-market plan using WhatsApp, Instagram, direct sales, referrals, and partnerships. Identify the biggest assumptions and the cheapest validation experiments. Show how the ₦350,000 should be allocated and what we should avoid spending on too early. Include basic unit economics and clearly label estimates. Create the actual customer-facing launch message, an Instagram post, a café or office partnership outreach message, a one-page brand brief, and a two-week validation tracker. Research only where current facts materially affect the answer and cite real evidence. Do not invent suppliers, competitors, prices, customers, or results. Do not wait for me unless the work is genuinely blocked; make reversible assumptions and get the first useful artifact out quickly.`;

const cases=[
  {name:'bread venture',prompt:longBreadPrompt,kind:'company_creation',required:['brand_name','product_lineup','pricing','brand_direction','launch_offer','go_to_market','unit_economics','budget_allocation','instagram_post','launch_message','partnership_outreach','brand_brief','validation_tracker']},
  {name:'car company',prompt:'Make me a car company with a clear market wedge, first product, pricing assumptions, launch plan and validation path.',kind:'company_creation'},
  {name:'serious clients',prompt:'Find me 5 serious clients for my ecommerce brand Kimchi. Rank them by fit, show real evidence, and give me an outreach angle for each.',kind:'lead_generation',evidence:true},
  {name:'landing page',prompt:'Improve this landing page. Give me a concrete section-by-section implementation, stronger CTA hierarchy, component changes and an acceptance checklist.',kind:'product_build'},
  {name:'fashion company',prompt:'Launch a fashion company for young professionals with positioning, initial product lineup, pricing, budget, launch plan and validation experiments.',kind:'company_creation'},
  {name:'market research',prompt:'Research Nigerian fintech expense-management competitors, compare their positioning with sources, and recommend the best underserved wedge.',kind:'research',evidence:true},
  {name:'investor memo',prompt:'Draft a one-page investor memo for a small logistics software startup. Make it usable, with a headline, problem, solution, traction assumptions and ask.',kind:'artifact_creation'},
  {name:'booking app',prompt:'Build a small appointment booking app for a barber shop. Specify the screens, components, data model, API shape and acceptance criteria.',kind:'product_build'},
  {name:'restaurant growth',prompt:'Improve weekday lunch orders by 40% for a restaurant. Define the metric, baseline assumptions, highest-leverage intervention, experiment and rollback rule.',kind:'optimization'},
  {name:'compound venture plus clients',prompt:'Make me a software company for small African retailers and find 5 serious clients later. First define the company, offer, economics, launch system and validation plan; do not turn the whole mission into prospecting.',kind:'company_creation'}
];

assert.equal(cases.length,10);

for(const testCase of cases){
  const plan=compileExecutionPlan(testCase.prompt);
  assert.equal(plan.kind,testCase.kind,`${testCase.name}: wrong mission kind (${plan.kind})`);
  assert.equal(plan.organization.mission,testCase.kind,`${testCase.name}: organization mission drifted`);
  assert.ok(plan.workUnits.length>=3,`${testCase.name}: plan is too shallow`);
  assert.ok(plan.expectedOutputs.length>=1,`${testCase.name}: no expected outputs`);
  if(testCase.evidence||testCase.kind==='company_creation'||testCase.kind==='sales_strategy')assert.equal(plan.requiresFreshEvidence,true,`${testCase.name}: claim-heavy missions should require fresh evidence`);
  if(testCase.kind!=='lead_generation')assert.ok(!plan.organization.functions.includes('prospect_research'),`${testCase.name}: incorrectly routed to prospecting`);
  for(const key of testCase.required||[])assert.ok(plan.contract.required.includes(key),`${testCase.name}: missing contract key ${key}`);

  const fallback=usefulFallback(testCase.prompt,plan,{reason:'forced_test_failure'});
  assert.ok(fallback.files.length>0,`${testCase.name}: fallback produced no artifact`);
  assert.ok(fallback.files.every(file=>String(file.content||'').trim().length>80),`${testCase.name}: fallback artifact is empty`);
  assert.ok(!/one detail needed for for|for's url/i.test(JSON.stringify(fallback)),`${testCase.name}: malformed clarification regression returned`);
  if(testCase.kind==='company_creation'){
    const names=fallback.files.map(file=>file.name);
    assert.deepEqual(names,['brand-brief.md','launch-kit.md','economics-and-validation.md'],`${testCase.name}: degraded venture must preserve a usable starter pack`);
    assert.ok(!names.includes('venture-contract.md'),`${testCase.name}: degraded venture regressed to generic contract-only output`);
    assert.ok(fallback.files.every(file=>/PROPOSAL|ASSUMPTION|PARTIAL|Truth boundary/i.test(file.content)),`${testCase.name}: fallback decisions are not locally labelled as provisional`);
    assert.ok(/Break-even units = O \/ contribution after acquisition/.test(fallback.files.find(file=>file.name==='economics-and-validation.md')?.content||''),`${testCase.name}: economics fallback lacks an actionable model`);
  }

  const knownGarbage={files:[{name:'result.md',content:`Could not complete this request. Work is underway and will appear here later. The request was saved, the reasoning service is unavailable, and you should try again. ${'Generic filler '.repeat(20)}`}]};
  const garbageQa=qualityCheck(knownGarbage,plan);
  assert.equal(garbageQa.ok,false,`${testCase.name}: generic filler passed the evaluator`);
  assert.ok(garbageQa.reasons.includes('workflow_theatre'),`${testCase.name}: workflow theatre was not rejected`);
}

// Lock the exact failure that triggered this suite: a rich venture brief must never become lead generation.
const degradedFashionPlan=compileExecutionPlan('make a fashion brand');
const degradedFashion=usefulFallback('make a fashion brand',degradedFashionPlan,{
  reason:'organization_no_artifacts:tensormux_timeout,agentrouter_http_503',
  publicEvidence:{ok:true,queries:['fashion market pricing competitors'],results:[{title:'Example captured source',url:'https://example.com/fashion',snippet:'Captured search input only.'}]},
  roleTelemetry:[{success:false,provider:'tensormux',model:'glm-4-7-flash',failure:{code:'tensormux_timeout'},usage:{total_tokens:0}},{success:false,provider:'agentrouter',model:'glm-5.3',failure:{code:'agentrouter_http_503'},usage:{total_tokens:0}}],
  roleTelemetrySummary:{expectedRoles:4,completedRoles:0}
});
assert.equal(degradedFashion.degraded,true);
assert.equal(degradedFashion.degradedReason,'organization_no_artifacts:tensormux_timeout,agentrouter_http_503');
assert.equal(degradedFashion.roleTelemetry.length,2,'degraded candidate lost failed provider telemetry');
assert.equal(degradedFashion.publicEvidence.results.length,1,'degraded candidate lost captured evidence receipts');
assert.ok(degradedFashion.files.some(file=>file.name==='brand-brief.md'&&/Fewer pieces\. Stronger point of view\./.test(file.content)),'fashion fallback is not mission-specific');

const breadPlan=compileExecutionPlan(longBreadPrompt);
assert.equal(breadPlan.kind,'company_creation');
assert.equal(breadPlan.contract.askPolicy,'continue_unless_blocked');
assert.ok(breadPlan.contract.required.length>=12,'bread prompt lost requested deliverables');
assert.ok(!breadPlan.workUnits.some(unit=>/prospect/i.test(unit.title)),'bread prompt regressed to prospect workflow');

// Production regression from Sep 14: "sell umbrellas to rich people" must get a real sales organization,
// and polished hallucinated luxury facts must not receive Evaluator: PASS with zero receipts.
const umbrellaPlan=compileExecutionPlan('sell umbrellas to rich people');
assert.equal(umbrellaPlan.kind,'sales_strategy','umbrella mission fell back to a generic organization');
assert.equal(umbrellaPlan.requiresFreshEvidence,true,'sales strategy must ground claim-heavy work before verification');
assert.deepEqual(umbrellaPlan.organization.functions,['market_strategy','offer_design','channel_strategy','economics','verification']);
const umbrellaGarbage={files:[
  {name:'customer_profile.md',content:`# High-Net-Worth Customer Profile\nTarget Segment: Ultra-High-Net-Worth Individuals. Net Worth: $1M - $50M+. Geography: NYC, London, Hong Kong, Dubai. Customers increasingly value sustainability and have high propensity for gifting.`},
  {name:'value_proposition.md',content:`# Luxury Umbrella Value Proposition\nAerospace Carbon Fiber Frame: ultra-lightweight yet unbreakable. Water-Repellent Silk & Teflon Coating: 100% waterproof with self-cleaning properties, absolute dryness and zero maintenance.`},
  {name:'channel_strategy.md',content:`# Exclusive Sales Channel Strategy\nGlobal concierge networks have direct access to HNWIs. Private aviation lounges and five-star hotels are ideal channels.`},
  {name:'pricing_model.md',content:`# Premium Pricing\nBase model: $1,200 - $1,500. Bespoke model: $2,000 - $3,000. COGS: 30-40%. Margin: 60-70%.`}
]};
const umbrellaQa=qualityCheck(umbrellaGarbage,umbrellaPlan);
assert.equal(umbrellaQa.ok,false,'ungrounded umbrella luxury claims received Evaluator: PASS');
assert.ok(umbrellaQa.reasons.includes('unsupported_specific_claims'),'unsupported product/market claims were not caught');
assert.equal(umbrellaQa.structuralFailure,true,'false-pass umbrella result should become structural evidence');

// Domain-specific quality gates: these used to allow polished-looking garbage through.
const buildPlan=compileExecutionPlan('Improve this landing page with implementation details.');
const buildGarbage={files:[{name:'plan.md',content:'This landing page should be modern, clear, premium and polished. '.repeat(8)}]};
assert.ok(qualityCheck(buildGarbage,buildPlan).reasons.includes('missing_build_substance'),'generic design adjectives passed the build gate');

const leadPlan=compileExecutionPlan('Find me 5 serious clients for my ecommerce brand Kimchi.');
const fakeLeadGarbage={files:[{name:'leads.md',content:'Here are five prospects with strong fit and outreach ideas, but there are no source URLs or grounded evidence. '.repeat(5)}]};
assert.ok(qualityCheck(fakeLeadGarbage,leadPlan).reasons.includes('missing_lead_substance'),'ungrounded leads passed the lead gate');

const researchPlan=compileExecutionPlan('Research Nigerian fintech competitors and compare them.');
const researchGarbage={files:[{name:'research.md',content:'There are many fintech competitors in Nigeria. This is a broad market with several interesting companies and opportunities. '.repeat(5)}]};
assert.ok(qualityCheck(researchGarbage,researchPlan).reasons.includes('missing_research_substance'),'unsourced research passed the research gate');

// Keep the old studio smoke test, now over all 10 ugly prompts.
for(const testCase of cases){
  const plan=await invokeStudioCapability({internalAction:'studio.plan',inputSchema:{type:'object',additionalProperties:true},outputSchema:{type:'object'}},{brief:testCase.prompt},{mission:{outcome:testCase.prompt}});
  assert.ok(plan.output?.deliverableType,`${testCase.name}: studio produced no deliverable type`);
  assert.ok(plan.output?.brief,`${testCase.name}: studio produced no brief`);
  const built=await invokeStudioCapability({internalAction:'studio.build',inputSchema:{type:'object',additionalProperties:true},outputSchema:{type:'object'}},plan.output,{mission:{outcome:testCase.prompt}});
  assert.ok(Array.isArray(built.output?.artifact?.files)&&built.output.artifact.files.length>0,`${testCase.name}: studio produced no files`);
  assert.ok(built.output.artifact.files.every(file=>String(file.content||'').trim().length>20),`${testCase.name}: studio produced an empty file`);
  assert.ok(!/factory opened|revenue generated|customers acquired|five customers signed|deployed successfully/i.test(JSON.stringify(built.output.artifact)),`${testCase.name}: fabricated external outcome`);
}

console.log('v1-torture-test: 10/10 core prompts + umbrella production regression PASS');
