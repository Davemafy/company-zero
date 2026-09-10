import {proposeStructured,reasoningConfigured} from './reasoning.mjs';
import {DomainError} from './contracts.mjs';

const ROUTES=new Set(['answer','create','investigate','operate']);

function fallbackRoute(text){
  const s=String(text||'').trim();
  const lower=s.toLowerCase();
  if(/^(who|what|when|where|why|how|is|are|do|does|did|can|could|would|should|which)\b/.test(lower)||/[?]\s*$/.test(s))return 'answer';
  if(/^(write|draft|create|design|generate|summarize|explain|make me (?:a|an)\b|build me (?:a|an)\b)/.test(lower))return 'create';
  if(/^(find|research|look up|check|verify|compare|investigate|discover)\b/.test(lower))return 'investigate';
  return 'operate';
}

export async function classifyInteraction(input){
  const text=String(input||'').trim();
  if(!text)throw new DomainError('interaction_required',400);
  const deterministic=fallbackRoute(text);
  const lower=text.toLowerCase();
  const obviousAnswer=/^(who|what|when|where|why|how|is|are|do|does|did|can|could|would|should|which)\b/.test(lower)||/[?]\s*$/.test(text);
  const obviousCreate=/^(write|draft|create|design|generate|summarize|explain|make me (?:a|an)\b|build me (?:a|an)\b)/.test(lower);
  const obviousInvestigate=/^(find|research|look up|check|verify|compare|investigate|discover)\b/.test(lower);
  if(obviousAnswer||obviousCreate||obviousInvestigate)return{route:deterministic,rationale:'Selected by the low-latency deterministic router.',needsFreshEvidence:false,requiresDurability:deterministic==='operate',model:null,proposalOnly:false,fastPath:true};
  if(process.env.NODE_ENV==='production'&&!reasoningConfigured())return{route:deterministic,rationale:'Reasoning router unavailable; safe deterministic route selected.',needsFreshEvidence:false,requiresDurability:deterministic==='operate',model:null,proposalOnly:false,fastPath:true};
  let proposal=null;
  try{
    proposal=await proposeStructured({
      task:'Universal Interaction Router',
      instructions:'Classify the user input into exactly one route: answer, create, investigate, or operate. answer = a conversational response is sufficient and no durable work machinery is needed. create = the user primarily wants an artifact/content/product produced. investigate = the request depends on gathering or checking external/current evidence before answering. operate = the user wants a real-world outcome changed through multi-step durable execution. Complexity must be earned. Do not choose operate merely because the request contains an action verb. Return route, rationale, needsFreshEvidence, requiresDurability. Do not answer the user here.',
      input:{message:text},timeoutMs:4000
    });
  }catch(error){
    if(process.env.NODE_ENV==='production')throw new DomainError('tensormux_interaction_routing_failed',503,{cause:error.message});
  }
  const value=proposal?.value||{};
  const route=ROUTES.has(String(value.route).toLowerCase())?String(value.route).toLowerCase():fallbackRoute(text);
  return{route,rationale:String(value.rationale||'Selected by the universal interaction router.'),needsFreshEvidence:Boolean(value.needsFreshEvidence),requiresDurability:route==='operate'||Boolean(value.requiresDurability),model:proposal?.model||null,proposalOnly:Boolean(proposal)};
}

export async function answerInteraction(message,{context={}}={}){
  const text=String(message||'').trim();
  if(!text)throw new DomainError('interaction_required',400);
  if(process.env.NODE_ENV==='production'&&!reasoningConfigured())throw new DomainError('tensormux_required_for_direct_answer',503);
  try{
    const proposal=await proposeStructured({
      task:'Direct Responder',
      instructions:'Answer the user directly and concisely. Do not create a company, plan, organization, deliverable, job, or workflow unless the user actually asked for durable work. Return answer only. Do not claim fresh external verification unless evidence was supplied in context.',
      input:{message:text,context},timeoutMs:8000
    });
    const answer=String(proposal?.value?.answer||proposal?.value?.response||'').trim();
    if(answer)return{answer,model:proposal?.model||null};
  }catch(error){
    if(process.env.NODE_ENV==='production')throw new DomainError('tensormux_direct_answer_failed',503,{cause:error.message});
  }
  throw new DomainError('direct_answer_unavailable',503,{hint:'The direct-answer model did not return a usable response within the fast-path budget.'});
}
