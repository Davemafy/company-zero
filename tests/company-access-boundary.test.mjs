import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/v1.mjs';

function call(method,path,body=null,headers={}){
  return new Promise((resolve,reject)=>{
    const req=Readable.from(body==null?[]:[Buffer.from(JSON.stringify(body))]);req.method=method;req.query={path};req.headers=headers;
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[String(k).toLowerCase()]=v},end(x){let parsed={};try{parsed=JSON.parse(x||'{}')}catch{}resolve({status:this.statusCode,body:parsed,headers:this.headers})}};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}
  const started=await call('POST','outcomes',{goal:'Create a private controlled mission',context:{},constraints:{}});
  assert.equal(started.status,202);
  const companyId=started.body.company?.id||started.body.session?.company_id;
  const cookie=String(started.headers['set-cookie']||'').split(';')[0];
  assert.ok(cookie&&companyId);
  const denied=await call('GET',`companies/${companyId}`);
  assert.equal(denied.status,403,'another browser must not read a protected company');
  const allowed=await call('GET',`companies/${companyId}`,null,{cookie});
  assert.equal(allowed.status,200,'owner browser can read its company');
  const listedOther=await call('GET','companies');
  assert.equal((listedOther.body.items||[]).some(x=>x.id===companyId),false,'protected company must not leak in list');
  const listedOwner=await call('GET','companies',null,{cookie});
  assert.equal((listedOwner.body.items||[]).some(x=>x.id===companyId),true,'owner should see protected company in list');
  console.log('company-access-boundary: PASS');
