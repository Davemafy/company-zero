const LOG_POLL_MS=1500;
const COMPANY_POLL_EVERY=3;
const MAX_LOG_ROWS=24;
let lastCompany='';
let lastSession='';
let lastTerminalEvent='';
let inflight=false;
let tick=0;
let cachedCompany=null;
let allowFullWorkRender=false;
let restoreScrollY=null;
let lastArtifactSignature='';
let pollFailures=0;
let refreshQueued=false;

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>{try{return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}catch{return''}};
const compact=(s,n=84)=>{const x=String(s||'').replace(/\s+/g,' ').trim();return x.length>n?`${x.slice(0,n-1).trim()}…`:x};
const prettyKind=s=>String(s||'').replaceAll('_',' ').replace('company creation','venture creation');
const prettyItem=s=>String(s||'').replaceAll('_',' ');

function sessionFromRecords(records=[]){
  return records.filter(x=>x.kind==='operating_session').sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]?.id||'';
}

function recordsForSession(records=[]){
  return records.filter(x=>!lastSession||!x.data?.sessionId||x.data.sessionId===lastSession);
}

function lifecycleMessage(type,payload,fallback){
  const upper=String(type||'').toUpperCase();
  const d=payload||{};
  if(upper==='ORGANIZATION_ASSEMBLED'){
    const f=d.organization?.functions||[];
    return f.length?`Organization assembled — ${f.map(prettyItem).join(' → ')}.`:'Organization assembled.';
  }
  if(['PLANNER_FINISHED','PLANNER_FALLBACK_SUCCEEDED'].includes(upper)){
    const kind=d.contract?.kind||d.kind||'';
    return `Planner selected ${prettyKind(kind)||'the execution path'}${Array.isArray(d.workUnits)?` with ${d.workUnits.length} work units`:''}.`;
  }
  if(upper==='EVALUATOR_JUDGMENT'){
    const missing=d.contract?.missing||[];
    if(missing.length)return `${missing.length} requested deliverable${missing.length===1?' is':'s are'} missing — ${missing.slice(0,4).map(prettyItem).join(', ')}${missing.length>4?'…':''}.`;
    if(Array.isArray(d.reasons)&&d.reasons.length)return `Evaluator found ${d.reasons.length} quality issue${d.reasons.length===1?'':'s'} before release.`;
    return 'Evaluator accepted the result against the mission contract.';
  }
  if(upper==='STRUCTURAL_FAILURE')return 'Evaluator rejected result — the current organization failed the mission contract structurally.';
  if(upper==='GOVERNOR_DECISION'&&d.action==='RESTRUCTURE')return 'Governor testing alternative organizations — repeated structural failure crossed the restructuring threshold.';
  if(upper==='ORGANIZATION_FROZEN')return 'Organization frozen — the failure cases are locked for fair replay.';
  if(upper==='GOVERNOR_EXPERIMENT_STARTED')return d.message||fallback||'Governor testing alternative organizations against the same frozen cases.';
  if(upper==='GOVERNOR_CANDIDATE_EVALUATED')return d.message||fallback||'Governor evaluated a candidate organization.';
  if(upper==='ORGANIZATION_PROMOTED')return d.message||fallback||'Organization promoted — the winning candidate is now production.';
  if(upper==='GOVERNOR_BASELINE_KEPT')return d.message||fallback||'No candidate beat the current organization. Baseline kept.';
  return fallback;
}

function humanEvent(evt){
  const d=evt?.data||{};
  const type=String(d.type||'UPDATE');
  const payload=d.data||{};
  const fallback=String(d.message||payload?.message||String(type).replaceAll('_',' ').toLowerCase());
  return {
    id:String(evt.id||`${type}:${d.occurredAt||evt.created_at||Math.random()}`),
    type,
    message:lifecycleMessage(type,payload,fallback),
    data:payload,
    at:d.occurredAt||evt.created_at||evt.updated_at
  };
}

function stageFromEvent(event){
  if(!event)return 'Working on it';
  const type=String(event.type||'').toUpperCase();
  if(type.includes('PROMOTED'))return 'Organization improved';
  if(type.includes('GOVERNOR')||type.includes('EXPERIMENT')||type.includes('CANDIDATE')||type.includes('FROZEN'))return 'Testing the organization';
  if(type.includes('EVALUATOR')||type.includes('QUALITY')||type.includes('VERIFY')||type.includes('STRUCTURAL_FAILURE'))return 'Checking the result';
  if(type.includes('PLAN')||type.includes('ORGANIZATION_ASSEMBLED'))return 'Planning the work';
  if(type.includes('SEARCH')||type.includes('RESEARCH')||type.includes('EVIDENCE'))return 'Gathering evidence';
  if(type.includes('MODEL')||type.includes('EXECUTION'))return 'Doing the work';
  if(type.includes('PERSIST')||type.includes('SAV'))return 'Saving the result';
  if(type.includes('RESULT_READY'))return 'Result ready';
  if(type.includes('RESULT_PARTIAL'))return 'Partial result ready';
  if(type.includes('FAIL')||type.includes('DEGRADED'))return 'Recovering safely';
  return compact(event.message,54)||'Working on it';
}

