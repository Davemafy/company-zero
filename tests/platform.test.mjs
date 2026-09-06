
import assert from "node:assert/strict";import{ENVIRONMENTS,CAPABILITIES,seed,experiment,promote,registerCapability}from"../platform/kernel.mjs";
assert.ok(CAPABILITIES.length>=10);assert.equal(registerCapability({id:"novel.tool",name:"Novel"}).id,"novel.tool");
for(const id of Object.keys(ENVIRONMENTS)){let c=seed(id),q=c.quality,x=experiment(c);assert.equal(x.gate,true);assert.equal(x.challenger.cases,1000);assert.equal(x.challenger.violations,0);promote(c);assert.equal(c.version,2);assert.ok(c.quality>q);assert.equal(c.memory.length,1)}
let c=seed("finance");let x=experiment(c);c.version++;assert.throws(()=>promote(c),/stale_revision/);
let d=seed("support");d.controls.minCases=2000;assert.equal(experiment(d).gate,false);
console.log(JSON.stringify({status:"PASS",environments:Object.keys(ENVIRONMENTS),capabilities:CAPABILITIES.length,shadowPromotion:true,staleRevisionRejected:true},null,2));
