import {completeJsonWithTensorMux} from '../lib/tensormux.mjs';
export default async function handler(req,res){
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({ok:false,error:'method_not_allowed'}))}
  const started=Date.now();
  try{
    const result=await completeJsonWithTensorMux({system:'Return strict JSON: {"ok":true,"answer":"ready"}.',user:'Reply now.',timeoutMs:30000});
    res.statusCode=200;res.end(JSON.stringify({ok:true,ms:Date.now()-started,model:result.model,json:result.json}));
  }catch(error){res.statusCode=200;res.end(JSON.stringify({ok:false,ms:Date.now()-started,error:error?.message||String(error)}));}
}
