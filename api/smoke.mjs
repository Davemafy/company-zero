import {buildInstantValue} from '../lib/instant-value.mjs';
export default async function handler(req,res){
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  if(req.method!=='GET'){res.statusCode=405;return res.end(JSON.stringify({ok:false,error:'method_not_allowed'}))}
  const started=Date.now();
  const result=await buildInstantValue({request:'Find me 5 serious clients for my ecommerce brand kimchi',context:{interactionRoute:'investigate',needsFreshEvidence:true}});
  const file=result.files?.[0];
  res.statusCode=200;
  res.end(JSON.stringify({ok:true,ms:Date.now()-started,title:result.title,summary:result.summary,degraded:Boolean(result.degraded),degradedReason:result.degradedReason||null,model:result.model||null,evidenceCount:result.publicEvidence?.results?.length||0,preview:String(file?.content||'').slice(0,1800)}));
}
