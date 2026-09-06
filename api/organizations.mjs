import {CompanyZero} from '../product-api.mjs';
import {json,body,method} from './_utils.mjs';
const store=globalThis.__CZ_STORE__||(globalThis.__CZ_STORE__=new Map());
export default async function handler(req,res){
  if(!method(req,res,['GET','POST','DELETE'])) return;
  try{
    const input=req.method==='GET'?{}:await body(req); const id=req.query?.id||input.id;
    if(req.method==='POST'&&!id){if(!input.mission)return json(res,400,{error:'mission_required'});const orgId=crypto.randomUUID();const cz=new CompanyZero({mission:input.mission,memory:input.memory||[]});await cz.launch();store.set(orgId,cz);return json(res,201,{id:orgId,...cz.snapshot('created')})}
    const cz=store.get(id); if(!cz)return json(res,404,{error:'organization_not_found'});
    if(req.method==='GET')return json(res,200,{id,...cz.snapshot()});
    if(req.method==='POST'&&input.action==='operate')return json(res,200,{id,result:await cz.operate(),snapshot:cz.snapshot()});
    if(req.method==='POST'&&input.action==='mission'){cz.setMission(input.mission,{preserveOrganization:Boolean(input.preserveOrganization)});return json(res,200,{id,...cz.snapshot()})}
    if(req.method==='DELETE'){store.delete(id);return json(res,200,{ok:true})}
    return json(res,405,{error:'method_not_allowed'});
  }catch(e){return json(res,500,{error:e.message})}
}
