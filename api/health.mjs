import {json} from './_utils.mjs';
import {storageMode} from '../lib/store.mjs';
export default function handler(req,res){
  return json(res,200,{
    ok:true,
    platform:'vercel',
    storage:storageMode(),
    tensormuxConfigured:Boolean(process.env.TENSORMUX_BASE_URL&&process.env.TENSORMUX_API_KEY),
    neatlogsConfigured:Boolean(process.env.NEATLOGS_WRITE_KEY||process.env.NEATLOGS_API_KEY),
    zyteConfigured:Boolean(process.env.ZYTE_API_KEY),
    scrapyCloudConfigured:Boolean(process.env.SCRAPY_CLOUD_API_KEY&&process.env.SCRAPY_CLOUD_PROJECT_ID),
    pageSpeedConfigured:['1','true','yes','on'].includes(String(process.env.PAGESPEED_ENABLED||'').toLowerCase()),
    githubRepositoryConfigured:Boolean((process.env.GITHUB_TOKEN||process.env.GH_TOKEN)&&process.env.GITHUB_REPOSITORY),
    vercelDeploymentConfigured:Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID),
    model:process.env.TENSORMUX_MODEL||null,
    time:new Date().toISOString()
  });
}
