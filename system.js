const NAV=[['home','Home','home'],['work','Work','briefcase'],['results','Results','chart'],['connections','Connections','link']];
const ICONS={
  home:'<path d="M3.5 10.5 10 5l6.5 5.5"/><path d="M5.5 9.2v7.3h9V9.2"/><path d="M8.3 16.5v-4.8h3.4v4.8"/>',
  briefcase:'<rect x="3.5" y="6.5" width="13" height="9.5" rx="2"/><path d="M7.5 6.5V5.2c0-.9.7-1.7 1.7-1.7h1.6c.9 0 1.7.7 1.7 1.7v1.3"/><path d="M3.5 10.5h13"/><path d="M8.2 10.5v1.4h3.6v-1.4"/>',
  chart:'<path d="M4 16V9.5"/><path d="M9 16V5.5"/><path d="M14 16V2.8"/><path d="M2.5 16.5h15"/>',
  link:'<path d="M7.4 12.6 6 14a3.1 3.1 0 0 1-4.4-4.4l2.3-2.3a3.1 3.1 0 0 1 4.4 0"/><path d="m12.6 7.4 1.4-1.4a3.1 3.1 0 1 1 4.4 4.4l-2.3 2.3a3.1 3.1 0 0 1-4.4 0"/><path d="m7 10 6-6" transform="translate(0 3)"/>',
  settings:'<circle cx="10" cy="10" r="2.3"/><path d="M10 2.8v1.4M10 15.8v1.4M2.8 10h1.4M15.8 10h1.4M4.9 4.9l1 1M14.1 14.1l1 1M15.1 4.9l-1 1M5.9 14.1l-1 1"/>',
  plus:'<path d="M10 4v12M4 10h12"/>',
  menu:'<path d="M3 5.5h14M3 10h14M3 14.5h14"/>',
  close:'<path d="m5 5 10 10M15 5 5 15"/>',
  arrowUp:'<path d="M10 16V4M5.5 8.5 10 4l4.5 4.5"/>',
  arrowRight:'<path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5"/>',
  arrowLeft:'<path d="M16 10H4M8.5 5.5 4 10l4.5 4.5"/>',
  check:'<path d="m4.5 10.5 3.3 3.2 7.7-7.8"/>',
  branch:'<path d="M5 4v8.5a3 3 0 0 0 3 3h7"/><circle cx="5" cy="4" r="1.6"/><circle cx="15" cy="15.5" r="1.6"/><path d="M8 7h4a3 3 0 0 0 3-3"/><circle cx="15" cy="4" r="1.6"/>',
  sparkle:'<path d="M10 2.8 11.4 7l4.2 1.4-4.2 1.4L10 14l-1.4-4.2-4.2-1.4L8.6 7 10 2.8Z"/><path d="m15.2 13 .6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8Z"/>',
  people:'<circle cx="7" cy="7" r="2.3"/><path d="M2.8 15.8c.6-2.5 2-3.8 4.2-3.8s3.6 1.3 4.2 3.8"/><circle cx="14.3" cy="8" r="1.8"/><path d="M12.7 12.3c2.2-.3 3.7.8 4.3 3.5"/>',
  refresh:'<path d="M15.5 6.8A6.5 6.5 0 1 0 16 12"/><path d="M15.5 3.8v3.4h-3.4"/>',
  receipt:'<path d="M5 3.5h10v13l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V3.5Z"/><path d="M7.5 7h5M7.5 10h5M7.5 13h3"/>',
  plug:'<path d="M7 3.5v4M13 3.5v4M5.5 7.5h9v2A4.5 4.5 0 0 1 10 14v2.5"/><path d="M7.5 16.5h5"/>',
  alert:'<path d="M10 3.2 17 16H3L10 3.2Z"/><path d="M10 7.5v4M10 14h.01"/>'
};
const icon=(name,cls='')=>`<svg class="ui-icon ${cls}" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${ICONS[name]||ICONS.arrowRight}</svg>`;
let page=(location.hash.slice(1)||'home');
let active=localStorage.cz_active||'';
let companies=[],company=null,operating=null,health=null,launchingGoal='';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const compact=(s,n=92)=>{const x=String(s||'').replace(/\s+/g,' ').trim();return x.length>n?`${x.slice(0,n-1).trim()}…`:x};
const fmt=t=>t?new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const short=s=>s?String(s).slice(0,8):'—';
async function api(path,opt={}){const r=await fetch('/api/v1'+path,{headers:{'content-type':'application/json',...(opt.headers||{})},...opt,body:opt.body?JSON.stringify(opt.body):undefined});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||'Request failed');return x}
const rec=k=>company?.records?.filter(x=>x.kind===k)||[];
const currentRec=k=>{const sid=operating?.session?.id;return rec(k).filter(x=>!sid||!x.data?.sessionId||x.data.sessionId===sid)};
const latest=k=>rec(k).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
const mission=()=>rec('mission').find(x=>x.state==='active')||rec('mission')[0];
const production=()=>rec('organization_revision').find(x=>x.state==='production');
const goalText=()=>operating?.session?.data?.goal||mission()?.data?.goalContract?.desiredState||mission()?.data?.outcome||company?.data?.name||'Untitled work';
const sentence=s=>String(s||'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const humanError=e=>sentence(String(e?.message||e||'Request failed'));

function statusModel(){
  const verification=latest('outcome_verification');
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  const approval=currentRec('approval_request').find(x=>['pending','waiting'].includes(x.state));
  const jobs=rec('job');
  const job=jobs.find(x=>x.id===operating?.session?.data?.jobId)||jobs[0];
  if(verification?.data?.outcomeAchieved)return {key:'done',label:'Done',tone:'good',detail:'The result has been verified.'};
  if(approval||request)return {key:'needs',label:'Needs you',tone:'warn',detail:'One step needs your access or approval.'};
  if(['failed','blocked'].includes(job?.state))return {key:'needs',label:'Needs you',tone:'warn',detail:'Work is paused at a real boundary.'};
  return {key:'working',label:'Working',tone:'live',detail:'Company Zero is working on this now.'};
}

function userStage(){
  const stage=operating?.session?.data?.currentStage||'understanding_goal';
  const map={
    understanding_goal:['Getting clear on the job','I’m turning your request into something I can actually measure and act on.'],
    learning_world:['Checking what’s true','I’m gathering the facts I need before making a move.'],
    finding_paths:['Finding the best way in','I’m comparing practical ways to move this forward.'],
    choosing_strategy:['Choosing the first move','I’m narrowing this to the strongest route I can justify.'],
    building_company:['Getting the right help in place','I’m setting up only the functions this job needs.'],
    equipping:['Checking access','I’m making sure I can really do the next step, not just describe it.'],
    starting_operations:['Starting the work','The plan is moving into real execution.'],
    producing_progress:['Doing the work','I’m looking for useful results, not activity for activity’s sake.']
  };
  return map[stage]||['Working on it','I’m moving this forward.'];
}

function meaningfulUpdates(){
  const out=[];
  const external=currentRec('world_fact').filter(x=>x.data?.classification==='EXTERNAL_OBSERVATION');
  external.slice(-4).forEach(x=>out.push({kind:'found',title:x.data?.value?.title||x.data?.subject||'Found something useful',body:x.data?.externalRef||compact(typeof x.data?.value==='string'?x.data.value:JSON.stringify(x.data?.value||{}),120),time:x.created_at}));
  const strategy=currentRec('strategy_selection').find(x=>x.state==='selected')||rec('strategy_selection').find(x=>x.state==='selected');
  const option=rec('strategy_option').find(x=>x.id===strategy?.data?.strategyId);
  if(strategy)out.push({kind:'choice',title:'I picked a direction',body:option?.data?.expectedEffect||strategy.data?.rationale||strategy.data?.title,time:strategy.created_at});
  const org=production();
  if(org)out.push({kind:'team',title:'I set up the team for this',body:`${org.data?.roles?.length||0} focused function${(org.data?.roles?.length||0)===1?'':'s'} are ready for this job.`,time:org.created_at});
  const jobs=rec('job').filter(x=>['completed','running','claimed','queued'].includes(x.state));
  jobs.slice(-2).forEach(x=>out.push({kind:x.state==='completed'?'done':'doing',title:x.state==='completed'?'Finished a piece of work':'Work is underway',body:compact(x.data?.operation||x.data?.source||'A persisted task is moving through execution.'),time:x.created_at}));
  const verify=latest('outcome_verification');
  if(verify?.data?.results?.length)out.push({kind:'result',title:verify.data.outcomeAchieved?'The result is verified':'I measured the result',body:verify.data.results.map(r=>`${r.metricId||'Metric'}: ${r.before??'—'} → ${r.after??'—'}`).join(' · '),time:verify.created_at});
  return out.sort((a,b)=>String(b.time).localeCompare(String(a.time))).slice(0,7);
}

function needsYou(){
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  if(request)return {type:'access',title:'I need access for the next real step',body:compact(request.data?.message||request.data?.reason||request.data?.description||'The next action needs a connection I do not have yet.',170),id:request.id};
  const approval=currentRec('approval_request').find(x=>['pending','waiting'].includes(x.state));
  if(approval)return {type:'approval',title:'One move is waiting for your approval',body:compact(approval.data?.reason||'A sensitive action is ready, but has not happened yet.',170),id:approval.id};
  return null;
}

function resultRows(){
  const v=latest('outcome_verification');
  return (v?.data?.results||[]).map(r=>({name:sentence(r.metricId||r.metric||'Result'),before:r.before,after:r.after,target:r.target,passed:r.passed}));
}

function promptBox({large=false}={}){return `<form class="prompt-box ${large?'large':''}" id="goalForm"><textarea name="goal" ${large?'autofocus':''} required placeholder="What do you need done?"></textarea><div class="prompt-foot"><span>${large?'Describe the result. Company Zero handles the setup.':'Be specific or just talk normally.'}</span><button aria-label="Start">${icon('arrowUp')}</button></div></form>`}
function composer(){return `<div class="composer-wrap"><form class="composer" id="conversation"><textarea name="message" rows="1" placeholder="Tell Company Zero anything…"></textarea><button aria-label="Send">${icon('arrowUp')}</button></form></div>`}
function statusPill(s){return `<span class="status-pill ${s.tone}"><i></i>${esc(s.label)}</span>`}

function home(){
  if(!companies.length&&!company&&!launchingGoal)return `<div class="home-empty"><div class="hero-lockup"><img class="hero-organism" src="assets/brand/company-zero-mark.png" alt=""><div><span class="eyebrow">COMPANY ZERO</span><h1>What do you want done?</h1><p>Give me the outcome. I’ll work out the plan, do what I can, and show you what changed.</p></div></div>${promptBox({large:true})}<div class="starter-row">${['Find me 5 serious clients','Improve my website performance','Find sponsors for my event','Cut our cloud bill by 20%'].map(x=>`<button data-example="${esc(x)}">${esc(x)}<span>${icon('arrowRight')}</span></button>`).join('')}</div><div class="home-proof"><span>Works in the background</span><span>Stops before sensitive actions</span><span>Shows what actually changed</span></div></div>`;
  if(launchingGoal)return `<div class="launch-view"><div class="launch-organism"><img src="assets/brand/company-zero-mark.png" alt=""></div><span class="eyebrow">STARTING</span><h1>${esc(launchingGoal)}</h1><p>I’m getting the first useful version of this work moving now.</p></div>`;
  const s=statusModel(),need=needsYou(),updates=meaningfulUpdates(),rows=resultRows();
  const recent=companies.slice(0,5);
  return `<div class="dashboard"><section class="dash-hero"><div><span class="eyebrow">TODAY</span><h1>What should we get done?</h1><p>Start something new, or pick up where the work left off.</p></div>${promptBox({large:false})}</section>
  <section class="dash-section"><div class="section-head"><div><span class="eyebrow">ACTIVE WORK</span><h2>${esc(goalText())}</h2></div><button class="text-link" data-page="work">Open work ${icon('arrowRight')}</button></div><article class="active-card"><div class="active-top">${statusPill(s)}<span>${esc(userStage()[0])}</span></div><div class="active-body"><h3>${esc(userStage()[1])}</h3><div class="progress-line"><i></i></div><div class="active-meta"><span>${updates.length} useful update${updates.length===1?'':'s'}</span><span>${rows.length?`${rows.length} measured result${rows.length===1?'':'s'}`:'Waiting for a measured result'}</span></div></div>${need?`<div class="active-need"><span>Needs you</span><p>${esc(need.title)}</p><button data-page="work">Review ${icon('arrowRight')}</button></div>`:''}</article></section>
  <div class="dash-grid"><section class="dash-section"><div class="section-head"><div><span class="eyebrow">RECENT UPDATES</span><h2>What changed</h2></div></div><div class="update-list">${updates.length?updates.slice(0,4).map(updateRow).join(''):`<div class="soft-empty">Useful updates will show up here as the work produces them.</div>`}</div></section>
  <section class="dash-section"><div class="section-head"><div><span class="eyebrow">RECENT WORK</span><h2>Pick up anything</h2></div></div><div class="project-list">${recent.map(c=>`<button data-company="${c.id}"><span class="project-dot"></span><span><strong>${esc(c.data?.name||'Untitled work')}</strong><small>${esc(sentence(c.data?.status||'active'))}</small></span><span>${icon('arrowRight')}</span></button>`).join('')}</div></section></div></div>`;
}

function updateRow(u){const icons={found:'branch',choice:'sparkle',team:'people',doing:'refresh',done:'check',result:'chart'};return `<article class="update-row"><span class="update-icon ${u.kind}">${icon(icons[u.kind]||'sparkle')}</span><div><strong>${esc(u.title)}</strong><p>${esc(compact(u.body,140))}</p></div><time>${esc(fmt(u.time))}</time></article>`}

function work(){
  const s=statusModel(),need=needsYou(),updates=meaningfulUpdates(),stage=userStage(),rows=resultRows();
  const goal=goalText();
  return `<div class="work-page"><header class="work-head"><div class="work-title"><button class="back-home" data-page="home" aria-label="Back to home">${icon('arrowLeft')}</button><div><span class="eyebrow">WORK</span><h1>${esc(goal)}</h1></div></div><div>${statusPill(s)}</div></header>
  <div class="work-layout"><main class="work-main"><section class="now-card"><div class="now-organism"><img src="assets/brand/company-zero-mark-small.png" alt=""></div><div><span class="eyebrow">RIGHT NOW</span><h2>${esc(stage[0])}</h2><p>${esc(stage[1])}</p></div></section>
  ${need?needCard(need):''}
  <section class="stream"><div class="section-head"><div><span class="eyebrow">WORKING NOTES</span><h2>What’s happening</h2></div><span>${updates.length} updates</span></div>${updates.length?updates.map(updateRow).join(''):`<div class="soft-empty">I’m still getting the first useful update together.</div>`}</section>
  ${rows.length?`<section class="result-card"><div><span class="eyebrow">MEASURED RESULT</span><h2>${latest('outcome_verification')?.data?.outcomeAchieved?'The target is met':'Here’s what changed'}</h2></div><div class="result-grid">${rows.map(r=>`<div><span>${esc(r.name)}</span><strong>${esc(r.after??'—')}</strong><small>${r.before!==undefined?`${esc(r.before)} before`:''}${r.target!==undefined?` · target ${esc(r.target)}`:''}</small></div>`).join('')}</div><button class="text-link" data-page="results">See the proof ${icon('arrowRight')}</button></section>`:''}
  </main><aside class="work-side">${workSide()}</aside></div>${composer()}</div>`;
}

function needCard(n){if(n.type==='approval')return `<section class="need-card"><div class="need-mark">${icon('alert')}</div><div><span class="eyebrow">WAITING ON YOU</span><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p><div class="need-actions"><button class="secondary-btn" data-approval="${n.id}" data-decision="rejected">Not now</button><button class="primary-btn" data-approval="${n.id}" data-decision="approved">Approve</button></div></div></section>`;return `<section class="need-card"><div class="need-mark">${icon('alert')}</div><div><span class="eyebrow">WAITING ON YOU</span><h2>${esc(n.title)}</h2><p>${esc(n.body)}</p><button class="primary-btn" data-provider>Connect what’s needed</button></div></section>`}

function workSide(){
  const org=production(),roles=org?.data?.roles||[];
  const assumptions=currentRec('world_fact').filter(x=>x.data?.classification==='USER_CLAIM').slice(-3);
  return `<section class="side-card"><span class="eyebrow">THE PLAN</span><h3>What I’m trying to get right</h3><p>${esc(compact((currentRec('strategy_selection').find(x=>x.state==='selected')||{}).data?.rationale||'I’m working toward the result while keeping actions measurable and reversible where possible.',180))}</p></section>
  <section class="side-card"><span class="eyebrow">WHO’S WORKING ON IT</span><h3>${roles.length?`${roles.length} focused function${roles.length===1?'':'s'}`:'Setting up the right help'}</h3>${roles.length?`<div class="role-mini">${roles.slice(0,4).map(r=>`<span>${esc(r.name)}</span>`).join('')}</div>`:`<p>The setup will stay lean until the work actually needs more.</p>`}</section>
  <section class="side-card"><span class="eyebrow">ASSUMPTIONS</span>${assumptions.length?assumptions.map(a=>`<div class="assumption"><strong>${esc(compact(a.data?.subject||'Current assumption',55))}</strong><small>${esc(compact(a.data?.value?.text||a.data?.value||'From your context',90))}</small></div>`).join(''):`<p>I’ll make low-risk assumptions and surface them when they matter.</p>`}</section>`;
}

function results(){
  const rows=resultRows();
  const evidence=company?.records?.filter(x=>['external_observation','outcome_observation','outcome_verification','world_fact','promotion_decision'].includes(x.kind)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))||[];
  return `<div class="page-shell"><header class="page-head"><div><span class="eyebrow">RESULTS</span><h1>What actually changed</h1><p>Measured outcomes and the receipts behind them.</p></div></header>${rows.length?`<section class="results-hero">${rows.map(r=>`<article><span>${esc(r.name)}</span><div class="big-result"><strong>${esc(r.after??'—')}</strong>${r.before!==undefined?`<small>from ${esc(r.before)}</small>`:''}</div>${r.target!==undefined?`<p>Target ${esc(r.target)}</p>`:''}</article>`).join('')}</section>`:`<div class="large-empty"><h2>No measured result yet</h2><p>When Company Zero can verify a real-world change, it will land here first.</p></div>`}
  <section class="proof-section"><div class="section-head"><div><span class="eyebrow">PROOF</span><h2>Receipts</h2></div></div><div class="receipt-list">${evidence.length?evidence.slice(0,14).map(e=>`<article><span class="receipt-icon">${icon('receipt')}</span><div><strong>${esc(receiptTitle(e))}</strong><p>${esc(receiptBody(e))}</p></div><time>${esc(fmt(e.created_at))}</time></article>`).join(''):`<div class="soft-empty">No external receipt has been recorded yet.</div>`}</div></section></div>`;
}
function receiptTitle(e){if(e.kind==='outcome_verification')return 'Result verification';if(e.kind==='external_observation')return 'External observation';if(e.kind==='promotion_decision')return 'Approach changed';return sentence(e.kind)}
function receiptBody(e){return compact(e.data?.externalRef||e.data?.reason||e.data?.subject||e.data?.predicate||e.data?.classification||'Persisted evidence record',150)}

