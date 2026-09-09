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
    if(mode==='preview'&&artifact.data?.type==='website'){
      // Generated code never executes in the Company Zero app origin. It is rendered in an isolated opaque-origin sandbox.
      const html=inlineWebsite(files);res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob: https:; font-src data: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'");return res.end(wrapper(html))
    }
    const zip=zipFiles(files);const safe=String(artifact.data?.title||'company-zero-deliverable').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'company-zero-deliverable';
    const version=Number(artifact.data?.deliverableVersion||1);res.setHeader('content-type','application/zip');res.setHeader('content-disposition',`attachment; filename="${safe}-v${version}.zip"`);res.setHeader('cache-control','no-store');return res.end(zip)
  }catch(e){res.statusCode=e.status||500;res.end(e.message||'Artifact error')}
}
function inlineWebsite(files){const text=n=>files.find(f=>f.name===n)?.content||'';let html=text('index.html');const css=text('styles.css'),js=text('main.js');if(css)html=html.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i,`<style>${css}</style>`);if(js)html=html.replace(/<script[^>]*src=["']main\.js["'][^>]*><\/script>/i,`<script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);return html}
function wrapper(html){const escaped=JSON.stringify(String(html)).replace(/<\/script/gi,'<\\/script');return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company Zero preview</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;background:#fff}iframe{display:block}</style><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="Generated deliverable preview"></iframe><script>document.querySelector('iframe').srcdoc=${escaped}</script>`}
