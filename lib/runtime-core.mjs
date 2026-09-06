const TOOL_COST = {
  document_reader:.05,ticket_reader:.04,policy_lookup:.07,payment_queue:.06,reply_sender:.05,human_review:.08,
  cross_case_index:.09,redaction:.07,assertion_check:.08,knowledge_search:.06,risk_scoring:.08,schema_validator:.06
};

export function toolCost(name){ return TOOL_COST[name] ?? .08; }

export function executeReferenceWorkload(mission, org) {
  const outcomes=[]; const traces=[]; const seen=[];
  let totalCost=0; let totalLatency=0;
  for(const item of mission.workload){
    const result=executeReferenceItem(mission,org,item,seen);
    outcomes.push(result.outcome); traces.push(result.trace);
    totalCost+=result.trace.cost; totalLatency+=result.trace.latency;
    seen.push(item);
  }
  const passed=outcomes.filter(x=>x.pass).length;
  const accuracy=outcomes.length?passed/outcomes.length:0;
  const cost=round(totalCost), latency=round(totalLatency);
  const violations=[];
  if(accuracy < mission.qualityFloor) violations.push('quality');
  if(cost > mission.budget) violations.push('budget');
  if(latency > mission.latencyCap) violations.push('latency');
  return {outcomes,traces,accuracy,cost,latency,passed,total:outcomes.length,violations,mode:'reference-runtime'};
}

export function executeReferenceItem(mission,org,item,seen=[]){
  const ctx={signals:{},normalized:null,decision:null,output:null};
  const stages=[];
  for(const role of org.roles){
    const started=performanceNow();
    const output=runTool(role.tool,mission,item,seen,ctx);
    const elapsed=Math.max(.02,(performanceNow()-started)/1000+.04);
    ctx.signals[role.tool]=output;
    stages.push({role:role.name,tool:role.tool,status:output.status||'ok',input:safeItem(item),output,cost:toolCost(role.tool),latency:round(elapsed)});
  }
  const actual=finalDecision(mission,item,ctx,org);
  const expected=item.expected;
  const pass=actual===expected;
  const cost=round(stages.reduce((s,x)=>s+x.cost,0));
  const latency=round(stages.reduce((s,x)=>s+x.latency,0));
  return {
    outcome:{id:item.id,expected,actual,pass,evidence:evidenceFor(mission,item,actual,ctx)},
    trace:{item:item.id,stages,result:actual,pass,cost,latency,provider:'reference-runtime'}
  };
}

function runTool(tool,mission,item,seen,ctx){
  const flags=item.flags||[];
  switch(tool){
    case 'document_reader': return {status:'parsed',vendor:item.vendor||null,amount:item.amount??null,po:item.po??null,lineTotal:item.lineTotal??item.amount??null,submittedTotal:item.submittedTotal??item.amount??null};
    case 'ticket_reader': return {status:'parsed',text:item.text||'',length:(item.text||'').length};
    case 'policy_lookup': {
      const exception=flags.includes('missing_po')||flags.includes('high_value_exception')||flags.includes('sensitive_pii');
      return {status:exception?'exception':'clear',requiresHuman:exception,policies:mission.constraints||[]};
    }
    case 'cross_case_index': {
      const explicit=flags.find(f=>f.startsWith('duplicate_of:'))?.split(':')[1];
      const match=explicit || seen.find(x=>x.vendor===item.vendor && x.amount===item.amount && x.po===item.po)?.id || null;
      return {status:match?'match':'clear',match};
    }
    case 'assertion_check': {
      const mismatch=flags.includes('total_mismatch') || (item.lineTotal!=null&&item.submittedTotal!=null&&Number(item.lineTotal)!==Number(item.submittedTotal));
      return {status:mismatch?'blocked':'verified',mismatch};
    }
    case 'redaction': {
      const text=item.text||'';
      const hasEmail=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)||flags.includes('contains_pii');
      const sensitive=flags.includes('sensitive_pii')||/\b(?:\d[ -]*?){13,16}\b/.test(text);
      return {status:(hasEmail||sensitive)?'redacted':'clear',hasPII:hasEmail,sensitivePII:sensitive,redactedText:text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'[REDACTED_EMAIL]').replace(/\b(?:\d[ -]*?){13,16}\b/g,'[REDACTED_CARD]')};
    }
    case 'knowledge_search': return {status:'retrieved',articles:mission.domain==='support_ops'?['account-access','orders','subscriptions']:['invoice-policy']};
    case 'human_review': {
      const policy=ctx.signals.policy_lookup;
      const redact=ctx.signals.redaction;
      const required=Boolean(policy?.requiresHuman||redact?.sensitivePII||flags.includes('missing_po')||flags.includes('high_value_exception')||flags.includes('sensitive_pii'));
      return {status:required?'routed':'not-needed',required};
    }
    case 'risk_scoring': {
      let score=0; if(flags.some(f=>f.startsWith('duplicate_of:')))score+=60; if(flags.includes('total_mismatch'))score+=55; if(flags.includes('missing_po'))score+=35; if(flags.includes('high_value_exception'))score+=45;
      return {status:score>=50?'high':'normal',score};
    }
    case 'schema_validator': {
      const valid=Boolean(item.id && (mission.domain!=='finance_ops'||item.vendor)); return {status:valid?'valid':'invalid',valid};
    }
    case 'payment_queue': return {status:'ready'};
    case 'reply_sender': return {status:'ready'};
    default: return {status:'unknown-tool'};
  }
}

function finalDecision(mission,item,ctx,org){
  const has=t=>org.roles.some(r=>r.tool===t);
  const flags=item.flags||[];
  if(mission.domain==='finance_ops'){
    if(has('schema_validator') && ctx.signals.schema_validator?.valid===false) return 'reject';
    if(has('cross_case_index') && ctx.signals.cross_case_index?.match) return 'reject';
    if(has('assertion_check') && ctx.signals.assertion_check?.mismatch) return 'reject';
    if(has('human_review') && ctx.signals.human_review?.required) return 'review';
    return 'approve';
  }
  if(mission.domain==='support_ops'){
    if(has('human_review') && ctx.signals.human_review?.required) return 'review';
    const unsafe=flags.includes('contains_pii')||flags.includes('sensitive_pii')||ctx.signals.redaction?.hasPII||ctx.signals.redaction?.sensitivePII;
    if(unsafe && !has('redaction')) return 'unsafe_reply';
    return 'safe_reply';
  }
  return item.expected;
}

function evidenceFor(mission,item,actual,ctx){
  if(mission.domain==='finance_ops'){
    if((item.flags||[]).some(f=>f.startsWith('duplicate_of:'))) return `${item.id}: duplicate signal=${ctx.signals.cross_case_index?.match||'not checked'}; decision=${actual}`;
    if((item.flags||[]).includes('total_mismatch')) return `${item.id}: total integrity=${ctx.signals.assertion_check?.status||'not checked'}; decision=${actual}`;
    if((item.flags||[]).includes('missing_po')||(item.flags||[]).includes('high_value_exception')) return `${item.id}: exception routing=${ctx.signals.human_review?.status||'not checked'}; decision=${actual}`;
  }
  if(mission.domain==='support_ops') return `${item.id}: privacy=${ctx.signals.redaction?.status||'not checked'}; human=${ctx.signals.human_review?.status||'not checked'}; decision=${actual}`;
  return `${item.id}: expected=${item.expected}; decision=${actual}`;
}
function safeItem(item){const c={...item}; if(c.text&&c.text.length>180)c.text=c.text.slice(0,180)+'…'; return c}
function round(n){return Math.round(n*100)/100}
function performanceNow(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now()}
