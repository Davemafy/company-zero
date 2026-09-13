import {completeJsonWithTensorMux} from '../lib/tensormux.mjs';
import {searchPublicWeb} from '../lib/public-web.mjs';
export default async function handler(req,res){
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({ok:false,error:'method_not_allowed'}))}
  const started=Date.now();
  try{
    const request='Find me 5 serious clients for my ecommerce brand kimchi';
    const evidence=await searchPublicWeb(request,{limit:6,timeoutMs:1800});
    const model=await completeJsonWithTensorMux({
      system:'Return strict JSON with keys summary and candidates. candidates must be an array of up to 5 objects with name, fit, url. Use only supplied evidence. If the evidence cannot identify real client candidates, return candidates=[] and explain exactly what user detail is missing. Do not invent.',
      user:JSON.stringify({request,evidence}),timeoutMs:30000
    });
    res.statusCode=200;res.end(JSON.stringify({ok:true,ms:Date.now()-started,evidenceCount:evidence.results?.length||0,queries:evidence.queries,model:model.model,json:model.json}));
  }catch(error){res.statusCode=200;res.end(JSON.stringify({ok:false,ms:Date.now()-started,error:error?.message||String(error)}));}
}
