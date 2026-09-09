import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';

const databaseUrl=process.env.TEST_DATABASE_URL||process.env.SUPABASE_TEST_DATABASE_URL;
if(!databaseUrl){console.log('integration: SKIPPED (database credentials not configured)');process.exit(0)}

let pg;
try{pg=await import('pg')}catch{throw new Error('PostgreSQL integration requires the dev dependency "pg"; run npm install')}
const {Client,Pool}=pg.default||pg;
const schema=`cz_it_${randomBytes(8).toString('hex')}`,quoted=`"${schema}"`;
const admin=new Client({connectionString:databaseUrl});
await admin.connect();
let pool;
const setPath=client=>client.query(`set search_path to ${quoted}, public`);
const query=async(text,params=[])=>{const client=await pool.connect();try{await setPath(client);return await client.query(text,params)}finally{client.release()}};
const record=async({id=randomUUID(),companyId,kind,state='active',data})=>{await query('insert into cz_records(id,company_id,kind,state,data) values($1,$2,$3,$4,$5)',[id,companyId,kind,state,data]);return id};

try{
  await admin.query(`create schema ${quoted}`);
  await setPath(admin);
  for(const file of ['db/schema.sql','db/002_durable_runtime.sql','db/003_control_plane.sql','db/004_outcome_control.sql','db/005_deliverable_artifacts.sql'])await admin.query(await readFile(new URL(`../${file}`,import.meta.url),'utf8'));
  pool=new Pool({connectionString:databaseUrl,max:16});

  // SKIP LOCKED claim, lease renewal, and expired-lease recovery.
  const queueCompany=randomUUID(),queueJob=randomUUID();
  await query('insert into cz_queue(company_id,job_id,idempotency_key,work_key) values($1,$2,$3,$3)',[queueCompany,queueJob,'claim-one']);
  const claims=await Promise.all([query('select * from cz_claim_work($1,$2)',['worker-a',1]),query('select * from cz_claim_work($1,$2)',['worker-b',1])]);
  assert.equal(claims.reduce((n,x)=>n+x.rowCount,0),1,'SKIP LOCKED allowed two claims');
  const claimed=claims.find(x=>x.rowCount).rows[0];
  assert.equal((await query('select cz_renew_lease($1,$2,$3) renewed',[claimed.id,claimed.lease_owner,60])).rows[0].renewed,true);
  assert.equal((await query('select * from cz_claim_work($1,$2)',['lease-thief',1])).rowCount,0,'renewed lease was stolen');
  await query("update cz_queue set lease_expires_at=now()-interval '1 second' where id=$1",[claimed.id]);
  const recovered=await query('select * from cz_claim_work($1,$2)',['recovery-worker',30]);assert.equal(recovered.rows[0].id,claimed.id);

  // Worker liveness is durable and visible across connections.
  await query("insert into cz_worker_heartbeats(worker_id,version,current_queue_id,metadata) values($1,$2,$3,$4) on conflict(worker_id) do update set version=excluded.version,current_queue_id=excluded.current_queue_id,metadata=excluded.metadata,heartbeat_at=now()",['integration-worker','3.2',claimed.id,{status:'working'}]);
  const heartbeatReader=await pool.connect();try{await setPath(heartbeatReader);const heartbeat=await heartbeatReader.query('select * from cz_worker_heartbeats where worker_id=$1',['integration-worker']);assert.equal(heartbeat.rows[0].current_queue_id,claimed.id);assert.equal(heartbeat.rows[0].metadata.status,'working')}finally{heartbeatReader.release()}

  // Active remediation uniqueness.
  const remediationCompany=randomUUID(),revisionId=randomUUID(),signature='metric:contract';
  const remediations=await Promise.all([query('select cz_begin_remediation($1,$2,$3,$4) value',[remediationCompany,revisionId,signature,{}]),query('select cz_begin_remediation($1,$2,$3,$4) value',[remediationCompany,revisionId,signature,{}])]);
  assert.equal(new Set(remediations.map(x=>x.rows[0].value.id)).size,1);assert.equal(remediations.filter(x=>x.rows[0].value.created).length,1);
  assert.equal((await query("select count(*)::int n from cz_remediations where company_id=$1 and state='diagnosing'",[remediationCompany])).rows[0].n,1);

  // Experiment work identity is atomic across job persistence and queueing.
  const workCompany=randomUUID(),workKey='experiment:e:revision:r:source:s';
  const workJobs=[randomUUID(),randomUUID()].map(id=>({id,company_id:workCompany,kind:'job',state:'queued',version:0,data:{experimentWorkKey:workKey,status:'queued'},created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
  const ensured=await Promise.all(workJobs.map(job=>query('select cz_ensure_experiment_work($1,$2,$3) value',[workCompany,workKey,job])));
  assert.equal(new Set(ensured.map(x=>x.rows[0].value.job.id)).size,1);
  assert.equal((await query("select count(*)::int n from cz_records where company_id=$1 and kind='job' and data->>'experimentWorkKey'=$2",[workCompany,workKey])).rows[0].n,1);
  assert.equal((await query('select count(*)::int n from cz_queue where company_id=$1 and work_key=$2',[workCompany,workKey])).rows[0].n,1);

  // Transactional budget reservation and settlement.
  const budgetCompany=randomUUID();
  const reservations=await Promise.allSettled([query('select cz_reserve_budget($1,$2,$3,$4) id',[budgetCompany,'budget-a',.75,1]),query('select cz_reserve_budget($1,$2,$3,$4) id',[budgetCompany,'budget-b',.75,1])]);
  assert.equal(reservations.filter(x=>x.status==='fulfilled').length,1,'concurrent reservations overspent');
  const reservationId=reservations.find(x=>x.status==='fulfilled').value.rows[0].id;
  await query("select cz_settle_budget($1,'released')",[reservationId]);
  assert.ok((await query('select cz_reserve_budget($1,$2,$3,$4) id',[budgetCompany,'budget-after-release',.75,1])).rows[0].id);

  // Approval persistence across distinct connections.
  const approvalCompany=randomUUID(),approvalId=randomUUID();
  const first=await pool.connect(),second=await pool.connect();
  try{await setPath(first);await setPath(second);await first.query('insert into cz_approvals(id,company_id,job_id,run_id,invocation_id,invocation_key,organization_revision_id,role_id,capability_id,reason,risk,arguments) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[approvalId,approvalCompany,randomUUID(),randomUUID(),randomUUID(),'approval-persist',randomUUID(),'role',randomUUID(),'sensitive operation','external_side_effect',{}]);const persisted=await second.query('select * from cz_approvals where id=$1',[approvalId]);assert.equal(persisted.rows[0].state,'pending')}finally{first.release();second.release()}

  // Append-only rollback.
  const rollbackCompany=randomUUID(),targetId=randomUUID(),currentId=randomUUID();
  await record({id:rollbackCompany,companyId:rollbackCompany,kind:'company',data:{activeOrganizationRevisionId:currentId,status:'active'}});
  await record({id:targetId,companyId:rollbackCompany,kind:'organization_revision',state:'retired',data:{revision:1,status:'retired',roles:[{id:'original'}]}});
  await record({id:currentId,companyId:rollbackCompany,kind:'organization_revision',state:'production',data:{revision:2,status:'production',roles:[{id:'current'}]}});
  const beforeRollback=(await query('select data from cz_records where id=$1',[targetId])).rows[0].data;
  const restored=(await query('select cz_rollback_revision($1,$2) value',[rollbackCompany,targetId])).rows[0].value;
  assert.equal(restored.data.rollbackOfRevisionId,targetId);assert.ok(restored.data.revision>2);
  assert.deepEqual((await query('select data from cz_records where id=$1',[targetId])).rows[0].data,beforeRollback);

  // One-winner promotion plus stale-baseline rejection.
  const promotionCompany=randomUUID(),baseId=randomUUID(),candidateIds=[randomUUID(),randomUUID()],experimentId=randomUUID();
  await record({id:promotionCompany,companyId:promotionCompany,kind:'company',data:{activeOrganizationRevisionId:baseId,status:'active'}});
  await record({id:baseId,companyId:promotionCompany,kind:'organization_revision',state:'production',data:{revision:1,status:'production'}});
  for(let i=0;i<candidateIds.length;i++)await record({id:candidateIds[i],companyId:promotionCompany,kind:'candidate_revision',state:'candidate',data:{revision:i+2,status:'candidate',mutation:{type:'ChangeRouting'}}});
  const result=candidateIds.map(candidateRevisionId=>({candidateRevisionId,cases:3,minCases:3,qualityDelta:.2,costDelta:-.1,uncertainCases:0,policyStatus:'PASS',constitutionPassed:true}));
  await record({id:experimentId,companyId:promotionCompany,kind:'experiment',state:'awaiting_decision',data:{baselineRevisionId:baseId,candidateRevisionIds:candidateIds,sourceJobIds:[],results:result,status:'awaiting_decision'}});
  const promoted=await Promise.allSettled(candidateIds.map(id=>query('select cz_promote_candidate($1,$2,$3) value',[promotionCompany,experimentId,id])));
  assert.equal(promoted.filter(x=>x.status==='fulfilled').length,1,'concurrent promotion produced multiple winners');
  assert.equal((await query("select count(*)::int n from cz_records where company_id=$1 and kind='organization_revision' and state='production'",[promotionCompany])).rows[0].n,1);
  const staleCandidate=randomUUID(),staleExperiment=randomUUID();await record({id:staleCandidate,companyId:promotionCompany,kind:'candidate_revision',state:'candidate',data:{revision:4,status:'candidate'}});
  await record({id:staleExperiment,companyId:promotionCompany,kind:'experiment',state:'awaiting_decision',data:{baselineRevisionId:baseId,candidateRevisionIds:[staleCandidate],results:[{candidateRevisionId:staleCandidate,cases:3,minCases:3,qualityDelta:.2,costDelta:-.1,uncertainCases:0,policyStatus:'PASS',constitutionPassed:true}]}});
  await assert.rejects(()=>query('select cz_promote_candidate($1,$2,$3)',[promotionCompany,staleExperiment,staleCandidate]),/stale_experiment_baseline/);

  // Deliverable revision allocation is atomic and scoped by contract.
  const deliverableCompany=randomUUID(),deliverableContract=randomUUID();
  await record({id:deliverableContract,companyId:deliverableCompany,kind:'deliverable_contract',state:'building',data:{status:'building'}});
  const reserves=await Promise.all([0,1].map(()=>query('select cz_reserve_deliverable_artifact_revision($1,$2,$3,$4,$5,$6,$7,$8,$9) value',[deliverableCompany,deliverableContract,null,null,'primary','website','Site','', 'integration'])));
  const versions=reserves.map(x=>Number(x.rows[0].value.deliverableVersion)).sort((a,b)=>a-b);assert.deepEqual(versions,[1,2]);
  assert.equal((await query('select count(*)::int n from cz_artifacts where company_id=$1 and deliverable_contract_id=$2 and artifact_key=$3',[deliverableCompany,deliverableContract,'primary'])).rows[0].n,1);
  assert.equal((await query('select count(*)::int n from cz_deliverable_revisions where company_id=$1 and deliverable_contract_id=$2',[deliverableCompany,deliverableContract])).rows[0].n,2);

  // Universal operating state and provenance survive process/connection boundaries.
  const universalCompany=randomUUID(),sessionId=randomUUID(),contractId=randomUUID(),factId=randomUUID(),strategyId=randomUUID(),planId=randomUUID(),observationId=randomUUID(),externalObservationId=randomUUID();
  await record({id:universalCompany,companyId:universalCompany,kind:'company',data:{status:'active',missionVersion:1}});
  await record({id:sessionId,companyId:universalCompany,kind:'operating_session',state:'operating',data:{goal:'Arbitrary outcome',currentStage:'producing_progress'}});
  await record({id:contractId,companyId:universalCompany,kind:'outcome_contract',state:'proposed',data:{sessionId,desiredState:'Arbitrary outcome',successCriteria:[{metricId:'metric_x',target:5}]}});
  await record({id:factId,companyId:universalCompany,kind:'world_fact',state:'observed',data:{sessionId,classification:'EXTERNAL_OBSERVATION',sourceType:'capability',sourceRef:'trace-x',evidenceIds:['trace-x']}});
  await record({id:strategyId,companyId:universalCompany,kind:'strategy_selection',state:'selected',data:{sessionId,evidenceRefs:[factId],score:{total:.8}}});
  await record({id:planId,companyId:universalCompany,kind:'operation_plan',state:'validated',data:{sessionId,strategySelectionId:strategyId,operations:[{capabilityId:randomUUID(),args:{}}]}});
  await record({id:observationId,companyId:universalCompany,kind:'outcome_observation',state:'observed',data:{sessionId,classification:'EXTERNAL_OBSERVATION',metrics:{metric_x:3},evidenceIds:['trace-x']}});
  await record({id:externalObservationId,companyId:universalCompany,kind:'external_observation',state:'observed',data:{sessionId,provider:'zyte',requestedUrl:'https://example.com/',observedAt:new Date().toISOString(),invocationId:randomUUID(),evidenceId:'trace-x',classification:'EXTERNAL_OBSERVATION'}});
  const restartReader=await pool.connect();try{await setPath(restartReader);const persisted=await restartReader.query("select kind,data from cz_records where company_id=$1 and kind in('operating_session','outcome_contract','world_fact','strategy_selection','operation_plan','outcome_observation','external_observation')",[universalCompany]);assert.equal(persisted.rowCount,7);assert.equal(persisted.rows.find(x=>x.kind==='world_fact').data.classification,'EXTERNAL_OBSERVATION');assert.equal(persisted.rows.find(x=>x.kind==='external_observation').data.provider,'zyte');assert.equal(persisted.rows.find(x=>x.kind==='operating_session').data.currentStage,'producing_progress')}finally{restartReader.release()}

  console.log('integration: PASS');
}finally{
  if(pool)await pool.end();
  try{await admin.query(`drop schema if exists ${quoted} cascade`)}finally{await admin.end()}
}
