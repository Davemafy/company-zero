import {list} from '../lib/store.mjs';
import {proposeStructured} from '../lib/reasoning.mjs';
import {capabilityAssessment} from '../lib/grounding.mjs';
const rows=await list({companyId:process.argv[2],limit:3000});
const world=rows.find(x=>x.kind==='world_model');
const selection=rows.find(x=>x.kind==='strategy_selection'&&x.state==='selected');
const result=await proposeStructured({task:'Operation Planner',instructions:'Propose a minimal ordered capability plan for the selected strategy. Return operations with capabilityId selected only from the supplied IDs, args conforming exactly to that capability inputSchema, purpose, expectedObservation, and strategySelectionId. Do not claim any operation has executed.',input:{goalContract:rows.find(x=>x.kind==='mission').data.goalContract,worldModel:{id:world.id,factIds:world.data.factIds,factCounts:world.data.factCounts},strategySelection:{id:selection.id,...selection.data},capabilities:rows.filter(x=>x.kind==='capability').map(capabilityAssessment)}});
console.log(JSON.stringify(result,null,2));
