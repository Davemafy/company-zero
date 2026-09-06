import assert from 'node:assert/strict';
import {CompanyZero} from '../product-api.mjs';
import {FINANCE,withDrift,SUPPORT} from '../missions.js';
const finance=new CompanyZero({mission:FINANCE}); await finance.launch(); const a=await finance.operate();assert.equal(a.before.accuracy,.7);assert.equal(a.promoted.run.accuracy,1);const old=finance.org.id;finance.setMission(withDrift(FINANCE),{preserveOrganization:true});const b=await finance.operate();assert.equal(b.before.accuracy<1,true);assert.equal(b.promoted.run.accuracy,1);assert.notEqual(finance.org.id,old);assert.ok(finance.memory.length>=2);
const support=new CompanyZero({mission:SUPPORT});await support.launch();const c=await support.operate();assert.equal(c.before.accuracy,.6);assert.equal(c.promoted.run.accuracy,1);
console.log(JSON.stringify({status:'PASS',finance:a.before.accuracy+'→'+a.promoted.run.accuracy,drift:b.before.accuracy+'→'+b.promoted.run.accuracy,support:c.before.accuracy+'→'+c.promoted.run.accuracy,memory:finance.memory.length},null,2));
