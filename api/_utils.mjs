export function json(res,status,body){
  res.statusCode=status;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('cache-control','no-store');
  res.end(JSON.stringify(body));
}
export async function body(req){
  if(req.body && typeof req.body==='object') return req.body;
  const chunks=[]; for await (const chunk of req) chunks.push(chunk);
  if(!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function method(req,res,allowed){
  if(allowed.includes(req.method)) return true;
  res.setHeader('allow',allowed.join(', ')); json(res,405,{ok:false,error:'method_not_allowed'}); return false;
}
