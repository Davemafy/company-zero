const NAV=[['outcome','Outcome'],['company','Company'],['evidence','Evidence'],['controls','Controls'],['developer','Runtime']];
const STAGES=[['understanding_goal','Defining the target'],['learning_world','Checking your current setup'],['finding_paths','Finding viable moves'],['choosing_strategy','Selecting the best move'],['building_company','Preparing the operator'],['equipping','Checking access'],['starting_operations','Starting the work'],['producing_progress','Measuring the result']];
let page=location.hash.slice(1)||'outcome',active=localStorage.cz_active||'',company=null,companies=[],operating=null,health=null,launchingGoal='';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>s?String(s).slice(0,8):'—',fmt=t=>t?new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—',money=v=>`$${Number(v||0).toFixed(Number(v||0)<10?3:2)}`;
async function api(path,opt={}){const r=await fetch('/api/v1'+path,{headers:{'content-type':'application/json',...(opt.headers||{})},...opt,body:opt.body?JSON.stringify(opt.body):undefined});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||'Request failed');return x}
const humanError=e=>String(e?.message||e||'Request failed').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const rec=k=>company?.records?.filter(x=>x.kind===k)||[],latest=k=>rec(k).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0],mission=()=>rec('mission').find(x=>x.state==='active')||rec('mission')[0],production=()=>rec('organization_revision').find(x=>x.state==='production');
const pill=(s,t='neutral')=>`<span class="pill ${t}">${esc(String(s||'unknown').replaceAll('_',' '))}</span>`;
const empty=(title,text,action='')=>`<div class="empty"><div class="empty-mark">✦</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
const icon=n=>({outcome:'◉',company:'⌘',work:'▣',evolution:'↗',evidence:'≣',economics:'◎',controls:'⌁',memory:'▤',developer:'◇'}[n]||'·');
const sessionId=()=>operating?.session?.id;
const currentRec=k=>rec(k).filter(x=>!sessionId()||!x.data?.sessionId||x.data.sessionId===sessionId());
const simpleValue=v=>{if(v==null)return '—';if(typeof v==='number'||typeof v==='boolean')return String(v);if(typeof v==='string')return v.length>120?`${v.slice(0,117)}…`:v;if(Array.isArray(v))return `${v.length} item${v.length===1?'':'s'}`;if(typeof v==='object')return v.title||v.name||v.text||`${Object.keys(v).length} fields`;return String(v)};
const sentence=s=>String(s||'').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const compactText=(s,n=72)=>{const x=String(s||'').replace(/\s+/g,' ').trim();return x.length>n?`${x.slice(0,n-1).trim()}…`:x};
const visibleArtifactStage=id=>!['understanding_goal','equipping','building_company'].includes(String(id||''));
const humanStatus=({achieved,verification,request,approvals,job,strategy})=>{if(achieved)return{key:'achieved',eyebrow:'VERIFIED RESULT',title:'Target achieved',detail:'Company Zero has a grounded after-observation for the mission target.'};if(verification?.data?.results?.some(x=>x.after!==undefined))return{key:'measured',eyebrow:'MEASURED RESULT',title:'Result measured',detail:'A grounded after-observation is available, but the target has not been verified as achieved.'};if(request)return{key:'needs-access',eyebrow:'NEEDS ACCESS',title:"I found a direction, but I can’t execute it yet.",detail:'A real capability is still required before Company Zero can honestly act and verify the outcome.'};if(approvals.length)return{key:'approval',eyebrow:'READY FOR APPROVAL',title:'The next move is waiting for you.',detail:'Sensitive work is paused before the side effect.'};if(['running','claimed','queued'].includes(job?.state))return{key:'executing',eyebrow:'IN PROGRESS',title:'Executing the approved plan',detail:'The runtime is carrying out persisted work and will measure the result afterward.'};if(strategy)return{key:'move-ready',eyebrow:'BEST MOVE SELECTED',title:strategy.data.title,detail:'Company Zero has selected the strongest current path from the evidence, capabilities, risk and measurability available.'};return{key:'investigating',eyebrow:'INVESTIGATING',title:'Checking what can actually move this outcome',detail:'Company Zero is grounding the mission before it claims a result.'}};

function organism(mode='exploring',label=''){
  return `<div class="cz-organism ${esc(mode)}" aria-hidden="true"><span class="organism-core"></span><span class="organism-lobe lobe-a"></span><span class="organism-lobe lobe-b"></span><span class="organism-lobe lobe-c"></span><span class="organism-thread thread-a"></span><span class="organism-thread thread-b"></span>${label?`<span class="organism-label">${esc(label)}</span>`:''}</div>`
}
function runtimeNarrative(){
  const stage=operating?.session?.data?.currentStage||'understanding_goal';
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  const approval=currentRec('approval_request').find(x=>['pending','waiting'].includes(x.state));
  const verification=latest('outcome_verification');
  const strategy=currentRec('strategy_selection').find(x=>x.state==='selected')||rec('strategy_selection').find(x=>x.state==='selected');
  const option=rec('strategy_option').find(x=>x.id===strategy?.data?.strategyId);
  if(verification?.data?.outcomeAchieved)return{mode:'settled',title:'The result is verified.',detail:'The evidence now supports the outcome target.',phase:'Result verified'};
  if(approval)return{mode:'waiting',title:'The next move is ready. You decide if it crosses the line.',detail:approval.data?.reason||'A sensitive side effect is waiting for approval.',phase:'Waiting for you'};
  if(request)return{mode:'waiting',title:'I can keep preparing this, but the next real-world move needs access.',detail:request.data?.reason||request.data?.description||'A required capability is not connected yet.',phase:'Access boundary'};
  if(stage==='learning_world')return{mode:'exploring',title:'I’m finding out what is actually true around this outcome.',detail:'Useful facts will appear here as they become grounded.',phase:'Learning the world'};
  if(stage==='finding_paths')return{mode:'exploring',title:'I’m narrowing this down to moves that could actually work.',detail:'Weak paths disappear; stronger ones stay visible.',phase:'Finding viable moves'};
  if(stage==='choosing_strategy')return{mode:'focusing',title:option?.data?.title?`I’m pressure-testing “${option.data.title}”.`:'I’m choosing the move with the best evidence-to-risk tradeoff.',detail:'The selected path has to survive measurability, authority and cost checks.',phase:'Choosing a move'};
  if(stage==='building_company')return{mode:'forming',title:'I’m assembling only the functions this outcome needs.',detail:'The organization is a consequence of the work, not a template.',phase:'Company forming'};
  if(stage==='equipping')return{mode:'focusing',title:'I’m checking whether the company can really do what it just planned.',detail:'Declared capability is not enough; usable access has to exist.',phase:'Checking access'};
  if(stage==='starting_operations')return{mode:'acting',title:'The company is moving from plan to operation.',detail:'Persisted work is being handed to the runtime.',phase:'Starting operations'};
  if(stage==='producing_progress')return{mode:'acting',title:'The work is running. I’m watching for evidence, not activity.',detail:'The next thing that appears here should be a useful artifact or measured change.',phase:'Operating'};
  return{mode:'exploring',title:'I’m turning your outcome into something measurable.',detail:'The target comes first; everything else has to serve it.',phase:'Understanding the outcome'};
}
function compactProgress(){
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  const approval=currentRec('approval_request').find(x=>['pending','waiting'].includes(x.state));
  const verification=latest('outcome_verification');
  const job=rec('job').find(x=>['running','claimed','queued'].includes(x.state));
  const ready=Boolean(verification?.data?.outcomeAchieved);
  const needs=Boolean(request||approval);
  const label=ready?'Ready':needs?'Needs you':job?'Working':'Working';
  const cls=ready?'ready':needs?'needs':'working';
  return `<div class="run-state ${cls}"><i></i><span>${label}</span></div>`;
}
function workEvents(){
  const out=[];
  const artifacts=operating?.artifacts||[];
  for(const a of artifacts){
    if(!visibleArtifactStage(a.data?.stage))continue;
    for(const item of (a.data?.items||[])){
      const title=item.label||item.title||item.type||a.data?.title;
      const detail=item.detail||'';
      if(!title)continue;
      if(/constraints? parsed|unresolved unknowns?|goal contract/i.test(String(title)))continue;
      out.push({kind:a.data?.stage||'runtime',title,detail,time:a.created_at,state:a.state,claim:item.claimType||'RUNTIME_STATE',refs:item.sourceRefs||[],before:item.before,after:item.after,target:item.target});
    }
  }
  const strategy=currentRec('strategy_selection').find(x=>x.state==='selected')||rec('strategy_selection').find(x=>x.state==='selected');
  const option=rec('strategy_option').find(x=>x.id===strategy?.data?.strategyId);
  if(option)out.push({kind:'decision',title:'I picked a direction',detail:option.data?.title||option.data?.summary||'A strategy was selected from the current evidence.',time:strategy?.created_at,state:'completed'});
  const org=production();
  if(org)out.push({kind:'organization',title:'Company assembled',detail:`${(org.data?.roles||[]).length} function${(org.data?.roles||[]).length===1?'':'s'} · revision ${org.data?.revision||'—'}`,time:org.created_at,state:'completed'});
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  if(request)out.push({kind:'boundary',title:'A real-world boundary appeared',detail:request.data?.reason||request.data?.description||'The next operation requires a capability that is not connected.',time:request.created_at,state:'blocked',id:request.id});
  const approvals=currentRec('approval_request').filter(x=>['pending','waiting'].includes(x.state));
  approvals.forEach(a=>out.push({kind:'approval',title:'Your approval is needed for the next move',detail:a.data?.reason||a.data?.risk||'Sensitive side effect',time:a.created_at,state:'waiting',id:a.id}));
  const verification=latest('outcome_verification');
  if(verification){
    const first=verification.data?.results?.[0];
    out.push({kind:'result',title:verification.data?.outcomeAchieved?'The outcome is verified':'A result was measured',detail:first?.after!==undefined?`${first.before??'—'} → ${first.after} · target ${first.target??'—'}`:'A persisted verification record is available.',time:verification.created_at,state:verification.data?.outcomeAchieved?'completed':'measured'});
  }
  const promotions=rec('promotion_decision').filter(x=>x.state==='promoted'||x.data?.decision==='promote'||x.data?.winnerRevisionId);
  promotions.forEach(p=>out.push({kind:'evolution',title:'I changed the company',detail:p.data?.reason||'A better-performing organization was promoted from measured evidence.',time:p.created_at,state:'completed'}));
  return out.sort((a,b)=>String(a.time||'').localeCompare(String(b.time||''))).slice(-18);
}
function eventCard(e,i){
  const iconMap={decision:'↳',organization:'⌘',boundary:'×',approval:'↗',result:'✓',evolution:'↻',learning_world:'⌁',finding_paths:'⌕',choosing_strategy:'↳',building_company:'⌘',equipping:'◇',starting_operations:'→',producing_progress:'+'};
  const metric=e.before!==undefined||e.after!==undefined?`<div class="event-metric"><span>${esc(e.before??'—')}</span><i>→</i><strong>${esc(e.after??'—')}</strong>${e.target!==undefined?`<small>target ${esc(e.target)}</small>`:''}</div>`:'';
  const approval=e.kind==='approval'?`<div class="event-actions"><button class="secondary-btn" data-approval="${e.id}" data-decision="rejected">Reject</button><button class="primary-btn" data-approval="${e.id}" data-decision="approved">Approve</button></div>`:'';
  const connect=e.kind==='boundary'?`<button class="quiet-action" data-page="developer">Connect what’s missing →</button>`:'';
  return `<article class="work-event ${esc(e.kind)} ${e.state==='blocked'?'blocked':''}" style="--event-index:${i}"><div class="event-glyph">${iconMap[e.kind]||'·'}</div><div class="event-body"><div class="event-meta"><span>${esc(sentence(e.kind))}</span>${e.time?`<time>${esc(fmt(e.time))}</time>`:''}</div><h3>${esc(e.title)}</h3>${e.detail?`<p>${esc(e.detail)}</p>`:''}${metric}${approval}${connect}</div></article>`
}


function persistedDeliverables(){
  const items=[];
  const seen=new Set();
  const push=(x)=>{const key=`${x.title}|${x.state}|${x.kind}`;if(!x.title||seen.has(key))return;seen.add(key);items.push(x)};
  for(const a of (operating?.artifacts||[])){
    for(const item of (a.data?.items||[])){
      const title=item.deliverable||item.label||item.title||item.type;
      if(!title)continue;
      const refs=item.sourceRefs||[];
      push({title,detail:item.detail||'',kind:item.deliverableType||a.data?.stage||'artifact',state:a.state||'persisted',refs,before:item.before,after:item.after,target:item.target,time:a.created_at});
    }
  }
  for(const r of rec('operation_plan')){
    const ops=r.data?.operations||r.data?.steps||[];
    for(const op of ops){
      push({title:op.title||op.label||op.operation||op.capabilityId||'Planned operation',detail:op.reason||op.description||'',kind:'operation',state:r.state||'planned',refs:[r.id],time:r.created_at});
    }
  }
  for(const r of rec('invocation')){
    push({title:r.data?.operation||r.data?.capabilityName||r.data?.capabilityId||'External operation',detail:r.data?.summary||r.data?.resultSummary||'',kind:'action',state:r.state||r.data?.state||'executed',refs:[r.id,r.data?.externalId].filter(Boolean),time:r.created_at});
  }
  for(const r of rec('external_observation')){
    push({title:r.data?.title||r.data?.subject||'External observation',detail:r.data?.summary||r.data?.externalRef||simpleValue(r.data?.value),kind:'evidence',state:r.state||'observed',refs:[r.id,r.data?.externalRef].filter(Boolean),time:r.created_at});
  }
  return items.sort((a,b)=>String(a.time||'').localeCompare(String(b.time||''))).slice(-12);
}
function deliverablesPanel(){
  const items=persistedDeliverables();
  if(!items.length)return '';
  const stateLabel=s=>sentence(String(s||'persisted'));
  return `<section class="deliverables-panel"><div class="deliverables-head"><div><small>DELIVERABLES</small><h2>Useful things this run has produced or moved</h2></div><span>${items.length} persisted</span></div><div class="deliverables-grid">${items.map((d,i)=>`<article class="deliverable-card ${esc(d.kind)}"><div class="deliverable-top"><span>${String(i+1).padStart(2,'0')}</span><small>${esc(stateLabel(d.state))}</small></div><h3>${esc(d.title)}</h3>${d.detail?`<p>${esc(d.detail)}</p>`:''}${d.before!==undefined||d.after!==undefined?`<div class="deliverable-metric"><span>${esc(d.before??'—')}</span><i>→</i><b>${esc(d.after??'—')}</b>${d.target!==undefined?`<small>target ${esc(d.target)}</small>`:''}</div>`:''}<footer><span>${esc(sentence(d.kind))}</span><span>${d.refs?.length||0} receipt${d.refs?.length===1?'':'s'}</span></footer></article>`).join('')}</div></section>`;
}
function evidenceReceipts(){
  const records=company?.records||[];
  const kinds=['invocation','external_observation','outcome_observation','outcome_verification','promotion_decision','governor_decision'];
  const rows=records.filter(r=>kinds.includes(r.kind)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,6);
  if(!rows.length)return '';
  return `<section class="receipt-strip"><div class="receipt-head"><div><small>RECEIPTS</small><h2>Why you should believe the run</h2></div><button class="quiet-action" data-page="evidence">Open evidence →</button></div><div class="receipt-row">${rows.map(r=>`<button class="receipt-chip" data-page="evidence"><span>${esc(sentence(r.kind))}</span><b>${short(r.id)}</b><small>${esc(sentence(r.state||'persisted'))}</small></button>`).join('')}</div></section>`;
}
function evolutionHero(){
  const promotions=rec('promotion_decision').filter(x=>x.state==='promoted'||x.data?.decision==='promote'||x.data?.winnerRevisionId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const gov=rec('governor_decision').filter(x=>['restructure','promote','rollback','replan'].includes(String(x.data?.action||'').toLowerCase())).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const decision=promotions[0]||gov[0];
  if(!decision)return '';
  const org=production();
  const reason=decision.data?.reason||decision.data?.rationale||'Measured evidence justified a different organization.';
  return `<section class="evolution-hero"><div class="evolution-mark">↻</div><div class="evolution-copy"><small>ORGANIZATIONAL EVOLUTION</small><h2>I changed the company.</h2><p>${esc(reason)}</p><div class="evolution-line"><span>Previous approach</span><i>→</i><strong>Revision ${esc(org?.data?.revision||decision.data?.winnerRevision||'new')}</strong></div></div><button class="secondary-btn" data-page="evolution">See why →</button></section>`;
}

function welcome(){return `<section class="cz-home"><div class="cz-home-mark">0</div><div class="cz-home-copy"><small>COMPANY ZERO</small><h1>What do you want to happen?</h1><p>State the outcome. Company Zero figures out the work, builds what it needs, and comes back with evidence.</p></div><form id="goalForm" class="cz-home-composer"><textarea name="goal" required autofocus placeholder="Get me 5 serious clients."></textarea><div class="cz-home-composer-foot"><span>Outcome first. Configuration later.</span><button class="cz-send" aria-label="Start outcome">↑</button></div></form><div class="cz-examples">${['Find sponsors for my event','Cut our cloud bill by 20%','Get me 5 serious clients','Reduce support response time below 5 minutes'].map(x=>`<button data-example="${esc(x)}">${esc(x)}</button>`).join('')}</div><footer class="cz-home-foot"><span>0 absorbs the setup.</span><span>You step in only when a real decision needs you.</span></footer></section>`}
function stageRail(){const artifacts=operating?.artifacts||[],current=operating?.session?.data?.currentStage;return `<aside class="stage-rail"><div class="stage-intent"><small>YOUR OUTCOME</small><strong>${esc(operating?.session?.data?.goal||mission()?.data?.outcome)}</strong></div><div class="stage-list">${STAGES.map(([id,label],i)=>{const found=artifacts.find(x=>x.data.stage===id),done=found?.state==='completed',activeStage=id===current;return `<div class="stage-step ${done?'done':''} ${activeStage?'current':''} ${found&&!done?'provisional':''}"><span>${done?'✓':found?'!':i+1}</span><div><strong>${label}</strong><small>${found?`${sentence(found.state)} · ${found.data.items?.length||0} persisted item${found.data.items?.length===1?'':'s'}`:activeStage?'In progress':'Waiting'}</small></div></div>`}).join('')}</div><button class="inspect-link" data-page="developer">Technical details <span>→</span></button></aside>`}

function artifactsView(){const artifacts=operating?.artifacts||[];return `<details class="technical-disclosure"><summary><span><b>Technical evidence & runtime trace</b><small>${artifacts.length} persisted stage record${artifacts.length===1?'':'s'} · open for provenance and control-plane detail</small></span><i>＋</i></summary><div class="artifact-stream">${artifacts.map(a=>`<section class="artifact-card ${a.state==='blocked'?'blocked':''}"><div class="artifact-head"><div><small>${esc(STAGES.find(x=>x[0]===a.data.stage)?.[1]||a.data.stage)}</small><h2>${esc(a.data.title)}</h2></div>${pill(a.state,a.state==='completed'?'good':a.state==='blocked'?'warn':'neutral')}</div><div class="artifact-items">${(a.data.items||[]).map((item,i)=>`<article><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(item.label||item.title||item.type)}</strong>${item.detail?`<p>${esc(item.detail)}</p>`:''}${item.before!==undefined||item.after!==undefined?`<p class="metric-change">${esc(item.before??'—')} → ${esc(item.after??'—')} · target ${esc(item.target??'—')}</p>`:''}<details class="provenance-details"><summary>Provenance</summary><p class="provenance">${esc(item.claimType||'RUNTIME_STATE')} · ${(item.sourceRefs||[]).length} persisted source${(item.sourceRefs||[]).length===1?'':'s'}</p></details></div></article>`).join('')||'<p class="muted">No fabricated artifacts. This stage is waiting for grounded input.</p>'}</div></section>`).join('')}</div></details>`}

function outcomeStatus(){const goal=mission()?.data?.goalContract,verification=latest('outcome_verification'),criterion=verification?.data?.results?.[0]||goal?.successCriteria?.[0],jobs=rec('job'),job=jobs.find(x=>x.id===operating?.session?.data?.jobId)||jobs[0],strategy=currentRec('strategy_selection').find(x=>x.state==='selected')||rec('strategy_selection').find(x=>x.state==='selected'),selectedOption=rec('strategy_option').find(x=>x.id===strategy?.data?.strategyId),request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open'),approvals=currentRec('approval_request').filter(x=>['pending','waiting'].includes(x.state)),worldFacts=currentRec('world_fact'),externalFacts=worldFacts.filter(x=>x.data?.classification==='EXTERNAL_OBSERVATION'),userClaims=worldFacts.filter(x=>x.data?.classification==='USER_CLAIM'),caps=rec('capability'),strategies=currentRec('strategy_option').filter(x=>['considered','selected'].includes(x.state)||!x.state),achieved=verification?.data?.outcomeAchieved,status=humanStatus({achieved,verification,request,approvals,job,strategy}),hasAfter=criterion?.after!==undefined,progressValue=hasAfter?criterion.after:null,targetValue=criterion?.target;
  const factRows=externalFacts.slice(-3).reverse().map(f=>`<li><span>✓</span><div><strong>${esc(f.data?.predicate?.startsWith('metric:')?f.data.predicate.slice(7).replaceAll('_',' '):(f.data?.value?.title||f.data?.subject||'Grounded observation'))}</strong><p>${esc(f.data?.predicate?.startsWith('metric:')?simpleValue(f.data.value):(f.data?.externalRef||simpleValue(f.data?.value)))}</p></div></li>`).join('');
  const moves=strategies.slice(0,3).map((x,i)=>`<li class="move-row ${x.id===strategy?.data?.strategyId?'selected':''}"><span>${x.id===strategy?.data?.strategyId?'✓':String(i+1).padStart(2,'0')}</span><div><strong>${esc(x.data?.title||`Possible move ${i+1}`)}</strong><p>${esc(x.data?.expectedEffect||x.data?.hypothesis||'Persisted strategy proposal')}</p></div></li>`).join('');
  const approval=approvals[0];
  return `<section class="outcome-hero"><div class="outcome-copy"><span>YOUR OUTCOME</span><h1>${esc(goal?.desiredState||mission()?.data?.outcome)}</h1><p>${hasAfter?`Observed result ${esc(progressValue)} against target ${esc(targetValue??'—')}.`:`Target defined. ${externalFacts.length?`${externalFacts.length} grounded observation${externalFacts.length===1?'':'s'} available.`:'Waiting for grounded before/after evidence.'}`}</p></div><div class="result-panel ${status.key}"><small>${status.eyebrow}</small><strong>${esc(status.title)}</strong>${hasAfter?`<div class="result-metric"><b>${esc(progressValue)}</b><i>/</i><span>${esc(targetValue??'target')}</span></div>`:''}<p>${esc(status.detail)}</p></div></section>
  <div class="flow-strip"><div class="done"><span>01</span><b>Goal</b></div><div class="${externalFacts.length?'done':'active'}"><span>02</span><b>Findings</b></div><div class="${strategy?'done':externalFacts.length?'active':''}"><span>03</span><b>Move</b></div><div class="${approval?'active':job?'done':''}"><span>04</span><b>Approval / access</b></div><div class="${hasAfter?'done':''}"><span>05</span><b>Verified result</b></div></div>
  <div class="decision-grid"><section class="decision-card findings-card"><header><small>WHAT I KNOW SO FAR</small><h2>${externalFacts.length?`${externalFacts.length} grounded observation${externalFacts.length===1?'':'s'}`:'No external observation yet'}</h2></header><div class="evidence-counts"><span><b>${externalFacts.length}</b> external</span><span><b>${userClaims.length}</b> user claim${userClaims.length===1?'':'s'}</span><span><b>${caps.length}</b> capabilit${caps.length===1?'y':'ies'}</span></div>${factRows?`<ul class="finding-list">${factRows}</ul>`:`<p class="plain-copy">I can plan from the goal and supplied context, but I won’t treat model output as evidence. Connect a real observation source to ground the current state.</p>`}</section>
  <section class="decision-card move-card"><header><small>BEST CURRENT MOVE</small><h2>${esc(strategy?.data?.title||'Still comparing viable moves')}</h2></header>${selectedOption?`<p class="plain-copy">${esc(selectedOption.data?.expectedEffect||strategy?.data?.rationale)}</p><div class="move-facts"><span><small>RISK</small><b>${esc(sentence(selectedOption.data?.riskLevel||'unknown'))}</b></span><span><small>REVERSIBLE</small><b>${esc(sentence(selectedOption.data?.reversibility||'unknown'))}</b></span><span><small>TIME TO EVIDENCE</small><b>${esc(sentence(selectedOption.data?.timeToEvidence||'unknown'))}</b></span></div>`:`<p class="plain-copy">${esc(strategy?.data?.rationale||'Company Zero is scoring possible paths against evidence, capability coverage, reversibility, measurability, risk and cost.')}</p>`}${moves?`<details class="alternate-moves"><summary>${strategies.length} possible move${strategies.length===1?'':'s'} considered</summary><ul class="finding-list">${moves}</ul></details>`:''}</section>
  <section class="decision-card action-card"><header><small>WHAT HAPPENS NEXT</small><h2>${request?'I need access before I can act.':approval?'The next move is ready for your approval.':achieved?'Nothing needs you right now.':job?sentence(job.state):'I’m still preparing the next move.'}</h2></header>${request?`<p class="plain-copy">${esc(request.data?.message||request.data?.reason||'A real capability is required before execution can continue.')}</p><button class="primary-btn action-primary" data-provider>Connect or describe a real capability</button>`:approval?`<p class="plain-copy">Sensitive work has not executed yet. Approve or reject the persisted request below.</p><div class="approval-actions"><button class="ghost-btn" data-approval="${approval.id}" data-decision="rejected">Reject</button><button class="primary-btn" data-approval="${approval.id}" data-decision="approved">Approve move</button></div>`:achieved?`<p class="plain-copy">The target is backed by grounded verification. Evidence and provenance remain available below.</p>`:`<p class="plain-copy">${job?`Runtime state: ${esc(sentence(job.state))}. ${job.data?.operation?`Current operation: ${esc(sentence(job.data.operation))}.`:''}`:'No external side effect is waiting on you.'}</p>`}</section></div>`}

function composer(){return `<div class="cz-composer-shell"><form class="cz-composer" id="conversation"><textarea name="message" rows="1" placeholder="Tell Company Zero anything…"></textarea><button aria-label="Send">↑</button></form></div>`}

function activityRail(){
  const events=workEvents();
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  const approval=currentRec('approval_request').find(x=>['pending','waiting'].includes(x.state));
  const verification=latest('outcome_verification');
  const working=events.filter(e=>!['approval','result','evolution','boundary'].includes(e.kind)).slice(-3).reverse();
  const ready=events.filter(e=>['result','evolution'].includes(e.kind)).slice(-3).reverse();
  const task=(e,cls='')=>`<article class="task-row ${cls}"><span></span><div><strong>${esc(compactText(e.title,46))}</strong>${e.detail?`<p>${esc(compactText(e.detail,68))}</p>`:''}</div></article>`;
  return `<aside class="task-rail"><div class="task-rail-outcome"><small>OUTCOME</small><strong>${esc(compactText(mission()?.data?.goalContract?.desiredState||mission()?.data?.outcome||operating?.session?.data?.goal,72))}</strong></div><div class="task-rail-section"><small>WORKING</small>${working.length?working.map((e,i)=>task(e,i===0?'active':'')).join(''):`<article class="task-row active"><span></span><div><strong>Preparing the next useful step</strong></div></article>`}</div><div class="task-rail-section"><small>NEEDS YOU</small>${request?`<article class="task-row needs"><span></span><div><strong>Access needed</strong><p>${esc(compactText(contextualAccessCopy(request),72))}</p></div></article>`:approval?`<article class="task-row needs"><span></span><div><strong>Approval needed</strong><p>${esc(compactText(approval.data?.reason||'A consequential action is waiting.',72))}</p></div></article>`:`<div class="task-empty">Nothing right now.</div>`}</div><div class="task-rail-section"><small>READY</small>${ready.length?ready.map(e=>task(e,'ready')).join(''):`<div class="task-empty">Completed work will collect here.</div>`}</div><button class="task-inspect" data-page="developer">Inspect runtime →</button></aside>`;
}
function missionSummary(){
  const goal=mission()?.data?.goalContract||{};
  const criterion=goal.successCriteria?.[0]||latest('outcome_verification')?.data?.results?.[0]||{};
  const target=criterion.target!==undefined?String(criterion.target):compactText(goal.desiredState||mission()?.data?.outcome||'',70);
  const external=currentRec('world_fact').filter(x=>x.data?.classification==='EXTERNAL_OBSERVATION');
  const verification=latest('outcome_verification');
  const baseline=criterion.before!==undefined?String(criterion.before):(external.length?'Observed':'Not measured yet');
  const result=criterion.after!==undefined?String(criterion.after):(verification?'Verification available':'Waiting on evidence');
  return {target,baseline,result};
}
function contextualAccessCopy(request){
  const goal=String(mission()?.data?.goalContract?.desiredState||mission()?.data?.outcome||'this outcome').toLowerCase();
  const raw=request?.data?.message||request?.data?.reason||request?.data?.description||'';
  if(raw && !/declared capability|capability coverage|selected strategy/i.test(raw))return compactText(raw,180);
  return `I can keep analysing and preparing, but I need a connected system or data source before I can measure or change the real world for this outcome.`;
}
function nextWorkItems(){
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  const strategy=currentRec('strategy_selection').find(x=>x.state==='selected')||rec('strategy_selection').find(x=>x.state==='selected');
  const items=[];
  if(request)items.push('Connect the data or system needed for the blocked operation');
  if(!latest('outcome_verification'))items.push('Establish a grounded baseline');
  if(strategy)items.push(`Test: ${compactText(strategy.data?.title||'the selected direction',60)}`); else items.push('Choose the strongest evidence-backed move');
  items.push('Measure what changed and decide what to do next');
  return items.slice(0,4);
}
function contextRail(){return '';}
function accessWorkCard(request,index){
  return `<article class="product-work-object needs-you"><div class="work-object-icon">!</div><div class="work-object-main"><small>NEEDS YOU</small><h3>The next real-world step needs access.</h3><p>${esc(contextualAccessCopy(request))}</p><div class="work-object-actions"><button class="primary-btn" data-provider>Connect what’s needed</button><button class="ghost-btn" data-page="developer">Choose another source</button></div></div></article>`;
}
function outcome(){
  const n=runtimeNarrative();
  const events=workEvents();
  const request=currentRec('capability_access_request').find(x=>x.state==='open')||rec('capability_access_request').find(x=>x.state==='open');
  const approval=currentRec('approval_request').find(x=>['pending','waiting'].includes(x.state));
  const verification=latest('outcome_verification');
  const summary=missionSummary();
  const goal=mission()?.data?.goalContract?.desiredState||mission()?.data?.outcome||operating?.session?.data?.goal||company?.data?.name;
  const useful=events.filter(e=>!['boundary'].includes(e.kind)).slice(-10);
  const status=verification?.data?.outcomeAchieved?['ready','Ready']:request||approval?['needs','Needs you']:['working','Working'];
  const rows=useful.map((e,i)=>{
    const cls=e.kind==='result'?'result':e.kind==='evolution'?'evolution':e.kind==='approval'?'needs':'';
    const glyph=e.kind==='result'?'✓':e.kind==='evolution'?'↻':e.kind==='approval'?'!':e.kind==='organization'?'⌘':'·';
    const metric=e.before!==undefined||e.after!==undefined?`<div class="cz-metric"><span>${esc(e.before??'—')}</span><i>→</i><strong>${esc(e.after??'—')}</strong>${e.target!==undefined?`<small>target ${esc(e.target)}</small>`:''}</div>`:'';
    const actions=e.kind==='approval'?`<div class="cz-actions"><button class="ghost-btn" data-approval="${e.id}" data-decision="rejected">Reject</button><button class="primary-btn" data-approval="${e.id}" data-decision="approved">Approve</button></div>`:'';
    const evidence=(e.refs?.length||e.kind==='result')?`<button class="cz-evidence-link" data-page="evidence">Evidence →</button>`:'';
    return `<article class="cz-feed-item ${cls}"><div class="cz-feed-dot">${glyph}</div><div class="cz-feed-body"><div class="cz-feed-meta"><span>${esc(e.kind==='decision'?'Direction':e.kind==='organization'?'Company':e.kind==='result'?'Result':e.kind==='evolution'?'Evolution':e.kind==='approval'?'Needs you':'Work')}</span>${e.time?`<time>${esc(fmt(e.time))}</time>`:''}</div><h2>${esc(e.title)}</h2>${e.detail?`<p>${esc(e.detail)}</p>`:''}${metric}${actions}${evidence}</div></article>`;
  }).join('');
  const access=request?`<article class="cz-boundary"><div class="cz-boundary-icon">!</div><div><small>NEEDS YOU</small><h2>This step needs a real connection.</h2><p>${esc(contextualAccessCopy(request))}</p><div class="cz-actions"><button class="primary-btn" data-provider>Connect what’s needed</button><button class="ghost-btn" data-page="developer">Inspect access</button></div></div></article>`:'';
  const approve=approval&&!useful.some(e=>e.kind==='approval')?`<article class="cz-boundary"><div class="cz-boundary-icon">!</div><div><small>NEEDS YOU</small><h2>A consequential action is ready.</h2><p>${esc(approval.data?.reason||'Nothing has executed past the approval boundary.')}</p><div class="cz-actions"><button class="ghost-btn" data-approval="${approval.id}" data-decision="rejected">Reject</button><button class="primary-btn" data-approval="${approval.id}" data-decision="approved">Approve</button></div></div></article>`:'';
  const facts=[summary.target&&summary.target!=='—'?['Target',summary.target]:null,summary.baseline&&summary.baseline!=='—'?['Baseline',summary.baseline]:null,summary.result&&summary.result!=='—'?['Result',summary.result]:null].filter(Boolean);
  return `<div class="cz-outcome-page"><section class="cz-outcome-head"><div class="cz-outcome-title"><small>OUTCOME</small><h1>${esc(goal)}</h1><p>${esc(n.title)}</p></div><div class="cz-status ${status[0]}"><i></i>${status[1]}</div></section>${facts.length?`<section class="cz-summary">${facts.map(([k,v])=>`<div><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('')}</section>`:''}${evolutionHero()}<section class="cz-feed"><div class="cz-feed-heading"><div><small>LIVE WORK</small><h2>What changed</h2></div><button class="cz-inspect" data-page="evidence">Inspect evidence</button></div>${rows||`<article class="cz-feed-item current"><div class="cz-feed-dot">0</div><div class="cz-feed-body"><div class="cz-feed-meta"><span>Working</span></div><h2>The first useful output is being prepared.</h2><p>Nothing is marked done until a real artifact, action, decision or measurement exists.</p></div></article>`}${access}${approve}</section>${deliverablesPanel()}${evidenceReceipts()}<section class="cz-inspect-strip"><button data-page="company"><span>Company</span><small>Structure & revisions</small></button><button data-page="evidence"><span>Evidence</span><small>Receipts & measurements</small></button><button data-page="controls"><span>Controls</span><small>Authority & approvals</small></button><button data-page="developer"><span>Runtime</span><small>Jobs & providers</small></button></section>${composer()}</div>`;
}
function companyPanel(){const org=production(),roles=org?.data?.roles||[];return `<div class="section-title"><div><small>THE COMPANY IT BUILT</small><h2>${roles.length} functions operating under revision ${org?.data?.revision||'—'}</h2></div><button class="text-btn" data-page="company">Inspect organization →</button></div>${roles.length?`<div class="role-grid">${roles.map((r,i)=>`<article><span>${String(i+1).padStart(2,'0')}</span><strong>${esc(r.name)}</strong><p>${esc(r.purpose)}</p><small>${r.capabilityIds?.length||0} capabilities · ${money(r.budgetUsd)}</small></article>`).join('')}</div>`:empty('Organization not formed yet','Company Zero will only form the company after choosing a strategy and finding real capabilities.')}`}