function statusFrom(records,events){
  const scoped=recordsForSession(records);
  const approval=scoped.find(x=>x.kind==='approval_request'&&['pending','waiting'].includes(x.state));
  const access=scoped.find(x=>x.kind==='capability_access_request'&&x.state==='open');
  const artifact=scoped.filter(x=>x.kind==='artifact'&&x.state==='ready').sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')))[0];
  const last=events.at(-1);
  if(approval||access)return{label:'Needs you',tone:'warn'};
  if(last?.type==='ORGANIZATION_PROMOTED')return{label:'Improved',tone:'good'};
  if(String(last?.type||'').includes('GOVERNOR')||String(last?.type||'').includes('EXPERIMENT'))return{label:'Adapting',tone:'live'};
  if(last?.type==='RESULT_READY')return{label:'Ready',tone:'good'};
  if(last?.type==='RESULT_PARTIAL'||artifact?.data?.degraded)return{label:'Partial',tone:'warn'};
  if(pollFailures>1)return{label:'Reconnecting',tone:'warn'};
  return{label:'Working',tone:'live'};
}

function artifactSignature(records=[]){
  return recordsForSession(records).filter(x=>x.kind==='artifact'&&x.state==='ready').map(x=>`${x.id}:${x.data?.deliverableVersion||1}:${x.updated_at||x.created_at||''}`).sort().join('|');
}

function eventTone(type=''){
  const t=String(type).toUpperCase();
  if(t==='ORGANIZATION_PROMOTED'||t==='RESULT_READY'||t.includes('PASS'))return'good';
  if(t.includes('STRUCTURAL_FAILURE')||t.includes('REJECT')||t.includes('FAILED'))return'bad';
  if(t.includes('GOVERNOR')||t.includes('EXPERIMENT')||t.includes('CANDIDATE')||t.includes('FROZEN'))return'governor';
  return'';
}

function ensureStyles(){
  if(document.getElementById('cz-live-log-styles'))return;
  const style=document.createElement('style');style.id='cz-live-log-styles';style.textContent=`
  .cz-live-log-panel{margin:18px 0 112px;border:1px solid rgba(121,255,57,.16);background:rgba(7,14,8,.82);border-radius:18px;padding:18px 20px;backdrop-filter:blur(12px);contain:layout paint}
  .cz-live-log-head{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:14px}.cz-live-log-head>div{display:flex;flex-direction:column;gap:5px}.cz-live-log-head strong{font-size:14px;font-weight:650;color:#eef7eb}.cz-live-pulse{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:#9cff3d;text-transform:uppercase;letter-spacing:.11em}.cz-live-pulse.warn{color:#f3c453}.cz-live-pulse i{width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 0 5px rgba(156,255,61,.08);animation:czPulse 1.4s ease-in-out infinite}
  .cz-live-log-list{display:flex;flex-direction:column;max-height:330px;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;scroll-behavior:smooth}.cz-live-log-list::-webkit-scrollbar{display:none}.cz-live-log-row{display:grid;grid-template-columns:72px 12px 1fr;gap:10px;align-items:start;padding:10px 0;border-top:1px solid rgba(255,255,255,.05);opacity:.7;content-visibility:auto;contain-intrinsic-size:48px}.cz-live-log-row.latest{opacity:1}.cz-live-log-row.is-new{animation:czLogIn .32s cubic-bezier(.2,.8,.2,1) both}.cz-live-log-time{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#738174}.cz-live-log-dot{width:7px;height:7px;border-radius:50%;background:#667367;margin-top:5px}.cz-live-log-row.latest .cz-live-log-dot{background:#9cff3d;box-shadow:0 0 12px rgba(156,255,61,.5)}.cz-live-log-row.governor .cz-live-log-dot{background:#b98cff;box-shadow:0 0 12px rgba(185,140,255,.28)}.cz-live-log-row.good .cz-live-log-dot{background:#9cff3d}.cz-live-log-row.bad .cz-live-log-dot{background:#ff8d72}.cz-live-log-row strong{display:block;font-size:13px;line-height:1.45;font-weight:550;color:#e5eee2}.cz-live-log-row.governor strong{color:#efe6ff}.cz-live-log-row small{display:block;margin-top:3px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#69766a}.cz-live-log-empty{padding:12px 0;color:#758076;font-size:13px}
  .premium-work{overflow-anchor:none}.composer-wrap{transform:translateZ(0);backface-visibility:hidden;contain:layout style;pointer-events:none;padding-bottom:max(18px,env(safe-area-inset-bottom))}.composer-wrap .composer{pointer-events:auto}.composer{transform:translateZ(0)}
  @keyframes czPulse{50%{opacity:.35;transform:scale(.82)}}@keyframes czLogIn{from{opacity:0;transform:translateY(8px)}to{opacity:.7;transform:none}}
  @media(max-width:760px){.cz-live-log-panel{margin:14px 0 122px;padding:15px}.cz-live-log-list{max-height:300px}.cz-live-log-row{grid-template-columns:58px 10px 1fr;gap:8px}.cz-live-log-head strong{font-size:13px}}
  `;document.head.appendChild(style);
}

