import {DomainError,validateSchema} from './contracts.mjs';
import {safeUrl} from './capabilities.mjs';
import {createHash} from 'node:crypto';

export function publicHttpProbeConfigured(){return ['1','true','yes','on'].includes(String(process.env.PUBLIC_HTTP_PROBE_ENABLED||'').toLowerCase())}

export function createPublicHttpProbeProvider(){return{name:'Public HTTP verification',type:'http',adapter:'public-http-probe',baseUrl:'https://example.invalid',headers:{},manifest:{capabilities:[{
  name:'probe_public_http',description:'Measure a public HTTP resource independently from the system that changed it. Returns status, response bytes, content hash, title presence, and request latency.',endpoint:'/probe',method:'POST',risk:'read',operationKind:'verify',observes:['public_http.response','software.webpage.deployed_state'],changes:[],stateDomains:['public_http','software.webpage'],permissions:['public_web.read'],reversibility:'read-only',
  inputSchema:{type:'object',required:['url'],additionalProperties:false,properties:{url:{type:'string',minLength:8,maxLength:2048},expectedText:{type:'string',maxLength:5000},phase:{type:'string',enum:['baseline','before','after','observation']}}},
  outputSchema:{type:'object',required:['sourceUrl','observedAt','phase','metrics','contentHash'],properties:{sourceUrl:{type:'string'},observedAt:{type:'string'},phase:{type:'string'},metrics:{type:'object'},contentHash:{type:'string'},expectedTextPresent:{type:'boolean'}}},
  measurements:[
    {metricId:'http_latency_ms',path:'$.metrics.http_latency_ms',phase:'observation',externalRefPath:'$.sourceUrl',observedAtPath:'$.observedAt'},
    {metricId:'http_status',path:'$.metrics.http_status',phase:'observation',externalRefPath:'$.sourceUrl',observedAtPath:'$.observedAt'},
    {metricId:'content_bytes',path:'$.metrics.content_bytes',phase:'observation',externalRefPath:'$.sourceUrl',observedAtPath:'$.observedAt'}
  ],estimatedCost:{type:'fixed',usd:0},timeoutMs:20000,retry:{maxAttempts:2}
}]}}}

export async function invokePublicHttpProbeCapability(cap,input,{fetchImpl=fetch}={}){
  const errors=validateSchema(cap.inputSchema,input);if(errors.length)throw new DomainError('invalid_capability_arguments',422,errors);
  const url=safeUrl(input.url);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(30000,Number(cap.timeoutMs)||20000)),started=Date.now();
  try{const response=await fetchImpl(url,{method:'GET',redirect:'follow',signal:controller.signal,headers:{'user-agent':'CompanyZeroVerifier/1.0'}});const text=await response.text();if(text.length>2_000_000)throw new DomainError('probe_response_too_large',502);const observedAt=new Date().toISOString();const expected=input.expectedText==null?true:text.includes(String(input.expectedText));return{output:{sourceUrl:url.toString(),observedAt,phase:input.phase||'observation',metrics:{http_latency_ms:Date.now()-started,http_status:response.status,content_bytes:Buffer.byteLength(text)},contentHash:createHash('sha256').update(text).digest('hex'),expectedTextPresent:expected},metadata:{provider:'public-http-probe',status:response.status,phase:input.phase||'observation'},latencyMs:Date.now()-started}}
  catch(error){if(error?.name==='AbortError')throw new DomainError('public_http_probe_timeout',504);throw error}finally{clearTimeout(timer)}
}
