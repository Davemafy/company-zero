import {get} from '../lib/store.mjs';
import {loadArtifactFiles} from '../lib/deliverable-engine.mjs';
import {zipFiles} from '../lib/zip.mjs';
import {ensureBrowserSession,ownsCompany} from '../lib/session-auth.mjs';
export default async function handler(req,res){
  try{
    if(req.method!=='GET'){res.statusCode=405;return res.end('Method not allowed')}
    const browserSessionId=ensureBrowserSession(req,res);const id=String(req.query?.id||'');const mode=String(req.query?.mode||'download');const artifact=await get(id);
    if(!artifact||artifact.kind!=='artifact'){res.statusCode=404;return res.end('Artifact not found')}
    const company=await get(artifact.company_id);
    const protectedCompany=Boolean(company?.data?.ownerSessionId);
    if(protectedCompany&&!ownsCompany(company,browserSessionId)){res.statusCode=403;return res.end('Artifact access denied')}
    if(!protectedCompany&&process.env.NODE_ENV==='production'&&process.env.CZ_ALLOW_LEGACY_ARTIFACT_ACCESS!=='true'){res.statusCode=403;return res.end('Legacy artifact requires ownership migration')}
    const loaded=await loadArtifactFiles(artifact);const files=loaded?.files||[];
    if(mode==='manifest'){res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');return res.end(JSON.stringify({id:artifact.id,title:artifact.data?.title,type:artifact.data?.type,version:artifact.data?.deliverableVersion||1,deliverableRevisionId:artifact.data?.deliverableRevisionId,artifactRevisionId:artifact.data?.artifactRevisionId,previousArtifactId:artifact.data?.previousArtifactId||null,manifest:artifact.data?.manifest,files:(artifact.data?.files||[]).map(({name,mimeType,bytes,sha256})=>({name,mimeType,bytes,sha256}))}))}
    if(mode==='preview'){
      res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');
      if(artifact.data?.type==='website'){
        // Generated code never executes in the Company Zero app origin. It is rendered in an isolated opaque-origin sandbox.
        const html=inlineWebsite(files);res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob: https:; font-src data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'");return res.end(wrapper(html))
      }
      res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
      return res.end(textPreview(artifact,files));
    }
    const zip=zipFiles(files);const safe=String(artifact.data?.title||'company-zero-deliverable').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'company-zero-deliverable';
    const version=Number(artifact.data?.deliverableVersion||1);res.setHeader('content-type','application/zip');res.setHeader('content-disposition',`attachment; filename="${safe}-v${version}.zip"`);res.setHeader('cache-control','no-store');return res.end(zip)
  }catch(e){res.statusCode=e.status||500;res.end(e.message||'Artifact error')}
}
function inlineWebsite(files){const text=n=>files.find(f=>f.name===n)?.content||'';let html=text('index.html');const css=text('styles.css'),js=text('main.js');if(css)html=html.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i,`<style>${css}</style>`);if(js)html=html.replace(/<script[^>]*src=["']main\.js["'][^>]*><\/script>/i,`<script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);return html}
function wrapper(html){const escaped=JSON.stringify(String(html)).replace(/<\/script/gi,'<\\/script');return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company Zero preview</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;background:#fff}iframe{display:block}</style><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="Generated deliverable preview"></iframe><script>document.querySelector('iframe').srcdoc=${escaped}</script>`}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function textPreview(artifact,files){const textFiles=files.filter(f=>typeof f.content==='string');const body=textFiles.length?textFiles.map(f=>`<section><div class="file">${escapeHtml(f.name)}</div><pre>${escapeHtml(f.content)}</pre></section>`).join(''):`<div class="empty">This deliverable exists, but it has no browser-previewable text files. Download the bundle to inspect the files.</div>`;return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(artifact.data?.title||'Company Zero deliverable')}</title><style>body{margin:0;background:#080b08;color:#edf4e8;font:15px/1.6 ui-sans-serif,system-ui;padding:32px;max-width:980px}header{margin-bottom:28px}h1{font-size:28px;margin:6px 0}.summary{color:#a9b7a6}.file{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#a6ff4d;margin:0 0 10px}section{border:1px solid #243124;border-radius:16px;padding:20px;margin:16px 0;background:#0d120d}pre{white-space:pre-wrap;word-break:break-word;font:14px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;margin:0}.empty{border:1px solid #374237;padding:20px;border-radius:14px;color:#b5c1b2}</style></head><body><header><div class="file">Company Zero · Deliverable V${Number(artifact.data?.deliverableVersion||1)}</div><h1>${escapeHtml(artifact.data?.title||'Deliverable')}</h1><div class="summary">${escapeHtml(artifact.data?.summary||'')}</div></header>${body}</body></html>`}
