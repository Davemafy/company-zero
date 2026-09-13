const DEFAULT_TIMEOUT_MS=2500;
const MAX_RESULTS=8;

function stripTags(value=''){
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/\s+/g,' ')
    .trim();
}

function decodeDuckDuckGoUrl(href=''){
  try{
    const raw=String(href).replace(/^\/\//,'https://');
    const url=new URL(raw,'https://duckduckgo.com');
    const redirected=url.searchParams.get('uddg');
    const candidate=redirected?decodeURIComponent(redirected):url.href;
    const out=new URL(candidate);
    if(!['http:','https:'].includes(out.protocol))return null;
    if(/(^|\.)duckduckgo\.com$/i.test(out.hostname))return null;
    return out.href;
  }catch{return null}
}

export function parseDuckDuckGoHtml(html,{limit=MAX_RESULTS}={}){
  const text=String(html||'');
  const results=[];
  const seen=new Set();
  const linkRe=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while((match=linkRe.exec(text))&&results.length<limit){
    const url=decodeDuckDuckGoUrl(match[1]);
    if(!url||seen.has(url))continue;
    seen.add(url);
    const title=stripTags(match[2]);
    const tail=text.slice(match.index,Math.min(text.length,match.index+2600));
    const snippetMatch=tail.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
    const snippet=stripTags(snippetMatch?.[1]||'');
    results.push({title:title||new URL(url).hostname,url,snippet});
  }
  return results;
}

async function fetchWithTimeout(url,{timeoutMs=DEFAULT_TIMEOUT_MS,fetchImpl=fetch}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetchImpl(url,{signal:controller.signal,redirect:'follow',headers:{
      'user-agent':'Mozilla/5.0 (compatible; CompanyZero/1.0; +https://companyzero-hq.vercel.app)',
      'accept':'text/html,application/xhtml+xml'
    }});
  }finally{clearTimeout(timer)}
}

function queryVariants(request){
  const text=String(request||'').replace(/\s+/g,' ').trim().slice(0,280);
  if(!text)return[];
  const lower=text.toLowerCase();
  const variants=[text];
  if(/\b(find|discover|research|leads?|clients?|customers?|prospects?)\b/.test(lower)){
    variants.push(`${text} company website contact`);
    variants.push(`${text} business linkedin`);
  }else{
    variants.push(`${text} official source`);
  }
  return [...new Set(variants)].slice(0,3);
}

export async function searchPublicWeb(request,{limit=MAX_RESULTS,timeoutMs=DEFAULT_TIMEOUT_MS,fetchImpl=fetch}={}){
  const queries=queryVariants(request);
  if(!queries.length)return {ok:false,queries:[],results:[],reason:'empty_query'};
  const perQuery=Math.max(3,Math.ceil(limit/Math.max(1,queries.length)));
  const settled=await Promise.allSettled(queries.map(async query=>{
    const url=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response=await fetchWithTimeout(url,{timeoutMs,fetchImpl});
    if(!response.ok)throw new Error(`search_http_${response.status}`);
    const html=await response.text();
    return {query,results:parseDuckDuckGoHtml(html,{limit:perQuery})};
  }));
  const merged=[];const seen=new Set();
  for(const item of settled){
    if(item.status!=='fulfilled')continue;
    for(const result of item.value.results){
      if(seen.has(result.url))continue;
      seen.add(result.url);merged.push({...result,query:item.value.query});
      if(merged.length>=limit)break;
    }
    if(merged.length>=limit)break;
  }
  return {ok:merged.length>0,queries,results:merged,reason:merged.length?'ok':'search_unavailable'};
}
