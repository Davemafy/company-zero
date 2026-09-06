import fs from 'node:fs';
import {FINANCE,SUPPORT} from '../missions.js';
import {baselineOrganization,localDiagnosis,governor,localMutations,validateMutation,applyMutation,candidateScore,selectCandidate} from '../engine.js';
import {executeReferenceWorkload} from '../lib/runtime-core.mjs';

const suites=[
  {mission:{...FINANCE,id:'bench-finance',title:'Large-scale invoice control benchmark',workload:JSON.parse(fs.readFileSync(new URL('../data/benchmarks/finance-120.json',import.meta.url))).cases,budget:80,latencyCap:120}},
  {mission:{...SUPPORT,id:'bench-support',title:'Large-scale support privacy benchmark',workload:JSON.parse(fs.readFileSync(new URL('../data/benchmarks/support-100.json',import.meta.url))).cases,budget:55,latencyCap:100}}
];
const report={generatedAt:new Date().toISOString(),engine:'company-zero-v4',suites:[]};
for(const {mission} of suites){
  const org=baselineOrganization(mission,[]);
  const before=executeReferenceWorkload(mission,org);
  const diagnosis=localDiagnosis(mission,before);
  const decision=governor(mission,before,diagnosis);
  const mutations=localMutations(mission,org,diagnosis).map(m=>validateMutation(mission,org,diagnosis,m)).filter(x=>x.ok).map(x=>x.mutation);
  const candidates=mutations.map((m,i)=>{const o=applyMutation(mission,org,m,org.version+i+1);const run=executeReferenceWorkload(mission,o);return {mutation:m,org:o,run,score:candidateScore(mission,o,run)}});
  const chosen=selectCandidate(candidates);
  report.suites.push({id:mission.id,cases:mission.workload.length,before:{accuracy:before.accuracy,cost:before.cost,latency:before.latency,violations:before.violations},diagnosis,decision,candidates:candidates.map(c=>({label:c.mutation.label,accuracy:c.run.accuracy,cost:c.run.cost,latency:c.run.latency,hard:c.score.hard,score:c.score.score})),chosen:chosen?{label:chosen.mutation.label,accuracy:chosen.run.accuracy,cost:chosen.run.cost,latency:chosen.run.latency}:null});
}
fs.mkdirSync(new URL('../reports/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../reports/benchmark-report.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
