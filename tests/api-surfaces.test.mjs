import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import handler from '../api/v1.mjs';

function call(method,path,body=null,headers={}){
  return new Promise((resolve,reject)=>{
    const raw=body==null?[]:[Buffer.from(JSON.stringify(body))];
    const req=Readable.from(raw);req.method=method;req.query={path};req.headers=headers;
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(x){try{resolve({status:this.statusCode,body:JSON.parse(x||'{}')})}catch(e){reject(e)}}};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}
const created=await call('POST','companies',{name:'API Surface',outcome:'Expose inspectable durable state',metrics:[{id:'ok',source:'run.status',operator:'=',target:'completed'}],constraints:{dailyBudgetUsd:5}});
assert.equal(created.status,201);const id=created.body.id;
for(const path of [`companies/${id}/jobs`,`companies/${id}/organizations`,`companies/${id}/experiments`,`companies/${id}/evidence`,`companies/${id}/memory`,`companies/${id}/approvals`,`companies/${id}/events`]){
  const r=await call('GET',path);assert.equal(r.status,200,path);assert.ok(Array.isArray(r.body.items),path);
}
const controls=await call('GET',`companies/${id}/controls`);assert.equal(controls.status,200);assert.equal(controls.body.companyStatus,'draft');assert.ok(Array.isArray(controls.body.decisions));
console.log('api-surfaces: PASS');
