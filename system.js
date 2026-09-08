const NAV=[['home','Home','home'],['work','Work','briefcase'],['results','Results','chart'],['connections','Connections','link']];
const ICONS={
  // Core navigation icons are sourced from coolicons (24×24, 2px stroke).
  home:'<path d="M20 17.0002V11.4522C20 10.9179 19.9995 10.6506 19.9346 10.4019C19.877 10.1816 19.7825 9.97307 19.6546 9.78464C19.5102 9.57201 19.3096 9.39569 18.9074 9.04383L14.1074 4.84383C13.3608 4.19054 12.9875 3.86406 12.5674 3.73982C12.1972 3.63035 11.8026 3.63035 11.4324 3.73982C11.0126 3.86397 10.6398 4.19014 9.89436 4.84244L5.09277 9.04383C4.69064 9.39569 4.49004 9.57201 4.3457 9.78464C4.21779 9.97307 4.12255 10.1816 4.06497 10.4019C4 10.6506 4 10.9179 4 11.4522V17.0002C4 17.932 4 18.3978 4.15224 18.7654C4.35523 19.2554 4.74432 19.6452 5.23438 19.8482C5.60192 20.0005 6.06786 20.0005 6.99974 20.0005C7.93163 20.0005 8.39808 20.0005 8.76562 19.8482C9.25568 19.6452 9.64467 19.2555 9.84766 18.7654C9.9999 18.3979 10 17.932 10 17.0001V16.0001C10 14.8955 10.8954 14.0001 12 14.0001C13.1046 14.0001 14 14.8955 14 16.0001V17.0001C14 17.932 14 18.3979 14.1522 18.7654C14.3552 19.2555 14.7443 19.6452 15.2344 19.8482C15.6019 20.0005 16.0679 20.0005 16.9997 20.0005C17.9316 20.0005 18.3981 20.0005 18.7656 19.8482C19.2557 19.6452 19.6447 19.2554 19.8477 18.7654C19.9999 18.3978 20 17.932 20 17.0002Z"/>',
  briefcase:'<path d="M8 8H6.2002C5.08009 8 4.51962 8 4.0918 8.21799C3.71547 8.40973 3.40973 8.71547 3.21799 9.0918C3 9.51962 3 10.0801 3 11.2002V16.8002C3 17.9203 3 18.4801 3.21799 18.9079C3.40973 19.2842 3.71547 19.5905 4.0918 19.7822C4.5192 20 5.07899 20 6.19691 20H17.8031C18.921 20 19.48 20 19.9074 19.7822C20.2837 19.5905 20.5905 19.2842 20.7822 18.9079C21 18.4805 21 17.9215 21 16.8036V11.1969C21 10.079 21 9.5192 20.7822 9.0918C20.5905 8.71547 20.2837 8.40973 19.9074 8.21799C19.4796 8 18.9203 8 17.8002 8H16M8 8H16M8 8C8 5.79086 9.79086 4 12 4C14.2091 4 16 5.79086 16 8"/>',
  chart:'<path d="M9 11V20M9 11H4.59961C4.03956 11 3.75981 11 3.5459 11.109C3.35774 11.2049 3.20487 11.3577 3.10899 11.5459C3 11.7598 3 12.04 3 12.6001V20H9M9 11V5.6001C9 5.04004 9 4.75981 9.10899 4.5459C9.20487 4.35774 9.35774 4.20487 9.5459 4.10899C9.75981 4 10.0396 4 10.5996 4H13.3996C13.9597 4 14.2403 4 14.4542 4.10899C14.6423 4.20487 14.7948 4.35774 14.8906 4.5459C14.9996 4.75981 15 5.04005 15 5.6001V8M9 20H15M15 20L21 20.0001V9.6001C21 9.04005 20.9996 8.75981 20.8906 8.5459C20.7948 8.35774 20.6429 8.20487 20.4548 8.10899C20.2409 8 19.9601 8 19.4 8H15M15 20V8"/>',
  link:'<path d="M9.1718 14.8288L14.8287 9.17192M7.05086 11.293L5.63664 12.7072C4.07455 14.2693 4.07409 16.8022 5.63619 18.3643C7.19829 19.9264 9.7317 19.9259 11.2938 18.3638L12.7065 16.9498M11.2929 7.05L12.7071 5.63579C14.2692 4.07369 16.8016 4.07397 18.3637 5.63607C19.9258 7.19816 19.9257 9.73085 18.3636 11.2929L16.9501 12.7071"/>',
  settings:'<circle cx="12" cy="12" r="4"/><path d="M20.35 8.92c1.05.58 1.58.88 1.55 3.08-.03 2.2-.55 2.48-1.55 3.04-.76.42-1.27 1.15-1.51 1.96-.22.76-.09 1.55-.01 2.31.07.66-.19 1.06-.74 1.38l-1.34.78c-.54.31-1.03.31-1.59-.02l-1.99-1.2a2.01 2.01 0 0 0-2.08 0l-2 1.2c-.56.33-1.05.33-1.59.02l-1.34-.78c-.55-.32-.81-.72-.74-1.38.08-.76.21-1.55-.01-2.31-.24-.81-.75-1.54-1.51-1.96-1-.56-1.52-.84-1.55-3.04-.03-2.2.5-2.5 1.55-3.08.76-.42 1.27-1.15 1.51-1.96.22-.76.09-1.55.01-2.31-.07-.66.19-1.06.74-1.38l1.34-.78c.54-.31 1.03-.31 1.59.02l1.99 1.2c.64.39 1.44.39 2.08 0l1.99-1.2c.56-.33 1.05-.33 1.59-.02l1.34.78c.55.32.81.72.74 1.38-.08.76-.21 1.55.01 2.31.24.81.75 1.54 1.51 1.96Z"/>',
  plus:'<path d="M6 12H12M12 12H18M12 12V18M12 12V6"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  arrowUp:'<path d="M12 20V5M6.5 10.5 12 5l5.5 5.5"/>',
  arrowRight:'<path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5"/>',
  arrowLeft:'<path d="M20 12H5M10.5 6.5 5 12l5.5 5.5"/>',
  check:'<path d="m5 12.5 4 4L19 6.5"/>',
  branch:'<path d="M6 4v10a4 4 0 0 0 4 4h8M6 8h7a4 4 0 0 0 4-4"/><circle cx="6" cy="4" r="1.5"/><circle cx="18" cy="4" r="1.5"/><circle cx="18" cy="18" r="1.5"/>',
  sparkle:'<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M4 20c.7-3.5 2.4-5.2 5-5.2s4.3 1.7 5 5.2"/><circle cx="17" cy="9" r="2.3"/><path d="M15.2 14.3c2.8-.3 4.5 1.5 4.8 4.7"/>',
  refresh:'<path d="M19 7a8 8 0 1 0 1 8"/><path d="M19 3v4h-4"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  plug:'<path d="M8 3v5M16 3v5M6 8h12v2a6 6 0 0 1-6 6v5"/>',
  alert:'<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v4M12 17h.01"/>'
};
const icon=(name,cls='')=>`<svg class="ui-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" xmlns="http://www.w3.org/2000/svg">${ICONS[name]||ICONS.arrowRight}</svg>`;
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
