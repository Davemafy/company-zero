import {storageMode,get,list} from '../lib/store.mjs';
import {createCompany,companies,hydrateCompany,registerProvider,synthesize,launch,submitJob,submitEvent,diagnose,promotion,control,approvalDecision,approvals,rollback,DomainError} from '../lib/platform-v1.mjs';
import {scheduleExperiment} from '../lib/experiment-service.mjs';
import {startOperatingSession,advanceOperatingSession,hydrateOperatingSession,recordObservation,converse} from '../lib/universal.mjs';
import {createValueMission,materializeFirstValue} from '../lib/mission-service.mjs';
import {listWorkerHeartbeats} from '../lib/queue.mjs';
import {hydrateOutcomeControl} from '../lib/outcome-control.mjs';
import {ensureBrowserSession,assertCompanyAccess,canAccessCompany} from '../lib/session-auth.mjs';
import {classifyInteraction,answerInteraction} from '../lib/interaction-kernel.mjs';

export default async function handler(req,res){
  res.setHeader('content-type','application/json');
  try{
    const browserSessionId=ensureBrowserSession(req,res);
    const body=req.method==='GET'?{}:await read(req),p=String(req.query?.path||'').split('/').filter(Boolean),m=req.method;
    if(m==='GET'&&!p.length)return send(res,200,{ok:true,storage:storageMode(),contract:'v1',execution:'external-durable-worker',interface:'universal-operating'});
    if(m==='GET'&&p[0]==='runtime'&&p[1]==='workers')return send(res,200,{items:await listWorkerHeartbeats()});
    if(m==='POST'&&p[0]==='interactions'&&p.length===1){
      const message=String(body.message||body.goal||'').trim();
      const decision=await classifyInteraction(message);
      if(decision.route==='answer'&&!decision.needsFreshEvidence){
        const direct=await answerInteraction(message,{context:body.context||{}});
        return send(res,200,{kind:'answer',decision,answer:direct.answer,model:direct.model});
      }
      const operating=await createValueMission({goal:message,context:{...(body.context||{}),interactionRoute:decision.route,needsFreshEvidence:decision.needsFreshEvidence},constraints:body.constraints||{},ownerSessionId:browserSessionId});
      return send(res,202,{kind:'work',decision,operating});
    }
    if(m==='POST'&&p[0]==='outcomes'&&p.length===1)return send(res,202,await createValueMission({...body,ownerSessionId:browserSessionId}));
    if(m==='GET'&&p[0]==='companies'&&p.length===1){const items=(await companies()).filter(x=>canAccessCompany(x,browserSessionId));return send(res,200,{items});}
    if(m==='POST'&&p[0]==='companies'&&p.length===1){const ownerSessionId=body.ownerSessionId||(process.env.NODE_ENV==='production'?browserSessionId:undefined);return send(res,201,await createCompany({...body,...(ownerSessionId?{ownerSessionId}: {})}));}
    const c=p[1];
    const company=(p[0]==='companies'&&c)?assertCompanyAccess(await get(c),browserSessionId):null;
    if(m==='GET'&&p[0]==='companies'&&p.length===2)return send(res,200,await hydrateCompany(company));
    if(m==='GET'&&p[2]==='sessions'&&p[3])return send(res,200,await hydrateOperatingSession(c,p[3]));
    if(m==='POST'&&p[2]==='sessions'&&p[3]&&p[4]==='advance')return send(res,202,await advanceOperatingSession(c,p[3]));
    if(m==='POST'&&p[2]==='sessions'&&p[3]&&p[4]==='instant-value')return send(res,201,{artifact:await materializeFirstValue(c,p[3])});
    if(m==='POST'&&p[2]==='sessions'&&p[3]&&p[4]==='messages')return send(res,201,await converse(c,p[3],body.message));
    if(m==='POST'&&p[2]==='observations')return send(res,201,await recordObservation(c,body));
    if(m==='GET'&&p[2]==='jobs'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'job',limit:500})});
    if(m==='GET'&&p[2]==='organizations'&&p.length===3)return send(res,200,{items:(await list({companyId:c,limit:500})).filter(x=>['organization_revision','candidate_revision'].includes(x.kind))});
    if(m==='GET'&&p[2]==='experiments'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'experiment',limit:200})});
    if(m==='GET'&&p[2]==='world'&&p.length===3)return send(res,200,{items:(await list({companyId:c,limit:3000})).filter(x=>['world_model','world_fact','capability_assessment'].includes(x.kind))});
    if(m==='GET'&&p[2]==='deliverables'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'deliverable',limit:1000})});
    if(m==='GET'&&p[2]==='deliverable-graphs'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'deliverable_graph',limit:200})});
    if(m==='GET'&&p[2]==='runtime-events'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'runtime_event',limit:1000})});
    if(m==='GET'&&p[2]==='sessions'&&p[3]&&p[4]==='outcome-control')return send(res,200,await hydrateOutcomeControl(c,p[3]));
    if(m==='GET'&&p[2]==='outcome-contracts'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'outcome_contract',limit:200})});
    if(m==='GET'&&p[2]==='evidence'&&p.length===3)return send(res,200,{items:(await list({companyId:c,limit:3000})).filter(x=>['trace','evaluation','external_observation','outcome_observation','outcome_verification','world_fact','work_relevance','operation_plan','diagnosis','promotion_decision','lesson'].includes(x.kind))});
    if(m==='GET'&&p[2]==='memory'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'lesson',limit:200})});
    if(m==='GET'&&p[2]==='approvals'&&p.length===3)return send(res,200,{items:await approvals(c)});
    if(m==='GET'&&p[2]==='events'&&p.length===3)return send(res,200,{items:await list({companyId:c,kind:'event',limit:500})});
    if(m==='GET'&&p[2]==='controls'&&p.length===3){const company=await get(c);return send(res,200,{companyStatus:company?.data?.status,activeOrganizationRevisionId:company?.data?.activeOrganizationRevisionId,decisions:await list({companyId:c,kind:'governor_decision',limit:200})})}
    if(m==='POST'&&p[2]==='providers')return send(res,201,await registerProvider(c,body));
    if(m==='POST'&&p[2]==='organizations'&&p[3]==='synthesize')return send(res,201,await synthesize(c,body));
    if(m==='POST'&&p[2]==='organizations'&&p[4]==='launch')return send(res,200,await launch(c,p[3]));
    if(m==='POST'&&p[2]==='jobs'&&p.length===3){const j=await submitJob(c,body.payload,{idempotencyKey:req.headers['idempotency-key']||body.idempotencyKey});return send(res,202,{jobId:j.id,status:j.state,organizationRevision:j.data.organizationRevision})}
    if(m==='POST'&&p[2]==='events'){const x=await submitEvent(c,body.payload,{idempotencyKey:req.headers['idempotency-key']||body.idempotencyKey});return send(res,202,{eventId:x.event.id,jobId:x.job.id,status:x.job.state})}
    if(m==='POST'&&p[2]==='diagnoses')return send(res,201,await diagnose(c));
    if(m==='POST'&&p[2]==='experiments'&&p.length===3){const x=await scheduleExperiment(c,body.diagnosisId);return send(res,202,{experimentId:x.experiment.id,status:x.experiment.state,orchestrationJobId:x.orchestrationJobId})}
    if(m==='POST'&&p[2]==='experiments'&&p[4]==='promote')return send(res,200,await promotion(c,p[3],body.candidateRevisionId));
    if(m==='POST'&&p[2]==='approvals'&&p[4]==='decision')return send(res,200,await approvalDecision(c,p[3],{decision:body.decision,decidedBy:body.decidedBy||'user',reason:body.reason||''}));
    if(m==='POST'&&p[2]==='organizations'&&p[4]==='rollback')return send(res,200,await rollback(c,p[3]));
    if(m==='POST'&&p[2]==='controls')return send(res,200,await control(c,body.action));
    throw new DomainError('route_not_found',404);
  }catch(e){return send(res,e.status||500,{error:e.message||'internal_error',details:e.details})}
}
function send(res,status,data){res.statusCode=status;res.end(JSON.stringify(data))}
async function read(req){const chunks=[];for await(const c of req)chunks.push(c);if(!chunks.length)return{};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new DomainError('invalid_json')}}