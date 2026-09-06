import {get} from '../lib/store.mjs';
import {zipFiles} from '../lib/zip.mjs';
export default async function handler(req,res){
  try{
    if(req.method!=='GET'){res.statusCode=405;return res.end('Method not allowed')}
    const id=String(req.query?.id||'');const mode=String(req.query?.mode||'download');const artifact=await get(id);
    if(!artifact||artifact.kind!=='artifact'){res.statusCode=404;return res.end('Artifact not found')}
    const files=artifact.data?.files||[];
    if(mode==='preview'&&artifact.data?.type==='website'){
      const html=inlineWebsite(files);res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('content-security-policy',"default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'none'; frame-ancestors 'none'");return res.end(html)
    }
    const zip=zipFiles(files);const safe=String(artifact.data?.title||'company-zero-deliverable').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'company-zero-deliverable';
    res.setHeader('content-type','application/zip');res.setHeader('content-disposition',`attachment; filename="${safe}.zip"`);res.setHeader('cache-control','no-store');return res.end(zip)
  }catch(e){res.statusCode=e.status||500;res.end(e.message||'Artifact error')}
}
function inlineWebsite(files){const find=n=>files.find(f=>f.name===n)?.content||'';let html=find('index.html');const css=find('styles.css'),js=find('main.js');if(css)html=html.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/i,`<style>${css}</style>`);if(js)html=html.replace(/<script[^>]*src=["']main\.js["'][^>]*><\/script>/i,`<script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);return html}
