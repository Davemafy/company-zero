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
  if(testCase.evidence)assert.equal(plan.requiresFreshEvidence,true,`${testCase.name}: should require fresh evidence`);
  if(testCase.kind!=='lead_generation')assert.ok(!plan.organization.functions.includes('prospect_research'),`${testCase.name}: incorrectly routed to prospecting`);
  for(const key of testCase.required||[])assert.ok(plan.contract.required.includes(key),`${testCase.name}: missing contract key ${key}`);

  const fallback=usefulFallback(testCase.prompt,plan,{reason:'forced_test_failure'});
  assert.ok(fallback.files.length>0,`${testCase.name}: fallback produced no artifact`);
  assert.ok(fallback.files.every(file=>String(file.content||'').trim().length>80),`${testCase.name}: fallback artifact is empty`);
  assert.ok(!/one detail needed for for|for's url/i.test(JSON.stringify(fallback)),`${testCase.name}: malformed clarification regression returned`);
  if(testCase.kind==='company_creation'){
    assert.equal(fallback.files[0].name,'venture-contract.md',`${testCase.name}: venture fallback changed domains`);
    assert.ok(/venture strategy/i.test(fallback.files[0].content),`${testCase.name}: venture organization was not preserved`);
  }

  const knownGarbage={files:[{name:'result.md',content:`Could not complete this request. Work is underway and will appear here later. The request was saved, the reasoning service is unavailable, and you should try again. ${'Generic filler '.repeat(20)}`}]};
  const garbageQa=qualityCheck(knownGarbage,plan);
  assert.equal(garbageQa.ok,false,`${testCase.name}: generic filler passed the evaluator`);
  assert.ok(garbageQa.reasons.includes('workflow_theatre'),`${testCase.name}: workflow theatre was not rejected`);
}

// Lock the exact failure that triggered this suite: a rich venture brief must never become lead generation.
const breadPlan=compileExecutionPlan(longBreadPrompt);
assert.equal(breadPlan.kind,'company_creation');
assert.equal(breadPlan.contract.askPolicy,'continue_unless_blocked');
assert.ok(breadPlan.contract.required.length>=12,'bread prompt lost requested deliverables');
assert.ok(!breadPlan.workUnits.some(unit=>/prospect/i.test(unit.title)),'bread prompt regressed to prospect workflow');

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

console.log('v1-torture-test: 10/10 regression prompts PASS');