function connections(){
  const caps=rec('capability'),providers=rec('capability_provider');
  return `<div class="page-shell"><header class="page-head split"><div><span class="eyebrow">CONNECTIONS</span><h1>Let Company Zero work with your tools</h1><p>Only connect what a job actually needs. You stay in control of sensitive actions.</p></div><button class="primary-btn icon-btn-text" data-provider>${icon('plus')}<span>Add connection</span></button></header>
  <div class="connection-summary"><article><strong>${providers.length}</strong><span>Connected source${providers.length===1?'':'s'}</span></article><article><strong>${caps.length}</strong><span>Available action${caps.length===1?'':'s'}</span></article></div>
  <section class="connection-grid">${providers.length?providers.map(p=>`<article class="connection-card"><div class="connection-logo">${esc((p.data?.name||'C')[0].toUpperCase())}</div><div><strong>${esc(p.data?.name||'Connected tool')}</strong><p>${esc(sentence(p.data?.type||'connection'))}</p></div><span class="connected-chip">Connected</span></article>`).join(''):`<div class="large-empty span-all"><h2>No tools connected yet</h2><p>That’s fine. Start with the work. I’ll ask only when a real step needs access.</p><button class="secondary-btn" data-provider>Add a connection</button></div>`}</section></div>`;
}