function rowElement(event){
  const row=document.createElement('div');
  row.className=`cz-live-log-row is-new ${eventTone(event.type)}`.trim();row.dataset.eventId=event.id;
  row.innerHTML=`<span class="cz-live-log-time">${escapeHtml(time(event.at))}</span><span class="cz-live-log-dot"></span><div><strong>${escapeHtml(event.message)}</strong><small>${escapeHtml(event.type.replaceAll('_',' ').toLowerCase())}</small></div>`;
  row.addEventListener('animationend',()=>row.classList.remove('is-new'),{once:true});
  return row;
}

function ensurePanel(){
  ensureStyles();
  const work=document.querySelector('.premium-work');if(!work)return null;
  let panel=document.querySelector('.cz-live-log-panel');
  if(panel)return panel;
  panel=document.createElement('section');panel.className='cz-live-log-panel';panel.setAttribute('aria-live','polite');
  panel.innerHTML=`<div class="cz-live-log-head"><div><span class="eyebrow">LIVE LOG</span><strong>What Company Zero is doing</strong></div><span class="cz-live-pulse"><i></i><b>live</b></span></div><div class="cz-live-log-list"><div class="cz-live-log-empty">Waiting for the first real runtime event…</div></div>`;
  const composer=document.querySelector('.composer-wrap');
  if(composer&&composer.parentElement===work)work.insertBefore(panel,composer);else work.appendChild(panel);
  return panel;
}

function mount(events){
  const panel=ensurePanel();if(!panel)return;
  const list=panel.querySelector('.cz-live-log-list');if(!list)return;
  const desired=events.slice(-MAX_LOG_ROWS);
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<56;
  const oldHeight=list.scrollHeight;
  const empty=list.querySelector('.cz-live-log-empty');if(desired.length&&empty)empty.remove();
  const keep=new Set(desired.map(e=>e.id));
  list.querySelectorAll('[data-event-id]').forEach(node=>{if(!keep.has(node.dataset.eventId))node.remove()});
  const existing=new Map([...list.querySelectorAll('[data-event-id]')].map(n=>[n.dataset.eventId,n]));
  for(const event of desired){if(!existing.has(event.id))list.appendChild(rowElement(event))}
  const rows=[...list.querySelectorAll('[data-event-id]')];rows.forEach((r,i)=>r.classList.toggle('latest',i===rows.length-1));
  if(!desired.length&&!list.querySelector('.cz-live-log-empty'))list.innerHTML='<div class="cz-live-log-empty">Waiting for the first real runtime event…</div>';
  if(nearBottom)requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight});
  else if(list.scrollHeight!==oldHeight)list.scrollTop=Math.max(0,list.scrollTop);
  const pulse=panel.querySelector('.cz-live-pulse');if(pulse){pulse.classList.toggle('warn',pollFailures>1);const label=pulse.querySelector('b');if(label)label.textContent=pollFailures>1?'reconnecting':'live'}
}

function patchWorkChrome(company,events){
  if(!company||!document.querySelector('.premium-work'))return;
  const records=company.records||[];
  const scoped=recordsForSession(records);
  const artifacts=scoped.filter(x=>x.kind==='artifact'&&x.state==='ready').length;
  const evidence=scoped.filter(x=>x.kind==='world_fact'&&x.data?.classification==='EXTERNAL_OBSERVATION').length;
  const status=statusFrom(records,events);
  const lastEvent=events.at(-1);
  const meta=document.querySelector('.command-meta');
  if(meta){const spans=meta.querySelectorAll(':scope > span:not(.status-pill)');if(spans[0])spans[0].textContent=`${artifacts} artifact${artifacts===1?'':'s'}`;if(spans[1])spans[1].textContent=`${evidence} receipt${evidence===1?'':'s'}`;const pill=meta.querySelector('.status-pill');if(pill){pill.className=`status-pill ${status.tone}`;pill.innerHTML=`<i></i>${escapeHtml(status.label)}`}}
  const kpis=document.querySelectorAll('.mission-kpis > div');
  if(kpis[0]?.querySelector('strong'))kpis[0].querySelector('strong').textContent=stageFromEvent(lastEvent);
  if(kpis[1]?.querySelector('strong'))kpis[1].querySelector('strong').textContent=evidence?`${evidence} grounded signal${evidence===1?'':'s'}`:'Awaiting evidence';
  if(kpis[2]?.querySelector('strong'))kpis[2].querySelector('strong').textContent=artifacts?`${artifacts} ready`:'Building V1';
  const asideStatus=document.querySelector('.aside-head > span:last-child');if(asideStatus)asideStatus.textContent=status.label;
  const liveTitle=document.querySelector('.live-output-head h2');if(liveTitle){const count=artifacts+evidence;liveTitle.textContent=count?`${count} grounded output${count===1?'':'s'} captured`:'Work will appear here as it becomes real'}
}

