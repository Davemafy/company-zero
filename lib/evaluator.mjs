export function getPath(obj,path){
  if(!path||path==='$')return obj;
  return String(path).replace(/^\$\.?/,'').split('.').filter(Boolean).reduce((v,k)=>v==null?undefined:v[k],obj);
}
export function compare(actual,op,expected){
  switch(op){case '>=':return Number(actual)>=Number(expected);case '<=':return Number(actual)<=Number(expected);case '>':return Number(actual)>Number(expected);case '<':return Number(actual)<Number(expected);case '!=':return actual!==expected;default:return actual===expected}
}
export function evaluateContract({mission,run,job}){
  const results=[];
  for(const metric of mission?.metrics||[]){
    let actual,expected=metric.target,operator=metric.operator||'=',detail='';
    const ev=metric.evaluator||null;
    if(ev?.type==='expected_field'){
      actual=getPath(run.output,ev.outputPath||'$.decision');expected=getPath(job?.payload,ev.expectedPath||'$.expected');operator='=';detail='independent expected-field comparison';
    }else if(ev?.type==='field'){
      actual=getPath(run.output,ev.path||'$');expected=ev.value??metric.target;operator=ev.op||operator;detail='output-field comparison';
    }else if(metric.source==='run.status'){actual=run.status;detail='runtime status'}
    else if(metric.source==='run.costUsd'){actual=run.costUsd;detail='runtime cost'}
    else if(metric.source==='run.latencyMs'){actual=run.latencyMs;detail='runtime latency'}
    else {actual=undefined;detail='unsupported metric source'}
    results.push({metricId:metric.id||metric.name,actual,target:expected,operator,passed:actual!==undefined&&compare(actual,operator,expected),detail});
  }
  const passed=results.length?results.every(x=>x.passed):run.status==='completed';
  return{passed,results,evaluator:'independent_contract'};
}
