import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const COOKIE='czsid';
const secret=()=>process.env.CZ_SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'company-zero-development-session-secret';
const sign=v=>createHmac('sha256',secret()).update(v).digest('base64url');
function parseCookie(req){const raw=String(req.headers?.cookie||'');const hit=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`));return hit?decodeURIComponent(hit.slice(COOKIE.length+1)):null}
function valid(raw){if(!raw)return null;const [sid,sig]=raw.split('.');if(!sid||!sig)return null;const expected=sign(sid);try{if(timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return sid}catch{}return null}
export function ensureBrowserSession(req,res){let sid=valid(parseCookie(req));if(sid)return sid;sid=randomBytes(24).toString('base64url');const secure=process.env.NODE_ENV==='production'?'; Secure':'';res.setHeader('set-cookie',`${COOKIE}=${encodeURIComponent(`${sid}.${sign(sid)}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);return sid}
export function ownsCompany(company,sessionId){return Boolean(company&&company.kind==='company'&&company.data?.ownerSessionId&&company.data.ownerSessionId===sessionId)}
export function canAccessCompany(company,sessionId,{allowLegacy=process.env.NODE_ENV!=='production'||process.env.CZ_ALLOW_LEGACY_COMPANY_ACCESS==='true'}={}){
  if(!company||company.kind!=='company')return false;
  if(company.data?.ownerSessionId)return ownsCompany(company,sessionId);
  return Boolean(allowLegacy);
}
export function assertCompanyAccess(company,sessionId,options={}){
  if(!company)throw Object.assign(Error('company_not_found'),{status:404});
  if(!canAccessCompany(company,sessionId,options))throw Object.assign(Error(company.data?.ownerSessionId?'company_access_denied':'legacy_company_requires_ownership_migration'),{status:403});
  return company;
}
