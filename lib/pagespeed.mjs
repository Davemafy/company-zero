import {DomainError,validateSchema} from './contracts.mjs';
import {safeUrl} from './capabilities.mjs';

const API='https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
export function pageSpeedConfigured(){return ['1','true','yes','on'].includes(String(process.env.PAGESPEED_ENABLED||'').toLowerCase())}
export function createPageSpeedProvider(){return{name:'PageSpeed Insights',type:'http',adapter:'pagespeed',baseUrl:API,headers:{},manifest:{capabilities:[{
  name:'measure_web_performance',description:'Independently measure a public webpage with Google PageSpeed Insights and return performance score, LCP, and transfer bytes.',endpoint:'/',method:'POST',risk:'read',operationKind:'verify',stateDomains:['software.webpage','web.performance','lcp','performance_score','transfer_bytes'],observes:['software.webpage.performance'],changes:[],permissions:['public_web.read'],reversibility:'read-only',
  inputSchema:{type:'object',required:['url','phase'],additionalProperties:false,properties:{url:{type:'string',minLength:8,maxLength:2048},phase:{type:'string',enum:['baseline','after','observation']},strategy:{type:'string',enum:['mobile','desktop']}}},
  outputSchema:{type:'object',required:['sourceUrl','observedAt','phase','metrics','externalRef'],properties:{sourceUrl:{type:'string'},observedAt:{type:'string'},phase:{type:'string'},metrics:{type:'object'},externalRef:{type:'string'}}},
  measurements:[
    {metricId:'performance_score',path:'$.metrics.performance_score',phase:'observation',externalRefPath:'$.externalRef',observedAtPath:'$.observedAt'},
    {metricId:'lcp_ms',path:'$.metrics.lcp_ms',phase:'observation',externalRefPath:'$.externalRef',observedAtPath:'$.observedAt'},
    {metricId:'transfer_bytes',path:'$.metrics.transfer_bytes',phase:'observation',externalRefPath:'$.externalRef',observedAtPath:'$.observedAt'}
  ],estimatedCost:{type:'fixed',usd:0},timeoutMs:30000,retry:{maxAttempts:2}
}]}}}

export async function invokePageSpeedCapability(cap,input,{fetchImpl=fetch}={}){
  const errors=validateSchema(cap.inputSchema,input);if(errors.length)throw new DomainError('invalid_capability_arguments',422,errors);
  const target=safeUrl(input.url),url=new URL(API);url.searchParams.set('url',target.toString());url.searchParams.set('strategy',input.strategy||'mobile');url.searchParams.append('category','performance');if(process.env.PAGESPEED_API_KEY)url.searchParams.set('key',process.env.PAGESPEED_API_KEY);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(120000,Math.max(30000,Number(process.env.PAGESPEED_TIMEOUT_MS)||60000))),started=Date.now();
  try{const response=await fetchImpl(url,{signal:controller.signal});const text=await response.text();let body;try{body=JSON.parse(text)}catch{throw new DomainError('pagespeed_invalid_json',502)}if(!response.ok)throw new DomainError(`pagespeed_http_${response.status}`,response.status>=500?502:422,{status:response.status,error:body?.error?.message});const lr=body?.lighthouseResult,a=lr?.audits||{},score=lr?.categories?.performance?.score,lcp=a['largest-contentful-paint']?.numericValue,bytes=a['total-byte-weight']?.numericValue;if(!Number.isFinite(Number(score))||!Number.isFinite(Number(lcp))||!Number.isFinite(Number(bytes)))throw new DomainError('pagespeed_metrics_missing',502);return{output:{sourceUrl:target.toString(),observedAt:new Date().toISOString(),phase:input.phase,metrics:{performance_score:Number(score)*100,lcp_ms:Number(lcp),transfer_bytes:Number(bytes)},externalRef:lr?.finalUrl||target.toString()},metadata:{provider:'pagespeed',analysisUTCTimestamp:body?.analysisUTCTimestamp||null,lighthouseVersion:lr?.lighthouseVersion||null},latencyMs:Date.now()-started}}
  catch(error){if(error?.name==='AbortError')throw new DomainError('pagespeed_timeout',504);throw error}finally{clearTimeout(timer)}
}
