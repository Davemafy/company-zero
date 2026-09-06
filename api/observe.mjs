import {toNeatlogsTrace,emitNeatlogs} from '../lib/observability.mjs';
import {json,body,method} from './_utils.mjs';
export default async function handler(req,res){
  if(!method(req,res,['POST'])) return;
  try{const input=await body(req);if(!input?.mission||!input?.org||!input?.run)return json(res,400,{ok:false,error:'invalid_payload'});const trace=toNeatlogsTrace(input);const result=await emitNeatlogs(trace);return json(res,result.ok||result.skipped?200:502,{ok:result.ok,skipped:Boolean(result.skipped),tracePreview:trace,result})}catch(e){return json(res,500,{ok:false,error:'observe_exception',detail:String(e?.message||e)})}
}