function settings(){const approvals=rec('approval_request').filter(x=>['pending','waiting'].includes(x.state));return `<div class="page-shell"><header class="page-head"><div><span class="eyebrow">SETTINGS</span><h1>Preferences and control</h1><p>Pause work, review pending approvals, or open advanced runtime details.</p></div></header><section class="settings-card"><div><h2>Current work</h2><p>Control the active job without losing its history.</p></div><div class="button-row"><button class="secondary-btn" data-control="pause">Pause</button><button class="secondary-btn" data-control="resume">Resume</button><button class="danger-btn" data-control="terminate">Stop permanently</button></div></section><section class="settings-card"><div><h2>Pending approvals</h2><p>${approvals.length?`${approvals.length} action${approvals.length===1?'':'s'} need your decision.`:'Nothing is waiting on you right now.'}</p></div>${approvals.length?`<div class="approval-stack">${approvals.map(a=>`<article><div><strong>${esc(a.data?.reason||'Sensitive action')}</strong><p>${esc(compact(a.data?.risk||'',100))}</p></div><div><button class="secondary-btn" data-approval="${a.id}" data-decision="rejected">Reject</button><button class="primary-btn" data-approval="${a.id}" data-decision="approved">Approve</button></div></article>`).join('')}</div>`:''}</section><section class="settings-card clickable" data-page="advanced"><div><h2>Advanced</h2><p>Runtime health, capabilities, IDs and developer diagnostics.</p></div><span>${icon('arrowRight')}</span></section></div>`}