const head=(eye,title,desc,actions='')=>`<div class="page-head"><div><div class="kicker">${eye}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${actions?`<div class="head-actions">${actions}</div>`:''}</div>`;
function companyView(){const revisions=company.records.filter(x=>['organization_revision','candidate_revision'].includes(x.kind)).sort((a,b)=>(b.data.revision||0)-(a.data.revision||0));return `<div class="content">${head('ORGANIZATION UNDER THE OUTCOME','The company','Strategy determines structure. Every material structure is an immutable revision; work remains pinned to the revision that received it.','<button class="secondary-btn" data-provider>Connect capability</button>')}<section class="panel org-large">${companyPanel()}</section><section class="panel"><div class="panel-head"><div><span>REVISION LEDGER</span><h2>Append-only organization history</h2></div></div>${revisions.map(r=>`<div class="ledger-row"><div class="rev-badge">R${r.data.revision}</div><div><strong>${esc(r.data.selectedStrategy?.title||'Organization revision')}</strong><small>${r.data.roles?.length||0} roles · ${fmt(r.created_at)}</small></div>${pill(r.state,r.state==='production'?'good':'neutral')}</div>`).join('')||empty('No revisions yet','Structure appears only after strategy and capability discovery.')}</section></div>${composer()}`}
function workView(){const jobs=rec('job').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));return `<div class="content">${head('DURABLE EXECUTION','Work','Real jobs, pinned revisions, leases, recovery, approvals and invocation evidence.')}<section class="panel table-panel">${jobs.length?`<div class="table"><div class="tr th"><span>Job</span><span>Revision</span><span>State</span><span>Run</span><span>Created</span></div>${jobs.map(j=>`<div class="tr"><span><b>${short(j.id)}</b><small>${esc(j.data.source||'production')}</small></span><span>R${j.data.organizationRevision||'—'}</span><span>${pill(j.state,j.state==='completed'?'good':j.state==='failed'?'bad':j.state==='waiting_for_approval'?'warn':'neutral')}</span><span>${short(j.data.runId)}</span><span>${fmt(j.created_at)}</span></div>`).join('')}</div>`:empty('No durable work yet','The company is waiting for capabilities or a launchable strategy.')}</section></div>${composer()}`}
function evolutionView(){const ds=rec('governor_decision').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),exps=rec('experiment');return `<div class="content">${head('EVIDENCE-GATED ADAPTATION','Evolution','The Governor separates execution, strategy, organization and capability failures before changing the company.')}<div class="invariant"><span>PROPOSE</span><i>→</i><span>EXECUTE</span><i>→</i><span>EVALUATE</span><i>→</i><span>GOVERN</span></div><section class="panel"><div class="panel-head"><div><span>GOVERNOR</span><h2>Decisions</h2></div></div>${ds.map(d=>`<div class="ledger-row"><div class="decision-icon">↗</div><div><strong>${esc(d.data.action)}</strong><small>${esc(d.data.failureClass||'none')} · ${esc(d.data.reason)}</small></div>${pill(d.state)}</div>`).join('')||empty('Watching for evidence','No structural claim is made from one successful call.')}</section><section class="panel"><div class="panel-head"><div><span>SAME-WORKLOAD EXPERIMENTS</span><h2>${exps.length} durable experiments</h2></div></div>${exps.map(x=>`<div class="ledger-row"><div class="rev-badge">${short(x.id)}</div><div><strong>${x.data.candidateRevisionIds?.length||0} candidates</strong><small>Frozen dataset · atomic promotion gate</small></div>${pill(x.state)}</div>`).join('')||empty('No experiment justified yet','Candidates are created only from grounded recurring evidence.')}</section></div>${composer()}`}
function evidenceView(){const items=company.records.filter(x=>['trace','evaluation','external_observation','outcome_observation','outcome_verification','world_fact','work_relevance','operation_plan','diagnosis','invocation','promotion_decision'].includes(x.kind)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));return `<div class="content">${head('EXECUTION IS NOT OUTCOME','Evidence','Task completion, claim provenance, mission relevance and real-world movement are separate inspectable verdicts.')}<section class="panel table-panel">${items.length?`<div class="table"><div class="tr th"><span>Record</span><span>Type</span><span>State</span><span>Run</span><span>Evidence ID</span></div>${items.map(r=>`<div class="tr"><span><b>${esc(r.kind.replaceAll('_',' '))}</b><small>${fmt(r.created_at)}</small></span><span>${esc(r.data.classification||r.data.evaluator||r.data.relevance||r.kind)}</span><span>${pill(r.state,r.state==='achieved'||r.state==='passed'||r.state==='completed'||r.state==='observed'?'good':r.state==='failed'||r.state==='blocked'?'bad':'neutral')}</span><span>${short(r.data.runId)}</span><span class="mono">${short(r.id)}</span></div>`).join('')}</div>`:empty('No evidence yet','Evidence appears after real work or grounded observations.')}</section></div>${composer()}`}
function economicsView(){const runs=rec('run'),spent=runs.reduce((s,x)=>s+Number(x.data.costUsd||0),0);return `<div class="content">${head('TRANSACTIONAL BUDGET','Economics','Budget reservation happens before invocation and settlement happens after a known result.')}<div class="metrics-grid three"><div class="metric-card"><span>Confirmed spend</span><strong>${money(spent)}</strong><small>${runs.length} runs</small></div><div class="metric-card"><span>Daily ceiling</span><strong>${money(mission()?.data?.constraints?.dailyBudgetUsd)}</strong><small>Runtime enforced</small></div><div class="metric-card"><span>Authority</span><strong>SQL</strong><small>Reserve + settle</small></div></div></div>${composer()}`}
function controlsView(){const approvals=rec('approval_request').filter(x=>['pending','waiting'].includes(x.state));return `<div class="content">${head('HUMAN AUTHORITY','Controls','Sensitive effects pause durably and resume the same run after a persisted decision.')}<section class="panel"><div class="control-actions"><button class="secondary-btn" data-control="pause">Pause</button><button class="secondary-btn" data-control="resume">Resume</button><button class="danger-btn" data-control="terminate">Terminate</button></div></section><section class="panel"><div class="panel-head"><div><span>APPROVALS</span><h2>${approvals.length} waiting</h2></div></div>${approvals.map(a=>`<div class="approval-card"><div><strong>${esc(a.data.reason||'Sensitive action')}</strong><p>${esc(a.data.risk)}</p></div><div><button class="secondary-btn" data-approval="${a.id}" data-decision="rejected">Reject</button><button class="primary-btn" data-approval="${a.id}" data-decision="approved">Approve</button></div></div>`).join('')||empty('Nothing needs approval','The runtime is inside its current authority boundary.')}</section></div>${composer()}`}
function memoryView(){const lessons=rec('lesson');return `<div class="content">${head('INSTITUTIONAL MEMORY','Memory','Only evidence-backed structural lessons survive promotion.')}<div class="lesson-grid">${lessons.map(l=>`<article class="lesson-card"><span>LEARNED</span><h3>${esc(l.data.failureSignature||'Promotion lesson')}</h3><p>${esc(l.data.reason||'Retained from measured candidate performance.')}</p><div><small>${l.data.evidenceIds?.length||0} evidence records</small><code>${short(l.id)}</code></div></article>`).join('')}</div>${lessons.length?'':empty('No promoted lessons yet','Failed ideas do not become institutional folklore.')}</div>${composer()}`}
function developerView(){const caps=rec('capability'),providers=rec('capability_provider');return `<div class="content">${head('ADVANCED INSPECTION','Developer','Manual provider configuration remains available here; it is no longer normal onboarding.','<button class="primary-btn" data-provider>Register provider</button>')}<div class="metrics-grid three"><div class="metric-card"><span>Providers</span><strong>${providers.length}</strong><small>Declared protocols</small></div><div class="metric-card"><span>Capabilities</span><strong>${caps.length}</strong><small>Declared; invocation proves usability</small></div><div class="metric-card"><span>Storage</span><strong>${esc(health?.storage||'—')}</strong><small>Durability mode</small></div></div><section class="panel"><div class="panel-head"><div><span>CAPABILITY REGISTRY</span><h2>Declared observations and changes</h2></div></div>${caps.map(c=>`<div class="ledger-row"><div class="rev-badge">${icon('developer')}</div><div><strong>${esc(c.data.name)}</strong><small>${esc(c.data.operationKind)} · observes ${(c.data.observes||[]).length} · changes ${(c.data.changes||[]).length} · measurements ${(c.data.measurements||[]).length}</small></div>${pill(c.data.risk,c.data.risk==='read'?'good':'warn')}</div>`).join('')||empty('No capabilities declared','Company Zero can plan, but it will not pretend to operate without real tools.')}</section></div>${composer()}`}
const views={outcome,company:companyView,work:workView,evolution:evolutionView,evidence:evidenceView,economics:economicsView,controls:controlsView,memory:memoryView,developer:developerView};

