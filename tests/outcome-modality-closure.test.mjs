import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {assessOutcomeClosure,capabilityEffectModalities} from '../lib/outcome-modality.mjs';
import {assessCapabilitySufficiency} from '../lib/grounding.mjs';
import {verifyOutcomeChange} from '../lib/outcome-verifier.mjs';

const artifactCapability={id:'studio',data:{operationKind:'change',changes:['deliverable'],stateDomains:['deliverable'],effectModalities:['informational','digital']}};
const physicalGoal={desiredState:'cause a requested physical-world result',requestedOutcomeModality:'physical',successCriteria:[{metricId:'world_result',description:'Requested physical state exists',target:1,operator:'>='}]};
const digitalGoal={desiredState:'change a digital artifact',requestedOutcomeModality:'digital',successCriteria:[]};

const physicalClosure=assessOutcomeClosure(physicalGoal,[artifactCapability]);
assert.equal(physicalClosure.directOutcomeClosable,false);
assert.equal(physicalClosure.bestAchievableModality,'informational');
assert.equal(physicalClosure.missingActuator,'physical');

const digitalClosure=assessOutcomeClosure(digitalGoal,[artifactCapability]);
assert.equal(digitalClosure.directOutcomeClosable,true);
assert.ok(capabilityEffectModalities(artifactCapability).includes('digital'));

const sufficiency=assessCapabilitySufficiency(physicalGoal,[artifactCapability]);
assert.equal(sufficiency.sufficient,false);
assert.ok(sufficiency.missing.some(x=>x.kind==='actuator'&&x.modality==='physical'));

const verification=verifyOutcomeChange({goalContract:physicalGoal,observations:[],executionStatus:'completed'});
assert.equal(verification.executionSucceeded,true);
assert.equal(verification.outcomeAchieved,false);
assert.equal(verification.status,'insufficient_observation');
assert.equal(verification.results[0].status,'insufficient_observation');

const productionFiles=['../lib/outcome-modality.mjs','../lib/universal.mjs','../lib/grounding.mjs','../lib/work-compiler.mjs'].map(x=>fs.readFileSync(path.resolve(import.meta.dirname,x),'utf8').toLowerCase()).join('\n');
for(const forbidden of ['make me dinner','get me a software job','i need a fashion company','my store is not selling'])assert.equal(productionFiles.includes(forbidden),false,`production code must not hard-code: ${forbidden}`);

console.log('outcome-modality-closure: PASS');