function advanced(){const caps=rec('capability'),providers=rec('capability_provider'),jobs=rec('job').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));return `<div class="page-shell"><header class="page-head split"><div><span class="eyebrow">ADVANCED</span><h1>Runtime details</h1><p>For debugging and inspection. Normal product use should not require this screen.</p></div><button class="secondary-btn icon-btn-text" data-page="settings">${icon('arrowLeft')}<span>Settings</span></button></header><div class="advanced-metrics"><article><span>Storage</span><strong>${esc(health?.storage||'—')}</strong></article><article><span>Providers</span><strong>${providers.length}</strong></article><article><span>Capabilities</span><strong>${caps.length}</strong></article><article><span>Jobs</span><strong>${jobs.length}</strong></article></div><section class="raw-card"><div class="section-head"><div><span class="eyebrow">JOBS</span><h2>Recent runtime work</h2></div></div>${jobs.length?jobs.slice(0,12).map(j=>`<div class="raw-row"><span class="mono">${short(j.id)}</span><strong>${esc(sentence(j.state))}</strong><span>${esc(compact(j.data?.operation||j.data?.source||'runtime task',90))}</span><time>${esc(fmt(j.created_at))}</time></div>`).join(''):`<div class="soft-empty">No jobs yet.</div>`}</section></div>`}