function nav(){$('#nav').innerHTML=NAV.map(([id,label])=>`<button class="${page===id?'active':''}" data-page="${id}"><span class="nav-icon">${icon(id)}</span><span>${label}</span></button>`).join('')}
function render(){const has=Boolean(company);document.body.classList.toggle('no-company',!has);document.body.classList.toggle('autonomous-run',Boolean(launchingGoal||(has&&operating&&operating.session.state!=='completed'&&page==='outcome')));nav();$('#crumb').textContent=NAV.find(x=>x[0]===page)?.[1]||'Outcome';$('#companyName').textContent=company?.data?.name||'No outcome yet';$('#companyAvatar').textContent=company?.data?.name?.[0]?.toUpperCase()||'0';$('#view').innerHTML=has?(views[page]?.()||outcome()):launchingGoal?launching():welcome();bind()}
function bind(){const ri=$('#refreshInline');if(ri)ri.onclick=()=>refresh();const no=$('#newOutcomeInline');if(no)no.onclick=()=>{$('#newCompany').click()};document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;location.hash=page;$('#sidebar').classList.remove('open');render()});document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{$('[name=goal]').value=b.dataset.example;$('[name=goal]').focus()});const gf=$('#goalForm');if(gf)gf.onsubmit=e=>{e.preventDefault();const goal=String(new FormData(e.target).get('goal')||'').trim();if(!goal)return;launchingGoal=goal;render();act(async()=>{operating=await api('/outcomes',{method:'POST',body:{goal}});company=operating.company;active=company.id;localStorage.cz_active=active;page='outcome';location.hash=page;launchingGoal=''},'Operating session created')};const cf=$('#conversation');if(cf)cf.onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),message=f.get('message');if(!message.trim())return;act(async()=>{await api(`/companies/${active}/sessions/${operating.session.id}/messages`,{method:'POST',body:{message}});e.target.reset()},'Correction applied')};document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>openProvider());document.querySelectorAll('[data-control]').forEach(b=>b.onclick=()=>act(()=>api(`/companies/${active}/controls`,{method:'POST',body:{action:b.dataset.control}}),`Company ${b.dataset.control}d`));document.querySelectorAll('[data-approval]').forEach(b=>b.onclick=()=>act(()=>api(`/companies/${active}/approvals/${b.dataset.approval}/decision`,{method:'POST',body:{decision:b.dataset.decision}}),`Approval ${b.dataset.decision}`))}

