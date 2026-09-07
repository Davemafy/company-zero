import {createScrapyCloudProvider,invokeScrapyCloudCapability} from '../lib/scrapy-cloud.mjs';
import {normalizeCapability} from '../lib/capabilities.mjs';
const cap=normalizeCapability('transport-probe',createScrapyCloudProvider().manifest.capabilities[0]);
const result=await invokeScrapyCloudCapability(cap,{url:'https://example.com',maxPages:1,allowedDomains:['example.com']},{fetchImpl:async(url,options)=>{
  const response=await fetch(url,options);
  const path=new URL(url).pathname;
  console.log(JSON.stringify({path,status:response.status,body:path.includes('/items/')?'[page content omitted]':await response.clone().text()}));
  return response;
}});
console.log(JSON.stringify({metadata:result.metadata,textLength:result.output.content.text.length}));
