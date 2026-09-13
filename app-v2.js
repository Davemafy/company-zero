const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const compact=(s,n=86)=>{const v=String(s||'').replace(/\s+/g,' ').trim();return v.length>n?`${v.slice(0,n-1)}…`:v};
const safeUrl=s=>{try{const u=new URL(String(s));return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}};
const state={page:location.hash.slice(1)||'home',active:localStorage.cz_active||'',companies:[],company:null,operating:null,health:null,answer:null,loading:false,error:'',sending:false};

async function api(path,opt={}){
  const res=await fetch('/api/v1'+path,{method:opt.method||'GET',headers:{'content-type':'application/json',...(opt.headers||{})},body:opt.body?JSON.stringify(opt.body):undefined});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(body.error||`Request failed (${res.status})`);
  return body;
}
async function health(){const r=await fetch('/api/health',{cache:'no-store'});return r.json()}
function records(){return state.operating?.company?.records||state.company?.records||[]}
function artifacts(){return (state.operating?.artifacts||records().filter(x=>x.kind==='artifact'&&x.state==='ready')).sort((a,b)=>Number(b.data?.deliverableVersion||1)-Number(a.data?.deliverableVersion||1))}
function latestArtifact(){return artifacts()[0]||null}
function evidence(){return records().filter(x=>['world_fact','external_observation','outcome_observation'].includes(x.kind)&&(!state.operating?.session?.id||!x.data?.sessionId||x.data.sessionId===state.operating.session.id))}
function jobs(){return records().filter(x=>x.kind==='job'&&(!state.operating?.session?.id||!x.data?.sessionId||x.data.sessionId===state.operating.session.id))}
function goal(){return state.operating?.session?.data?.goal||records().find(x=>x.kind==='mission')?.data?.outcome||state.company?.data?.name||'Work'}
function isNeedsInput(a=latestArtifact()){return a?.data?.degradedReason==='missing_brand_context'}
function artifactState(a=latestArtifact()){
  if(!a)return {label:'Working',tone:'partial',now:'Researching and producing the first result'};
  if(isNeedsInput(a))return {label:'Needs one detail',tone:'needs',now:'Waiting for one useful detail'};
  if(a.data?.degraded)return {label:'Partial',tone:'partial',now:'A partial result is ready'};
  return {label:'Ready',tone:'ready',now:'Result ready'};
}
function toast(message,bad=false){const el=$('#toast');if(!el)return;el.textContent=message;el.className=`toast show${bad?' error':''}`;setTimeout(()=>el.classList.remove('show'),2800)}

function nav(){
  const items=[['home','Home'],['work','Work'],['results','Results'],['connections','Connections']];
  $('#nav').innerHTML=items.map(([id,label])=>`<button class="cz-nav-button ${state.page===id?'active':''}" data-page="${id}"><span class="cz-nav-dot"></span>${label}</button>`).join('');
  $('#recentList').innerHTML=state.companies.slice(0,6).map(c=>`<button class="cz-recent ${state.active===c.id?'active':''}" data-company="${esc(c.id)}">${esc(compact(c.data?.name||'Untitled work',34))}</button>`).join('')||'<div class="cz-empty" style="padding:8px 10px">No work yet</div>';
  $('#runtimeTitle').textContent=state.health?.ok?'Online':'Connecting';
  $('#runtimeSub').textContent=state.health?.tensormuxConfigured?'AI + storage ready':'Runtime';
  $('#runtimeDot').style.background=state.health?.ok?'#9cff3d':'#ffcf66';
}

