import assert from 'node:assert/strict';
import {compileWorkSpec,generateWorkBundle,reviewWorkBundle} from '../lib/work-compiler.mjs';
import fs from 'node:fs/promises';

process.env.TENSORMUX_BASE_URL='https://tensormux.test/v1';
process.env.TENSORMUX_API_KEY='test-key';
process.env.TENSORMUX_MODEL='test-model';

const cases=[
  {
    request:'make me dinner',
    files:[
      {name:'dinner-tonight.md',content:'# Dinner tonight\n\n## Assumption\nUse common pantry basics and a low-complexity meal.\n\n## Meal\nTomato egg rice bowl.\n\n## Ingredients\nRice, eggs, tomato, onion, oil, salt.\n\n## Substitutions\nBread can replace rice; canned tomato can replace fresh tomato.\n\n## Timing\n0–5 min prep, 5–20 min cook rice/sauce, 20–25 min finish eggs and serve.\n\n## Ingredient gap\nCheck only for rice, eggs and tomato before starting. No purchase is claimed.'}
    ]
  },
  {
    request:'get me a software job',
    files:[
      {name:'job-search-v1.md',content:'# Software job search V1\n\n## Target\nPaid software roles matching the supplied profile.\n\n## Immediate assets\nA concise role-target statement, application evidence checklist, and interview preparation queue.\n\n## Pipeline\nCreate a ranked opportunity pipeline only from connected or user-supplied job evidence; do not invent openings.\n\n## Next usable action\nTailor the resume to the first verified role and prepare the required assessment topics. No application or offer is claimed.'}
    ]
  },
  {
    request:'I need a fashion company',
    files:[
      {name:'fashion-company-v1.md',content:'# Fashion company V1\n\n## Assumptions\nStart with a small, reversible test instead of inventory-heavy production.\n\n## Positioning\nDefine one customer, one use case and one product promise.\n\n## Product V1\nCreate a three-item capsule concept with specification sheets, pricing assumptions and a demand-test landing surface.\n\n## Validation\nTreat interest, supplier quotes and sales as unknown until externally observed.\n\n## Launch boundary\nDo not spend money or publish publicly without approval.'}
    ]
  },
  {
    request:'my store is not selling. fix it',
    files:[
      {name:'store-recovery-v1.md',content:'# Store recovery V1\n\n## First principle\nDo not change the store before identifying the largest observable sales bottleneck.\n\n## Diagnostic deliverable\nEstablish a funnel baseline from available store evidence, separate traffic from conversion and checkout friction, then rank hypotheses by evidence.\n\n## Intervention\nChoose one reversible change tied to the strongest diagnosis.\n\n## Verification\nCompare the same metric before and after. No improvement is claimed without measured evidence.'}
    ]
  },
  {
    request:'reduce my cloud bill by 20%',
    files:[
      {name:'cloud-cost-v1.md',content:'# Cloud cost reduction V1\n\n## Target\nReduce recurring cloud spend by 20% while preserving reliability constraints.\n\n## Required evidence\nAuthoritative billing baseline, service inventory and reliability metrics.\n\n## Safe first work\nRank cost drivers and reversible optimization candidates; require approval for production changes.\n\n## Success rule\nDo not claim 20% savings until a later billing measurement verifies it.'}
    ]
  }
];

const fixtureByRequest=new Map(cases.map(x=>[x.request,x]));
const realFetch=globalThis.fetch;
let compilerCalls=0,builderCalls=0,criticCalls=0;

globalThis.fetch=async(_url,opts)=>{
  const body=JSON.parse(opts.body);const system=body.messages[0].content;const user=JSON.parse(body.messages[1].content);
  let payload;
  if(system.includes('universal Work Compiler')){
    compilerCalls++;
    payload={
      desiredOutcome:user.request,
      assumptionsPolicy:'infer_low_risk_reversible_then_act',
      questionPolicy:'ask_only_at_blocking_or_authority_boundary',
      successDefinition:`Materially advance: ${user.request}`,
      acceptanceCriteria:['Directly usable','Concrete','No invented external outcome'],
      deliverables:[{key:'primary',title:'Useful V1',kind:'product',purpose:user.request,dependsOn:[],authority:'none',acceptanceCriteria:['Useful now','Truthful'],suggestedFiles:['v1.md']}],
      externalBoundaries:[{description:'Any consequential external side effect',authority:'approval_required'}]
    };
  }else if(system.includes('universal production worker')){
    builderCalls++;
    const fixture=fixtureByRequest.get(user.request);assert.ok(fixture,`missing fixture for ${user.request}`);
    payload={title:`V1 — ${user.request}`,summary:'Concrete usable first version',files:fixture.files.map(f=>({name:f.name,mimeType:'text/markdown',content:f.content}))};
  }else if(system.includes('universal outcome critic')){
    criticCalls++;
    payload={passed:true,scores:{directness:.95,usefulness:.9,completeness:.82,truthfulness:1},failures:[],unsupportedClaims:[],revisionInstructions:[]};
  }else throw new Error(`unexpected model task: ${system.slice(0,80)}`);
  return new Response(JSON.stringify({id:'mock',model:'test-model',choices:[{message:{content:JSON.stringify(payload)}}],usage:{prompt_tokens:20,completion_tokens:40,total_tokens:60}}),{status:200,headers:{'content-type':'application/json'}});
};

try{
  for(const test of cases){
    const spec=await compileWorkSpec({request:test.request,mission:{outcome:test.request}});
    assert.equal(spec.request,test.request);
    assert.ok(spec.deliverables.length>=1);
    assert.ok(spec.acceptanceCriteria.length>=1);
    const built=await generateWorkBundle({spec,mission:{outcome:test.request}});
    assert.ok(built.artifact.files.length>=1);
    const review=await reviewWorkBundle({spec,artifact:built.artifact});
    assert.equal(review.passed,true);
    assert.equal(review.semantic.unsupportedClaims.length,0);
  }
  const source=await fs.readFile(new URL('../lib/work-compiler.mjs',import.meta.url),'utf8');
  for(const test of cases)assert.equal(source.toLowerCase().includes(test.request.toLowerCase()),false,`implementation hard-coded test prompt: ${test.request}`);
  assert.equal(compilerCalls,cases.length);
  assert.equal(builderCalls,cases.length);
  assert.equal(criticCalls,cases.length);
  console.log('behavioral-outcomes: PASS');
}finally{globalThis.fetch=realFetch}
