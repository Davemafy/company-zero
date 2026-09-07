import assert from 'node:assert/strict';
import {createGitHubRepositoryProvider,invokeGitHubRepositoryCapability} from '../lib/github-repository.mjs';
import {normalizeCapability} from '../lib/capabilities.mjs';

process.env.GITHUB_TOKEN='test-token';process.env.GITHUB_REPOSITORY='owner/repo';process.env.GITHUB_BRANCH='main';
const raw=createGitHubRepositoryProvider().manifest.capabilities[0],cap=normalizeCapability('provider',raw);
let stored=null,puts=0;
const fetchImpl=async(_url,opts={})=>{
  if(!opts.method||opts.method==='GET'){
    if(!stored)return new Response(JSON.stringify({message:'Not Found'}),{status:404,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({sha:'content-sha',encoding:'base64',content:Buffer.from(stored).toString('base64'),html_url:'https://github.test/blob'}),{status:200,headers:{'content-type':'application/json'}})
  }
  puts++;const body=JSON.parse(opts.body);stored=Buffer.from(body.content,'base64').toString('utf8');return new Response(JSON.stringify({content:{sha:'content-sha',html_url:'https://github.test/blob'},commit:{sha:'commit-sha',html_url:'https://github.test/commit'}}),{status:200,headers:{'content-type':'application/json'}})
};
const input={path:'verification.txt',content:'Company Zero verified',message:'verification change',branch:'main'};
const first=await invokeGitHubRepositoryCapability(cap,input,{fetchImpl,idempotencyKey:'job:step'});assert.equal(first.output.commitSha,'commit-sha');assert.equal(puts,1);
const second=await invokeGitHubRepositoryCapability(cap,input,{fetchImpl,idempotencyKey:'job:step'});assert.equal(second.output.idempotentNoop,true);assert.equal(puts,1,'idempotent retry created a duplicate repository side effect');
console.log('github-repository-capability: PASS');
