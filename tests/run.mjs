import assert from 'node:assert/strict';
import {FINANCE,SUPPORT,withDrift} from '../missions.js';
import {baselineOrganization,localDiagnosis,validateDiagnosis,governor,localMutations,validateMutation,applyMutation,candidateScore,selectCandidate,lesson} from '../engine.js';
import {executeReferenceWorkload} from '../lib/runtime-core.mjs';

const memory=[];
let mission=structuredClone(FINANCE);let org=baselineOrganization(mission,memory);let before=executeReferenceWorkload(mission,org);
assert.equal(before.accuracy,.7);let d=validateDiagnosis(mission,before,localDiagnosis(mission,before)).diagnosis;assert.equal(d.neededCapability.tool,'cross_case_index');assert.equal(governor(mission,before,d).action,'restructure');
let candidates=[];for(const m of localMutations(mission,org,d)){const v=validateMutation(mission,org,d,m);if(!v.ok)continue;const o=applyMutation(mission,org,v.mutation,org.version+candidates.length+1);const run=executeReferenceWorkload(mission,o);candidates.push({mutation:v.mutation,org:o,run,score:candidateScore(mission,o,run)})}
let chosen=selectCandidate(candidates);assert(chosen);assert.equal(chosen.run.accuracy,1);org=chosen.org;memory.push(lesson(mission,d,chosen));
mission=withDrift(mission);before=executeReferenceWorkload(mission,org);const driftBefore=before.accuracy;assert(before.accuracy<.95);d=validateDiagnosis(mission,before,localDiagnosis(mission,before)).diagnosis;assert.equal(d.neededCapability.tool,'assertion_check');candidates=[];for(const m of localMutations(mission,org,d)){const v=validateMutation(mission,org,d,m);if(!v.ok)continue;const o=applyMutation(mission,org,v.mutation,org.version+candidates.length+1);const run=executeReferenceWorkload(mission,o);candidates.push({mutation:v.mutation,org:o,run,score:candidateScore(mission,o,run)})}chosen=selectCandidate(candidates);assert(chosen);assert.equal(chosen.run.accuracy,1);const driftAfter=chosen.run.accuracy;
mission=structuredClone(SUPPORT);org=baselineOrganization(mission,[]);before=executeReferenceWorkload(mission,org);assert.equal(before.accuracy,.6);d=validateDiagnosis(mission,before,localDiagnosis(mission,before)).diagnosis;assert.equal(d.neededCapability.tool,'redaction');
const badDiag={...d,evidenceIds:['FAKE-999']};assert.equal(validateDiagnosis(mission,before,badDiag).ok,false);
const badMutation={type:'add_role',label:'Invent tool',evidenceIds:d.evidenceIds,role:{name:'Bad',tool:'internet_magic'}};assert.equal(validateMutation(mission,org,d,badMutation).ok,false);
const inherited=baselineOrganization(structuredClone(FINANCE),memory);assert(inherited.roles.some(r=>r.tool==='cross_case_index'));
console.log(JSON.stringify({status:'PASS',finance:{before:.7,after:1},drift:{before:driftBefore,after:driftAfter},support:{before:.6,needed:'redaction'},memoryCarryover:true,adversarial:['fake evidence rejected','unavailable tool rejected']},null,2));