function home(){return `<div class="cz-home">
  <div class="cz-eyebrow">Company Zero</div>
  <h1>Say what you need. Get the result.</h1>
  <p class="cz-home-copy">Company Zero should spend its time doing the work, not making you watch orchestration. Research when facts matter, produce the first useful result, then ask only when a missing detail actually changes the answer.</p>
  <form class="cz-prompt" id="goalForm">
    <textarea name="goal" required placeholder="What do you want done?">${esc(state.loading?'': '')}</textarea>
    <div class="cz-prompt-foot"><span class="cz-hint">Low-risk assumptions are inferred. Important unknowns are asked once.</span><button class="cz-send" ${state.loading?'disabled':''}>${state.loading?'Working…':'Go'}</button></div>
  </form>
  ${state.loading?'<div class="cz-loading"><span class="cz-spinner"></span>Researching and producing the first useful result…</div>':''}
  ${state.error?`<div class="cz-answer" style="border-color:#57302f;color:#ffb7b1">${esc(state.error)}</div>`:''}
  ${state.answer?`<div class="cz-answer"><strong>${esc(state.answer.question)}</strong><div style="margin-top:10px">${esc(state.answer.answer)}</div></div>`:''}
</div>`}

function artifactCard(a){
  if(!a)return `<div class="cz-card"><div class="cz-loading"><span class="cz-spinner"></span>Producing the first result…</div></div>`;
  const d=a.data||{};const needs=isNeedsInput(a);const partial=Boolean(d.degraded);const preview=`/api/artifact?id=${encodeURIComponent(a.id)}&mode=preview`;const download=`/api/artifact?id=${encodeURIComponent(a.id)}`;
  return `<div class="cz-card">
    <div class="cz-artifact-meta">Result V${Number(d.deliverableVersion||1)} ${partial?'· partial':'· ready'}</div>
    <h2>${esc(d.title||'Result')}</h2>
    <p>${esc(d.summary||'')}</p>
    ${needs?`<p style="color:#ffd66b"><strong>Reply below with the missing detail.</strong> Company Zero will use it to produce the real shortlist instead of guessing.</p>`:''}
    <div class="cz-actions"><a class="cz-btn primary" href="${preview}" target="_blank" rel="noopener">Open result</a><a class="cz-btn" href="${download}">Download</a>${partial&&!needs?'<button class="cz-btn warn" id="retryResult">Retry research</button>':''}</div>
  </div>`;
}
function sourcesCard(){
  const items=evidence().filter(x=>safeUrl(x.data?.externalRef));
  return `<div class="cz-card"><div class="cz-eyebrow">Evidence</div><h2>${items.length?`${items.length} grounded source${items.length===1?'':'s'}`:'No external evidence yet'}</h2>${items.length?items.slice(0,8).map(x=>{const u=safeUrl(x.data?.externalRef);const title=x.data?.subject||x.data?.value?.title||u;const snippet=x.data?.value?.snippet||'';return `<div class="cz-source"><a href="${esc(u)}" target="_blank" rel="noopener">${esc(title)}</a>${snippet?`<small>${esc(compact(snippet,180))}</small>`:''}</div>`}).join(''):'<p class="cz-empty">Company Zero has not persisted a source for this mission yet. It will not label unsupported claims as proof.</p>'}</div>`;
}
function flowCard(a){
  const hasA=Boolean(a),hasE=evidence().length>0,needs=isNeedsInput(a);
  const steps=[['1','Request accepted',true],['2','Evidence gathered',hasE||needs],['3',needs?'Need one detail':'Result produced',hasA]];
  return `<div class="cz-card"><div class="cz-eyebrow">Progress</div><div class="cz-flow">${steps.map(([n,t,done],i)=>`<div class="cz-step ${done?'done':(!done&&steps.slice(0,i).every(x=>x[2])?'current':'')}"><i>${done?'✓':n}</i><span>${esc(t)}</span></div>`).join('')}</div></div>`;
}
function work(){
  if(!state.company&&!state.operating)return `<div class="cz-list"><h1>No active work</h1><p class="cz-empty">Start with a request from Home.</p></div>`;
  const a=latestArtifact(),s=artifactState(a);const count=artifacts().length,proof=evidence().length;
  return `<div class="cz-work">
    <div class="cz-work-top"><div><div class="cz-eyebrow">Active work</div><h1 class="cz-work-title">${esc(goal())}</h1></div><span class="cz-status-pill ${s.tone}">${esc(s.label)}</span></div>
    <div class="cz-metrics"><div class="cz-metric"><small>Now</small><strong>${esc(s.now)}</strong></div><div class="cz-metric"><small>Proof</small><strong>${proof?`${proof} source${proof===1?'':'s'}`:'Not claimed yet'}</strong></div><div class="cz-metric"><small>Output</small><strong>${count?`${count} result${count===1?'':'s'}`:'Building'}</strong></div></div>
    <div class="cz-grid"><div>${artifactCard(a)}</div><div>${flowCard(a)}</div><div>${sourcesCard()}</div><div class="cz-card"><div class="cz-eyebrow">Latest activity</div>${jobs().length?jobs().slice(-4).reverse().map(j=>`<div class="cz-source"><strong style="color:#dce7d9;font-size:13px">${esc(j.data?.operation||j.state||'Work update')}</strong><small>${esc(j.state||'')}</small></div>`).join(''):'<p class="cz-empty">No fake activity feed. Only persisted work appears here.</p>'}</div></div>
    <form class="cz-conversation" id="conversation"><input name="message" autocomplete="off" placeholder="${isNeedsInput(a)?'Send the missing URL or product detail…':'Tell Company Zero what to change or do next…'}" ${state.sending?'disabled':''}><button ${state.sending?'disabled':''}>↑</button></form>
  </div>`;
}
function results(){const all=artifacts();return `<div class="cz-list"><h1>Results</h1>${all.length?all.map(a=>`<div class="cz-row" data-artifact="${esc(a.id)}"><div><strong>${esc(a.data?.title||'Result')}</strong><span style="display:block;margin-top:5px">V${Number(a.data?.deliverableVersion||1)} · ${a.data?.degraded?'partial':'ready'}</span></div><span>Open →</span></div>`).join(''):'<p class="cz-empty">No results yet.</p>'}</div>`}
function connections(){const h=state.health||{};const rows=[['Storage',h.storage==='supabase',h.storage||'unknown'],['Reasoning',h.tensormuxConfigured, h.model||'not configured'],['Tracing',h.neatlogsConfigured,h.neatlogsConfigured?'configured':'optional'],['Public research provider',h.zyteConfigured||h.scrapyCloudConfigured,(h.zyteConfigured||h.scrapyCloudConfigured)?'configured':'zero-config search fallback']];return `<div class="cz-list"><h1>Connections</h1><div class="cz-health">${rows.map(([name,on,sub])=>`<div class="cz-health-item"><strong><span class="${on?'cz-dot-ok':'cz-dot-off'}">●</span> ${esc(name)}</strong><span>${esc(sub)}</span></div>`).join('')}</div></div>`}
function settings(){return `<div class="cz-list"><h1>Settings</h1><div class="cz-card"><h2>Product rule</h2><p>Company Zero should return useful work, grounded evidence, or one precise question. It should never manufacture progress just to keep a mission looking busy.</p></div></div>`}

