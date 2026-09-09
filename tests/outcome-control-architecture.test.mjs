import assert from 'node:assert/strict';
import {put,list} from '../lib/store.mjs';
import {ensureDeliverableGraph,validateDeliverableGraph,transitionDeliverable,hydrateOutcomeControl} from '../lib/outcome-control.mjs';

const companyId=crypto.randomUUID(),sessionId=crypto.randomUUID(),missionId=crypto.randomUUID();
await put({id:companyId,company_id:companyId,kind:'company',state:'active',version:0,data:{status:'active'}});
await put({id:missionId,company_id:companyId,kind:'mission',state:'active',version:0,data:{outcome:'Improve webpage latency below 100 ms'}});
const capabilities=[
  {id:crypto.randomUUID(),company_id:companyId,kind:'capability',state:'active',data:{name:'observe_webpage_state',description:'Observe software webpage public state',operationKind:'observe',stateDomains:['software.webpage','latency'],observes:['software.webpage.performance'],changes:[],measurements:[]}},
  {id:crypto.randomUUID(),company_id:companyId,kind:'capability',state:'active',data:{name:'measure_webpage_latency',description:'Measure software webpage latency',operationKind:'verify',stateDomains:['software.webpage','latency'],observes:['software.webpage.performance'],changes:[],measurements:[{metricId:'outcome_metric_1',path:'$.metrics.outcome_metric_1'}]}},
  {id:crypto.randomUUID(),company_id:companyId,kind:'capability',state:'active',data:{name:'change_webpage_state',description:'Change software webpage performance state',operationKind:'change',stateDomains:['software.webpage','latency'],observes:[],changes:['software.webpage.performance'],measurements:[]}}
];
for(const cap of capabilities)await put({...cap,version:0});

assert.throws(()=>validateDeliverableGraph([{key:'a',kind:'decision',dependsOn:['b']},{key:'b',kind:'decision',dependsOn:['a']}]),/deliverable_graph_cycle/);
const goalContract={desiredState:'Improve webpage latency below 100 ms',successCriteria:[{metricId:'outcome_metric_1',description:'Webpage latency under 100 ms',target:100,operator:'<=',unit:'ms'}]};
const worldModel={factIds:[],factCounts:{},unknowns:[]};
const {graph,deliverables}=await ensureDeliverableGraph(companyId,{sessionId,missionId,goalContract,worldModel,selectedStrategy:{id:'strategy-1',selectionId:'selection-1',title:'Improve the slowest path'},capabilities});
assert.ok(graph.id);assert.ok(deliverables.length>=5);
const baseline=deliverables.find(x=>x.data.key==='baseline'),execute=deliverables.find(x=>x.data.key==='execute'),verify=deliverables.find(x=>x.data.key==='verify');
assert.equal(baseline.state,'ready');assert.deepEqual(baseline.data.missingCapabilities,[]);assert.ok(baseline.data.capabilityBindings.verify.length);
assert.ok(execute.data.capabilityBindings.act.length);assert.ok(verify.data.capabilityBindings.verify.length);
await transitionDeliverable(companyId,baseline.id,'executing');await transitionDeliverable(companyId,baseline.id,'executed',{evidenceIds:['trace-baseline']});await transitionDeliverable(companyId,baseline.id,'verifying');await transitionDeliverable(companyId,baseline.id,'verified',{evidenceIds:['obs-baseline']});
const hydrated=await hydrateOutcomeControl(companyId,sessionId);assert.equal(hydrated.graph.id,graph.id);assert.ok(hydrated.events.some(x=>x.data.type==='DELIVERABLE_GRAPH_CREATED'));assert.ok(hydrated.events.some(x=>x.data.type==='DELIVERABLE_VERIFIED'));
const all=await list({companyId,kind:'deliverable',limit:1000});const intervention=all.find(x=>x.data.key==='intervention');assert.equal(intervention.state,'ready','dependency completion should unlock next deliverable');
console.log('outcome-control-architecture: PASS');
