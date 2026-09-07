import assert from 'node:assert/strict';
import {startOperatingSession} from '../lib/universal.mjs';
import {WorkerService} from '../lib/worker-service.mjs';
import {list,get} from '../lib/store.mjs';

const saved={
  key:process.env.SCRAPY_CLOUD_API_KEY,
  project:process.env.SCRAPY_CLOUD_PROJECT_ID,
  spider:process.env.SCRAPY_CLOUD_SPIDER
};
delete process.env.SCRAPY_CLOUD_API_KEY;
delete process.env.SCRAPY_CLOUD_PROJECT_ID;
delete process.env.SCRAPY_CLOUD_SPIDER;

try{
  const started=await startOperatingSession({goal:'Observe a public page',context:{targetUrl:'https://example.com'}});
  let rows=await list({companyId:started.company.id,limit:200});
  assert.equal(rows.filter(x=>x.kind==='capability').length,0,'API-side session should start without Railway-only Scrapy credentials');

  process.env.SCRAPY_CLOUD_API_KEY='test-worker-key';
  process.env.SCRAPY_CLOUD_PROJECT_ID='877155';
  process.env.SCRAPY_CLOUD_SPIDER='generic_observer';

  const tick=await new WorkerService({workerId:'runtime-provider-registration-worker'}).tick();
  assert.ok(tick?.session,'worker should advance the session');
  rows=await list({companyId:started.company.id,limit:300});
  const provider=rows.find(x=>x.kind==='capability_provider'&&x.data.adapter==='scrapy-cloud');
  const capability=rows.find(x=>x.kind==='capability'&&x.data.name==='observe_public_web');
  assert.ok(provider,'Railway-side worker should register configured Scrapy Cloud provider');
  assert.ok(capability,'Railway-side worker should persist observe_public_web capability');

  const world=rows.find(x=>x.kind==='world_model'&&x.data.sessionId===started.session.id);
  assert.equal(world?.data?.capabilities?.length,1,'world model should include the newly registered runtime capability');
  const stage=rows.find(x=>x.kind==='session_artifact'&&x.data.sessionId===started.session.id&&x.data.stage==='learning_world');
  assert.ok(stage?.data?.items?.some(x=>x.type==='capability_count'&&x.label==='1 declared capabilities'),'world ledger should surface the declared capability');
  assert.equal((await get(started.session.id)).data.currentStage,'finding_paths');
  console.log('runtime-provider-registration: PASS');
}finally{
  if(saved.key==null)delete process.env.SCRAPY_CLOUD_API_KEY;else process.env.SCRAPY_CLOUD_API_KEY=saved.key;
  if(saved.project==null)delete process.env.SCRAPY_CLOUD_PROJECT_ID;else process.env.SCRAPY_CLOUD_PROJECT_ID=saved.project;
  if(saved.spider==null)delete process.env.SCRAPY_CLOUD_SPIDER;else process.env.SCRAPY_CLOUD_SPIDER=saved.spider;
}
