import {proposeStructured,reasoningConfigured} from './reasoning.mjs';
import {DomainError} from './contracts.mjs';

const ROUTES=new Set(['answer','create','investigate','operate']);

function obviousAnswer(text){
  const s=String(text||'').trim().toLowerCase();
  // Do not spend a model call deciding whether a plain question needs a workflow.
  // Requests that explicitly ask for research or action still go through the router.
  if(/^(find|research|look up|check|verify|compare|investigate|discover|create|write|draft|build|make)\b/.test(s))return false;
  return /^(who|what|when|where|why|which)\b/.test(s)||/^(how (?:do|does|did|is|are|was|were|can|could|would|should))\b/.test(s);
}

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
  if(obviousAnswer(text))return{route:'answer',rationale:'A direct question does not need durable work.',needsFreshEvidence:false,requiresDurability:false,model:null,proposalOnly:false};
  if(process.env.NODE_ENV==='production'&&!reasoningConfigured())throw new DomainError('tensormux_required_for_interaction_routing',503);
  let proposal=null;
  try{
    proposal=await proposeStructured({
      task:'Universal Interaction Router',
      instructions:'Classify the user input into exactly one route: answer, create, investigate, or operate. answer = a conversational response is sufficient and no durable work machinery is needed. create = the user primarily wants an artifact/content/product produced. investigate = the request depends on gathering or checking external/current evidence before answering. operate = the user wants a real-world outcome changed through multi-step durable execution. Complexity must be earned. Do not choose operate merely because the request contains an action verb. Return route, rationale, needsFreshEvidence, requiresDurability. Do not answer the user here.',
      input:{message:text}
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
      instructions:'Answer the user directly and concisely using your general knowledge. Do not create a company, plan, organization, deliverable, job, or workflow. Return answer only. If the answer may have changed recently and no current evidence was supplied, say that briefly instead of replying Unknown. Distinguish ambiguous titles or premises when that helps.',
      input:{message:text,context}
    });
    const answer=String(proposal?.value?.answer||proposal?.value?.response||'').trim();
    if(answer&&!/^unknown\.?$/i.test(answer))return{answer,model:proposal?.model||null};
    throw Error('direct_answer_empty');
  }catch(error){
    if(process.env.NODE_ENV==='production')throw new DomainError('tensormux_direct_answer_failed',503,{cause:error.message});
  }
  return{answer:'I can answer that directly once the reasoning service is available.',model:null};
}