function installRenderGuard(){
  const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!descriptor?.set||Element.prototype.__czStableInnerHTML)return;
  Object.defineProperty(Element.prototype,'__czStableInnerHTML',{value:true,configurable:true});
  Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,enumerable:descriptor.enumerable,get:descriptor.get,set(value){
    const isWorkSwap=this.id==='view'&&this.querySelector?.('.premium-work')&&typeof value==='string'&&value.includes('premium-work');
    if(isWorkSwap&&!allowFullWorkRender)return;
    if(isWorkSwap&&allowFullWorkRender){restoreScrollY=window.scrollY;allowFullWorkRender=false;descriptor.set.call(this,value);requestAnimationFrame(()=>{if(restoreScrollY!==null){window.scrollTo({top:restoreScrollY,behavior:'auto'});restoreScrollY=null}});return}
    descriptor.set.call(this,value);
  }});
  document.addEventListener('click',e=>{if(e.target.closest('#refresh,[data-company],[data-page],[data-control],[data-approval],[data-provider]'))allowFullWorkRender=true},true);
  document.addEventListener('submit',e=>{if(e.target.matches('#conversation'))allowFullWorkRender=true},true);
  window.addEventListener('hashchange',()=>{allowFullWorkRender=true});
}

function requestFullRefresh(){
  if(refreshQueued)return;
  refreshQueued=true;allowFullWorkRender=true;
  const refresh=document.getElementById('refresh');if(refresh)refresh.click();
  setTimeout(()=>{refreshQueued=false},900);
}

async function poll(){
  if(inflight)return;
  const companyId=localStorage.cz_active||'';
  if(!companyId){lastCompany='';lastSession='';lastTerminalEvent='';cachedCompany=null;return}
  inflight=true;tick++;
  try{
    if(companyId!==lastCompany){lastCompany=companyId;lastSession='';lastTerminalEvent='';cachedCompany=null;lastArtifactSignature=''}
    const needCompany=!cachedCompany||tick%COMPANY_POLL_EVERY===0||!lastSession;
    const companyPromise=needCompany?fetch(`/api/v1/companies/${encodeURIComponent(companyId)}`,{cache:'no-store'}):Promise.resolve(null);
    const eventPromise=fetch(`/api/v1/companies/${encodeURIComponent(companyId)}/runtime-events`,{cache:'no-store'});
    const [companyRes,eventRes]=await Promise.all([companyPromise,eventPromise]);
    if(eventRes&&!eventRes.ok)throw Error(`runtime_events_${eventRes.status}`);
    if(companyRes){if(!companyRes.ok)throw Error(`company_${companyRes.status}`);cachedCompany=await companyRes.json()}
    if(cachedCompany&&!lastSession)lastSession=sessionFromRecords(cachedCompany.records||[]);
    const payload=await eventRes.json();
    const events=(payload.items||[]).filter(x=>!lastSession||x.data?.sessionId===lastSession).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))).map(humanEvent);
    pollFailures=0;mount(events);patchWorkChrome(cachedCompany,events);
    if(cachedCompany){const signature=artifactSignature(cachedCompany.records||[]);if(lastArtifactSignature&&signature!==lastArtifactSignature)requestFullRefresh();lastArtifactSignature=signature}
    const terminalEvent=events.at(-1);
    if(terminalEvent&&['RESULT_READY','RESULT_PARTIAL','ORGANIZATION_PROMOTED'].includes(terminalEvent.type)&&terminalEvent.id!==lastTerminalEvent){lastTerminalEvent=terminalEvent.id;requestFullRefresh()}
  }catch{pollFailures++;const pulse=document.querySelector('.cz-live-pulse');if(pulse){pulse.classList.add('warn');const label=pulse.querySelector('b');if(label)label.textContent='reconnecting'}}finally{inflight=false}
}

installRenderGuard();
setInterval(poll,LOG_POLL_MS);
window.addEventListener('hashchange',()=>setTimeout(poll,30));
window.addEventListener('storage',poll);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
poll();
