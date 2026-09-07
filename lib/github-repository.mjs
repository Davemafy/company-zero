import {DomainError,validateSchema} from './contracts.mjs';
import {createHash} from 'node:crypto';

const API=()=>process.env.GITHUB_API_URL||'https://api.github.com';
const TOKEN=()=>process.env.GITHUB_TOKEN||process.env.GH_TOKEN||'';
const REPO=()=>process.env.GITHUB_REPOSITORY||'';
const BRANCH=()=>process.env.GITHUB_BRANCH||'';
const USER_AGENT='company-zero-runtime';

export function githubRepositoryConfigured(){return Boolean(TOKEN()&&/^[-\w.]+\/[-\w.]+$/.test(REPO()))}

export function createGitHubRepositoryProvider(){
  const [owner,repo]=REPO().split('/');
  return {name:'GitHub repository mutation',type:'http',adapter:'github-repository',baseUrl:API(),headers:{},config:{owner,repo,branch:BRANCH()||null},manifest:{capabilities:[{
    name:'commit_repository_file',
    description:'Create or update one UTF-8 text file in the configured repository using GitHub Contents API. Repository target is fixed by runtime configuration. The action is bounded, attributable, idempotent by invocation key, and requires approval.',
    endpoint:'/repos/{owner}/{repo}/contents/{path}',method:'PUT',risk:'external_side_effect',operationKind:'change',
    observes:['software.repository.current_file'],changes:['software.repository.file_content','software.webpage.source'],stateDomains:['software.repository','software.webpage'],
    permissions:['repository.write'],approvalRequired:true,reversibility:'append-only git history / revertable commit',
    inputSchema:{type:'object',required:['path','content','message'],additionalProperties:false,properties:{path:{type:'string',minLength:1,maxLength:512},content:{type:'string',maxLength:750000},message:{type:'string',minLength:3,maxLength:200},branch:{type:'string',maxLength:200}}},
    outputSchema:{type:'object',required:['repository','path','commitSha','contentSha','externalRef','observedAt'],properties:{repository:{type:'string'},path:{type:'string'},commitSha:{type:'string'},contentSha:{type:'string'},externalRef:{type:'string'},observedAt:{type:'string'}}},
    estimatedCost:{type:'fixed',usd:0},timeoutMs:20000,retry:{maxAttempts:1}
  }]}};
}

export async function invokeGitHubRepositoryCapability(cap,input,{fetchImpl=fetch,idempotencyKey=null}={}){
  const errors=validateSchema(cap.inputSchema,input);if(errors.length)throw new DomainError('invalid_capability_arguments',422,errors);
  if(!githubRepositoryConfigured())throw new DomainError('github_repository_not_configured',503);
  const [owner,repo]=REPO().split('/');
  const path=normalizePath(input.path);const branch=String(input.branch||BRANCH()||'').trim()||null;
  const url=new URL(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,API());
  if(branch)url.searchParams.set('ref',branch);
  const headers={authorization:`Bearer ${TOKEN()}`,'accept':'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':USER_AGENT};
  const current=await fetchImpl(url,{headers});let currentBody=null;
  if(current.status!==404){const text=await current.text();try{currentBody=JSON.parse(text)}catch{throw new DomainError('github_read_malformed_response',502)}if(!current.ok)throw new DomainError(`github_read_http_${current.status}`,current.status>=500?502:422,{status:current.status,response:currentBody})}
  const desired=Buffer.from(String(input.content),'utf8').toString('base64');
  if(currentBody?.content&&String(currentBody.encoding)==='base64'){
    const existing=String(currentBody.content).replace(/\s/g,'');
    if(existing===desired){return{output:{repository:REPO(),path,commitSha:String(currentBody.sha),contentSha:String(currentBody.sha),externalRef:String(currentBody.html_url||`https://github.com/${REPO()}/blob/${branch||'HEAD'}/${path}`),observedAt:new Date().toISOString(),idempotentNoop:true},metadata:{provider:'github',idempotencyKey,idempotentNoop:true},latencyMs:0}}
  }
  const body={message:String(input.message),content:desired};if(currentBody?.sha)body.sha=currentBody.sha;if(branch)body.branch=branch;
  if(idempotencyKey)body.message=`${body.message} [cz:${createHash('sha256').update(String(idempotencyKey)).digest('hex').slice(0,12)}]`;
  let response;try{response=await fetchImpl(url,{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)})}catch(error){error.uncertainSideEffect=true;throw error}
  const text=await response.text();let out;try{out=JSON.parse(text)}catch{const e=new DomainError('github_write_malformed_response',502);e.uncertainSideEffect=response.status>=500;throw e}
  if(!response.ok){const e=new DomainError(`github_write_http_${response.status}`,response.status>=500?502:422,{status:response.status,response:out});if(response.status>=500)e.uncertainSideEffect=true;throw e}
  return{output:{repository:REPO(),path,commitSha:String(out.commit?.sha||''),contentSha:String(out.content?.sha||''),externalRef:String(out.commit?.html_url||out.content?.html_url||''),observedAt:new Date().toISOString(),idempotentNoop:false},metadata:{provider:'github',commitUrl:out.commit?.html_url||null,idempotencyKey},latencyMs:0};
}

function normalizePath(value){const raw=String(value||'').replace(/\\/g,'/').replace(/^\/+/, '');if(!raw||raw.includes('..')||raw.startsWith('.git/'))throw new DomainError('github_path_not_allowed',422);return raw}