const views={home,work,results,connections,settings,advanced};

function nav(){
  $('#nav').innerHTML=NAV.map(([id,label,ic])=>`<button class="${page===id?'active':''}" data-page="${id}"><span class="nav-icon">${icon(ic)}</span><b>${label}</b>${id==='work'&&company?`<i class="nav-status ${statusModel().tone}"></i>`:''}</button>`).join('');
  $('#recentList').innerHTML=companies.slice(0,4).map(c=>`<button class="${c.id===active?'active':''}" data-company="${c.id}"><span class="recent-dot"></span><span>${esc(compact(c.data?.name||'Untitled work',28))}</span></button>`).join('')||'<span class="recent-empty">No recent work</span>';
}
function render(){
  nav();
  const labels={home:'Home',work:'Work',results:'Results',connections:'Connections',settings:'Settings',advanced:'Advanced'};
  $('#topTitle').textContent=labels[page]||'Home';
  $('#view').innerHTML=views[page]?.()||home();
  bind();
}

function bind(){
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;location.hash=page;$('#sidebar').classList.remove('open');render()});
  document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{const ta=$('#goalForm textarea');if(ta){ta.value=b.dataset.example;ta.focus()}});
  document.querySelectorAll('[data-company]').forEach(b=>b.onclick=async()=>{active=b.dataset.company;localStorage.cz_active=active;await hydrateActive();page='work';location.hash=page;render()});
  const gf=$('#goalForm');if(gf)gf.onsubmit=e=>{e.preventDefault();const goal=String(new FormData(e.target).get('goal')||'').trim();if(!goal)return;launchingGoal=goal;render();act(async()=>{operating=await api('/outcomes',{method:'POST',body:{goal}});company=operating.company;active=company.id;localStorage.cz_active=active;launchingGoal='';page='work';location.hash=page},'Work started')};
  const cf=$('#conversation');if(cf)cf.onsubmit=e=>{e.preventDefault();const message=String(new FormData(e.target).get('message')||'').trim();if(!message||!operating)return;act(async()=>{await api(`/companies/${active}/sessions/${operating.session.id}/messages`,{method:'POST',body:{message}});e.target.reset()},'Updated')};
  document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>openProvider());
  document.querySelectorAll('[data-control]').forEach(b=>b.onclick=()=>act(()=>api(`/companies/${active}/controls`,{method:'POST',body:{action:b.dataset.control}}),'Updated'));
  document.querySelectorAll('[data-approval]').forEach(b=>b.onclick=()=>act(()=>api(`/companies/${active}/approvals/${b.dataset.approval}/decision`,{method:'POST',body:{decision:b.dataset.decision}}),'Decision saved'));
}

