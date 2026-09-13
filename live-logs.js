const LOG_POLL_MS=1500;
let lastCompany='';
let lastSession='';
let lastRendered='';
let inflight=false;

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>{try{return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}catch{return''}};

function sessionFromRecords(records=[]){
  return records.filter(x=>x.kind==='operating_session').sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]?.id||'';
}

function humanEvent(evt){
  const d=evt?.data||{};
  return {
    id:evt.id,
    type:String(d.type||'UPDATE'),
    message:String(d.message||d.data?.message||String(d.type||'Update').replaceAll('_',' ').toLowerCase()),
    at:d.occurredAt||evt.created_at||evt.updated_at
  };
}

function panelHtml(events=[]){
  const recent=events.slice(-10).reverse();
  return `<section class="cz-live-log-panel" aria-live="polite">
    <div class="cz-live-log-head"><div><span class="eyebrow">LIVE LOG</span><strong>What Company Zero is doing</strong></div><span class="cz-live-pulse"><i></i> live</span></div>
    <div class="cz-live-log-list">
      ${recent.length?recent.map((e,i)=>`<div class="cz-live-log-row ${i===0?'latest':''}"><span class="cz-live-log-time">${escapeHtml(time(e.at))}</span><span class="cz-live-log-dot"></span><div><strong>${escapeHtml(e.message)}</strong><small>${escapeHtml(e.type.replaceAll('_',' ').toLowerCase())}</small></div></div>`).join(''):'<div class="cz-live-log-empty">Waiting for the first real runtime event…</div>'}
    </div>
  </section>`;
}

function ensureStyles(){
  if(document.getElementById('cz-live-log-styles'))return;
  const style=document.createElement('style');style.id='cz-live-log-styles';style.textContent=`
  .cz-live-log-panel{margin:18px 0 92px;border:1px solid rgba(121,255,57,.16);background:rgba(7,14,8,.78);border-radius:18px;padding:18px 20px;backdrop-filter:blur(12px)}
  .cz-live-log-head{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:14px}.cz-live-log-head>div{display:flex;flex-direction:column;gap:5px}.cz-live-log-head strong{font-size:14px;font-weight:650;color:#eef7eb}.cz-live-pulse{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:#9cff3d;text-transform:uppercase;letter-spacing:.11em}.cz-live-pulse i{width:7px;height:7px;border-radius:999px;background:#9cff3d;box-shadow:0 0 0 5px rgba(156,255,61,.08);animation:czPulse 1.4s ease-in-out infinite}
  .cz-live-log-list{display:flex;flex-direction:column}.cz-live-log-row{display:grid;grid-template-columns:72px 12px 1fr;gap:10px;align-items:start;padding:10px 0;border-top:1px solid rgba(255,255,255,.05);opacity:.68}.cz-live-log-row.latest{opacity:1}.cz-live-log-time{font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#738174}.cz-live-log-dot{width:7px;height:7px;border-radius:50%;background:#667367;margin-top:5px}.cz-live-log-row.latest .cz-live-log-dot{background:#9cff3d;box-shadow:0 0 12px rgba(156,255,61,.5)}.cz-live-log-row strong{display:block;font-size:13px;line-height:1.45;font-weight:550;color:#e5eee2}.cz-live-log-row small{display:block;margin-top:3px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#69766a}.cz-live-log-empty{padding:12px 0;color:#758076;font-size:13px}@keyframes czPulse{50%{opacity:.35;transform:scale(.82)}}
  @media(max-width:760px){.cz-live-log-panel{margin:14px 0 110px;padding:15px}.cz-live-log-row{grid-template-columns:58px 10px 1fr;gap:8px}.cz-live-log-head strong{font-size:13px}}
  `;document.head.appendChild(style);
}

function mount(events){
  ensureStyles();
  const work=document.querySelector('.premium-work');
  if(!work)return;
  let panel=document.querySelector('.cz-live-log-panel');
  const html=panelHtml(events);
  if(html===lastRendered&&panel)return;
  lastRendered=html;
  const wrap=document.createElement('div');wrap.innerHTML=html;const next=wrap.firstElementChild;
  if(panel)panel.replaceWith(next);
  else{
    const composer=document.querySelector('.composer-wrap');
    if(composer&&composer.parentElement===work)work.insertBefore(next,composer);
    else work.appendChild(next);
  }
}

async function poll(){
  if(inflight)return;
  const companyId=localStorage.cz_active||'';
  if(!companyId){lastCompany='';lastSession='';return}
  inflight=true;
  try{
    if(companyId!==lastCompany){lastCompany=companyId;lastSession='';lastRendered=''}
    const [companyRes,eventRes]=await Promise.all([
      fetch(`/api/v1/companies/${encodeURIComponent(companyId)}`,{cache:'no-store'}),
      fetch(`/api/v1/companies/${encodeURIComponent(companyId)}/runtime-events`,{cache:'no-store'})
    ]);
    if(!companyRes.ok||!eventRes.ok)return;
    const company=await companyRes.json();const payload=await eventRes.json();
    if(!lastSession)lastSession=sessionFromRecords(company.records||[]);
    const events=(payload.items||[]).filter(x=>!lastSession||x.data?.sessionId===lastSession).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))).map(humanEvent);
    mount(events);
    const terminal=events.at(-1)?.type;
    if(['RESULT_READY','RESULT_PARTIAL'].includes(terminal)){
      window.dispatchEvent(new CustomEvent('cz:result-ready',{detail:{companyId,sessionId:lastSession,type:terminal}}));
    }
  }catch{}finally{inflight=false}
}

const observer=new MutationObserver(()=>{if(location.hash==='#work'||document.querySelector('.premium-work'))poll()});
observer.observe(document.documentElement,{subtree:true,childList:true});
setInterval(poll,LOG_POLL_MS);
window.addEventListener('hashchange',poll);
window.addEventListener('storage',poll);
window.addEventListener('cz:result-ready',()=>{const refresh=document.getElementById('refresh');if(refresh)refresh.click()});
poll();
