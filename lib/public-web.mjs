const DEFAULT_TIMEOUT_MS=2200;
const MAX_RESULTS=10;

function decodeEntities(value=''){
  return String(value)
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&#x2F;/gi,'/')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)||32));
}

function stripTags(value=''){
  return decodeEntities(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ')
    .trim();
}

function cleanUrl(value=''){
  try{const url=new URL(String(value).trim());if(!['http:','https:'].includes(url.protocol))return null;return url.href}catch{return null}
}

function decodeDuckDuckGoUrl(href=''){
  try{
    const raw=String(href).replace(/^\/\//,'https://');const url=new URL(raw,'https://duckduckgo.com');
    const redirected=url.searchParams.get('uddg');const candidate=redirected?decodeURIComponent(redirected):url.href;const out=new URL(candidate);
    if(!['http:','https:'].includes(out.protocol)||/(^|\.)duckduckgo\.com$/i.test(out.hostname))return null;return out.href;
  }catch{return null}
}

export function parseDuckDuckGoHtml(html,{limit=MAX_RESULTS}={}){
  const text=String(html||'');const results=[];const seen=new Set();
  const linkRe=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let match;
  while((match=linkRe.exec(text))&&results.length<limit){
    const url=decodeDuckDuckGoUrl(match[1]);if(!url||seen.has(url))continue;seen.add(url);
    const title=stripTags(match[2]);const tail=text.slice(match.index,Math.min(text.length,match.index+2600));
    const snippetMatch=tail.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
    results.push({title:title||new URL(url).hostname,url,snippet:stripTags(snippetMatch?.[1]||'')});
  }
  return results;
}

export function parseBingRss(xml,{limit=MAX_RESULTS}={}){
  const text=String(xml||'');const results=[];const seen=new Set();const itemRe=/<item>([\s\S]*?)<\/item>/gi;let match;
  while((match=itemRe.exec(text))&&results.length<limit){
    const item=match[1];const title=stripTags(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'');
    const rawLink=decodeEntities(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]||'').trim();const url=cleanUrl(rawLink);if(!url||seen.has(url))continue;seen.add(url);
    const snippet=stripTags(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1]||'');results.push({title:title||new URL(url).hostname,url,snippet});
  }
  return results;
}

async function fetchWithTimeout(url,{timeoutMs=DEFAULT_TIMEOUT_MS,fetchImpl=fetch,accept='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetchImpl(url,{signal:controller.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; CompanyZero/1.0; +https://companyzero-hq.vercel.app)','accept':accept,'accept-language':'en-US,en;q=0.8'}})}finally{clearTimeout(timer)}
}

function leadIntentQueries(text){
  const normalized=String(text||'').replace(/\s+/g,' ').trim();
  const brandMatch=normalized.match(/\b(?:brand|business|company|store|shop)\s+([a-z0-9][a-z0-9&'._-]{1,50})\b/i);
  const brand=brandMatch?.[1]||'';
  const businessTail=normalized.match(/\bfor\s+(?:my|our|the)\s+(.+)$/i)?.[1]?.replace(/[?.!]+$/,'').trim()||'';
  const subject=businessTail||normalized
    .replace(/^\s*(?:please\s+)?(?:find|discover|research|look\s*up)\s+(?:me\s+)?(?:\d+\s+)?(?:serious\s+|qualified\s+|potential\s+)?(?:clients?|customers?|leads?|prospects?)\s*(?:for\s+)?/i,'')
    .trim();
  const queries=[];
  if(brand){
    queries.push(`"${brand}" brand official website`);
    if(subject)queries.push(`"${brand}" ${subject} customers retailers distributors`);
    queries.push(`"${brand}" stockists retailers wholesale`);
  }
  if(subject){
    queries.push(`${subject} retailers distributors buyers`);
    queries.push(`${subject} wholesale stockists marketplace`);
  }
  return queries.filter(Boolean);
}

function queryVariants(request){
  const text=String(request||'').replace(/\s+/g,' ').trim().slice(0,260);if(!text)return[];
  const lower=text.toLowerCase();let variants=[];
  if(/\b(clients?|customers?|leads?|prospects?|sponsors?)\b/.test(lower))variants=leadIntentQueries(text);
  if(!variants.length){variants=[text];if(/\b(find|discover|research|look up|check|verify|compare|investigate)\b/.test(lower))variants.push(`${text} official source`)}
  return [...new Set(variants)].slice(0,4);
}

async function searchBing(query,{limit,timeoutMs,fetchImpl}){
  const url=`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;const response=await fetchWithTimeout(url,{timeoutMs,fetchImpl,accept:'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'});
  if(!response.ok)throw new Error(`bing_http_${response.status}`);return parseBingRss(await response.text(),{limit});
}
async function searchDuckDuckGo(query,{limit,timeoutMs,fetchImpl}){
  const url=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;const response=await fetchWithTimeout(url,{timeoutMs,fetchImpl});
  if(!response.ok)throw new Error(`duckduckgo_http_${response.status}`);return parseDuckDuckGoHtml(await response.text(),{limit});
}

function scoreResult(result,request){
  let score=0;const hay=`${result.title||''} ${result.snippet||''} ${result.url||''}`.toLowerCase();
  const words=String(request||'').toLowerCase().match(/[a-z0-9]{4,}/g)||[];
  for(const word of [...new Set(words)])if(hay.includes(word))score+=1;
  if(/official|company|brand|shop|store|retail|wholesale|distributor|market|business|contact/.test(hay))score+=1;
  if(/find your phone|find devices|find a grave|dictionary|definition|wikipedia/.test(hay))score-=5;
  return score;
}

export async function searchPublicWeb(request,{limit=MAX_RESULTS,timeoutMs=DEFAULT_TIMEOUT_MS,fetchImpl=fetch}={}){
  const queries=queryVariants(request);if(!queries.length)return {ok:false,queries:[],results:[],reason:'empty_query'};
  const perQuery=Math.max(4,Math.ceil((limit+4)/Math.max(1,queries.length)));
  const settled=await Promise.allSettled(queries.map(async query=>{
    const providers=await Promise.allSettled([searchBing(query,{limit:perQuery,timeoutMs,fetchImpl}),searchDuckDuckGo(query,{limit:perQuery,timeoutMs,fetchImpl})]);
    const results=[];const seen=new Set();for(const provider of providers){if(provider.status!=='fulfilled')continue;for(const item of provider.value){if(seen.has(item.url))continue;seen.add(item.url);results.push(item);if(results.length>=perQuery)break}}return {query,results};
  }));
  const merged=[];const seen=new Set();for(const item of settled){if(item.status!=='fulfilled')continue;for(const result of item.value.results){if(seen.has(result.url))continue;seen.add(result.url);merged.push({...result,query:item.value.query,score:scoreResult(result,request)})}}
  merged.sort((a,b)=>b.score-a.score);const selected=merged.filter(x=>x.score>=0).slice(0,limit);
  return {ok:selected.length>0,queries,results:selected,reason:selected.length?'ok':'search_unavailable'};
}