function openProvider(){const manifest=JSON.stringify({capabilities:[{name:'observe_state',description:'Describe the real state this endpoint observes',endpoint:'/observe',method:'POST',risk:'read',operationKind:'observe',observes:['replace_with_observed_state'],changes:[],acceptsMissionEnvelope:true,inputSchema:{type:'object'},outputSchema:{type:'object'},measurements:[{metricId:'replace_with_contract_metric_id',path:'$.replace_with_value_path',phase:'after',externalRefPath:'$.replace_with_external_record_id'}]}]},null,2);$('#modal').innerHTML=`<div class="modal-head"><div><small>ADVANCED · DECLARED CAPABILITY</small><h2>Register a generic HTTP provider</h2><p>Declaration alone is not proof of usability. A real invocation, schema-valid response, and trace-backed measurement are required before Company Zero reports an observation.</p></div><button type="button" id="modalClose">×</button></div><div class="modal-body"><label class="field"><span>Provider name</span><input name="name" required autofocus></label><label class="field"><span>Base URL</span><input name="url" type="url" required placeholder="https://api.example.com"></label><label class="field"><span>Capability manifest</span><textarea class="code-input" name="manifest">${esc(manifest)}</textarea></label></div><div class="modal-foot"><button type="button" class="ghost-btn" id="modalCancel">Cancel</button><button class="primary-btn">Register and validate →</button></div>`;$('#modalWrap').hidden=false;$('#modalClose').onclick=closeModal;$('#modalCancel').onclick=closeModal;$('#modal').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);let parsed;try{parsed=JSON.parse(f.get('manifest'))}catch{return toast('Manifest must be valid JSON',true)}act(async()=>{await api(`/companies/${active}/providers`,{method:'POST',body:{name:f.get('name'),type:'http',baseUrl:f.get('url'),manifest:parsed}});operating=await api(`/companies/${active}/sessions/${operating.session.id}/advance`,{method:'POST'});closeModal()},'Capability declaration registered')};setTimeout(()=>$('#modal input[autofocus]')?.focus(),20)}
function closeModal(){$('#modalWrap').hidden=true}
async function act(fn,message){if(!$('#busy').hidden)return;$('#busy').hidden=false;try{await fn();await refresh(false);toast(message)}catch(e){launchingGoal='';toast(humanError(e),true)}finally{$('#busy').hidden=true;render()}}
function toast(message,bad=false){const t=$('#toast');t.textContent=message;t.className=`toast${bad?' bad':''}`;t.style.display='block';setTimeout(()=>t.style.display='none',2800)}
async function refresh(renderAfter=true){const all=await api('/companies');companies=all.items||[];if(active){company=await api(`/companies/${active}`);const s=rec('operating_session').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];operating=s?await api(`/companies/${active}/sessions/${s.id}`):null}if(renderAfter)render()}
async function switcher(){await refresh(false);$('#modal').innerHTML=`<div class="modal-head"><div><small>OUTCOMES</small><h2>Your operating sessions</h2></div><button type="button" id="modalClose">×</button></div><div class="company-list">${companies.map(c=>`<button type="button" data-company="${c.id}"><span class="company-avatar">${esc(c.data.name?.[0]||'0')}</span><span><strong>${esc(c.data.name)}</strong><small>${esc(c.data.status)}</small></span><span>→</span></button>`).join('')}</div>`;$('#modalWrap').hidden=false;$('#modalClose').onclick=closeModal;document.querySelectorAll('[data-company]').forEach(b=>b.onclick=async()=>{active=b.dataset.company;localStorage.cz_active=active;closeModal();await refresh();page='outcome';location.hash=page})}
async function hydrateActive(){
  if(!active)return;
  company=await api(`/companies/${active}`);
  const s=rec('operating_session').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
  operating=s?await api(`/companies/${active}/sessions/${s.id}`):null;
}
async function load(){
  const started=performance.now();
  render();
  const boot=$('#bootScreen'),bootStatus=$('#bootStatus');
  if(bootStatus)bootStatus.textContent='Connecting to the control plane';
  const [healthResult,companiesResult]=await Promise.allSettled([
    fetch('/api/health',{cache:'no-store'}).then(r=>r.json()),
    api('/companies')
  ]);
  if(healthResult.status==='fulfilled'){
    health=healthResult.value;
    $('#runtimeDot').classList.toggle('live',Boolean(health.ok));
    $('#runtimeTitle').textContent=health.ok?'Runtime online':'Runtime unavailable';
    $('#runtimeSub').textContent=health.tensormuxConfigured?'TensorMux configured':'Deterministic fallback';
    $('#liveChip')?.classList.toggle('off',!health.ok);
  }else $('#runtimeTitle').textContent='Runtime unavailable';
  if(companiesResult.status==='fulfilled'){
    companies=companiesResult.value.items||[];
    if(active&&!companies.some(x=>x.id===active)){active='';localStorage.removeItem('cz_active')}
  }else toast(humanError(companiesResult.reason),true);
  if(active){
    if(bootStatus)bootStatus.textContent='Restoring the latest outcome';
    try{await hydrateActive()}catch(e){toast(humanError(e),true)}
  }
  render();
  const wait=Math.max(0,650-(performance.now()-started));
  await new Promise(r=>setTimeout(r,wait));
  if(boot){boot.classList.add('boot-done');setTimeout(()=>boot.remove(),380)}
}
$('#newCompany').onclick=()=>{active='';company=null;operating=null;localStorage.removeItem('cz_active');page='outcome';location.hash=page;render()};$('#companySwitch').onclick=switcher;$('#refresh').onclick=()=>refresh();$('#hamburger').onclick=()=>$('#sidebar').classList.add('open');$('#navClose').onclick=()=>$('#sidebar').classList.remove('open');$('#modalWrap').onmousedown=e=>{if(e.target===e.currentTarget)closeModal()};window.onhashchange=()=>{page=location.hash.slice(1)||'outcome';render()};setInterval(()=>{if(active&&!document.hidden)refresh().catch(()=>{})},5000);load();