function openProvider(){const manifest=JSON.stringify({capabilities:[{name:'observe_state',description:'Describe what this connection can observe or change',endpoint:'/observe',method:'POST',risk:'read',operationKind:'observe',observes:['state'],changes:[],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'}}]},null,2);$('#modal').innerHTML=`<div class="modal-head"><div><span class="eyebrow">ADD CONNECTION</span><h2>Connect a tool or API</h2><p>Company Zero will only use what you explicitly connect.</p></div><button type="button" id="modalClose" aria-label="Close">${icon('close')}</button></div><div class="modal-body"><label><span>Name</span><input name="name" required autofocus placeholder="Support inbox"></label><label><span>Base URL</span><input name="url" type="url" required placeholder="https://api.example.com"></label><details><summary>Advanced capability details</summary><label><span>Manifest</span><textarea name="manifest" class="code-input">${esc(manifest)}</textarea></label></details></div><div class="modal-foot"><button type="button" class="secondary-btn" id="modalCancel">Cancel</button><button class="primary-btn">Connect</button></div>`;$('#modalWrap').hidden=false;$('#modalClose').onclick=closeModal;$('#modalCancel').onclick=closeModal;$('#modal').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);let parsed;try{parsed=JSON.parse(f.get('manifest'))}catch{return toast('Capability details must be valid JSON',true)}act(async()=>{await api(`/companies/${active}/providers`,{method:'POST',body:{name:f.get('name'),type:'http',baseUrl:f.get('url'),manifest:parsed}});if(operating)operating=await api(`/companies/${active}/sessions/${operating.session.id}/advance`,{method:'POST'});closeModal()},'Connection added')}}
function closeModal(){$('#modalWrap').hidden=true}
function toast(message,bad=false){const t=$('#toast');t.textContent=message;t.className=`toast ${bad?'bad':''}`;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
async function act(fn,message){if(!$('#busy').hidden)return;$('#busy').hidden=false;try{await fn();await refresh(false);toast(message)}catch(e){launchingGoal='';toast(humanError(e),true)}finally{$('#busy').hidden=true;render()}}
async function refresh(renderAfter=true){const all=await api('/companies');companies=all.items||[];if(active){await hydrateActive()}if(renderAfter)render()}
async function hydrateActive(){if(!active){company=null;operating=null;return}company=await api(`/companies/${active}`);const s=rec('operating_session').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];operating=s?await api(`/companies/${active}/sessions/${s.id}`):null}

$('#newWork').onclick=()=>{page='home';location.hash='home';company=null;operating=null;active='';localStorage.removeItem('cz_active');render();setTimeout(()=>$('#goalForm textarea')?.focus(),20)};
$('#showAllWork').onclick=()=>{page='home';location.hash='home';render()};
$('#refresh').onclick=()=>refresh();
$('#menuBtn').onclick=()=>$('#sidebar').classList.add('open');
$('#sideClose').onclick=()=>$('#sidebar').classList.remove('open');
window.addEventListener('hashchange',()=>{page=location.hash.slice(1)||'home';render()});

async function load(){
  const started=performance.now();render();
  const boot=$('#bootScreen'),status=$('#bootStatus');
  const [h,c]=await Promise.allSettled([fetch('/api/health',{cache:'no-store'}).then(r=>r.json()),api('/companies')]);
  if(h.status==='fulfilled'){health=h.value;$('#runtimeDot').classList.toggle('live',Boolean(health.ok));$('#runtimeTitle').textContent=health.ok?'Online':'Unavailable';$('#runtimeSub').textContent=health.tensormuxConfigured?'AI + runtime ready':'Runtime ready'}
  if(c.status==='fulfilled'){companies=c.value.items||[];if(active&&!companies.some(x=>x.id===active)){active='';localStorage.removeItem('cz_active')}}
  if(active){if(status)status.textContent='Picking up your latest work';try{await hydrateActive()}catch(e){toast(humanError(e),true)}}
  render();
  const wait=Math.max(0,520-(performance.now()-started));setTimeout(()=>{boot?.classList.add('hide');setTimeout(()=>boot?.remove(),240)},wait);
}
load();