function render(){
  nav();const labels={home:'Home',work:'Work',results:'Results',connections:'Connections',settings:'Settings',advanced:'Connections'};$('#topTitle').textContent=labels[state.page]||'Company Zero';
  const view={home,work,results,connections,settings,advanced:connections}[state.page]||home;$('#view').innerHTML=view();bind();
}
function bind(){
  document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>go(el.dataset.page));
  document.querySelectorAll('[data-company]').forEach(el=>el.onclick=async()=>{state.active=el.dataset.company;localStorage.cz_active=state.active;await hydrateActive();go('work')});
  document.querySelectorAll('[data-artifact]').forEach(el=>el.onclick=()=>window.open(`/api/artifact?id=${encodeURIComponent(el.dataset.artifact)}&mode=preview`,'_blank','noopener'));
  const form=$('#goalForm');if(form)form.onsubmit=submitGoal;
  const convo=$('#conversation');if(convo)convo.onsubmit=sendMessage;
  const retry=$('#retryResult');if(retry)retry.onclick=retryResult;
}
function go(p){state.page=p;location.hash=p;$('#sidebar')?.classList.remove('open');render()}

async function submitGoal(e){
  e.preventDefault();if(state.loading)return;const goalText=String(new FormData(e.currentTarget).get('goal')||'').trim();if(!goalText)return;
  state.loading=true;state.error='';state.answer=null;render();
  try{
    const result=await api('/interactions',{method:'POST',body:{message:goalText}});
    if(result.kind==='answer'){state.answer={question:goalText,answer:result.answer};state.loading=false;return render()}
    state.operating=result.operating;state.company=result.operating?.company||null;state.active=state.company?.id||'';if(state.active)localStorage.cz_active=state.active;
    state.companies=[state.company,...state.companies.filter(x=>x&&x.id!==state.company?.id)].filter(Boolean);state.loading=false;go('work');
  }catch(err){state.loading=false;state.error=err.message||'Request failed';render()}
}
async function sendMessage(e){
  e.preventDefault();if(state.sending)return;const message=String(new FormData(e.currentTarget).get('message')||'').trim();if(!message||!state.active||!state.operating?.session?.id)return;
  state.sending=true;render();
  try{await api(`/companies/${state.active}/sessions/${state.operating.session.id}/messages`,{method:'POST',body:{message}});await hydrateActive();toast('Updated')}
  catch(err){toast(err.message||'Could not update',true)}finally{state.sending=false;render()}
}
async function retryResult(){
  if(!state.active||!state.operating?.session?.id)return;const btn=$('#retryResult');if(btn){btn.disabled=true;btn.textContent='Retrying…'}
  try{await api(`/companies/${state.active}/sessions/${state.operating.session.id}/messages`,{method:'POST',body:{message:'Retry the failed or partial result now using fresh evidence. Do not repeat generic status text. If one critical user detail is missing, ask only for that detail.'}});await hydrateActive();toast('New result ready')}
  catch(err){toast(err.message||'Retry failed',true)}finally{render()}
}
async function hydrateActive(){
  if(!state.active){state.company=null;state.operating=null;return}
  try{
    const company=await api(`/companies/${state.active}`);state.company=company;const sessions=(company.records||[]).filter(x=>x.kind==='operating_session').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));const sid=sessions[0]?.id;
    state.operating=sid?await api(`/companies/${state.active}/sessions/${sid}`):null;if(state.operating?.company)state.company=state.operating.company;
  }catch(err){state.error=err.message;state.company=null;state.operating=null;state.active='';localStorage.removeItem('cz_active')}
}
async function refresh(silent=false){try{state.companies=(await api('/companies')).items||[];state.health=await health().catch(()=>state.health);if(state.active)await hydrateActive();if(!silent)toast('Refreshed')}catch(err){if(!silent)toast(err.message||'Refresh failed',true)}render()}

$('#newWork').onclick=()=>{state.answer=null;state.error='';go('home')};
$('#refresh').onclick=()=>refresh(false);
$('#menuBtn').onclick=()=>$('#sidebar').classList.add('open');
$('#sideClose').onclick=()=>$('#sidebar').classList.remove('open');
$('#showAllWork').onclick=()=>go('work');
document.querySelectorAll('.brand').forEach(x=>x.onclick=()=>go('home'));
window.addEventListener('hashchange',()=>{state.page=location.hash.slice(1)||'home';render()});

(async function boot(){
  try{state.health=await health().catch(()=>null);state.companies=(await api('/companies')).items||[];if(state.active)await hydrateActive()}catch(err){state.error=err.message||'Could not load Company Zero'}
  $('#bootScreen')?.classList.add('hide');setTimeout(()=>{if($('#bootScreen'))$('#bootScreen').style.display='none'},350);render();
  setInterval(async()=>{if(!state.active)return;const a=latestArtifact();if(!a){await hydrateActive();render()}},15000);
})();
