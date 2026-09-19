import {json} from './_utils.mjs';
import {storageMode} from '../lib/store.mjs';
import {providerConfigSnapshot} from '../lib/model-gateway.mjs';
export default function handler(req,res){
  const providers=providerConfigSnapshot();
  return json(res,200,{
    ok:true,
    platform:'vercel',
    storage:storageMode(),
    aiRuntimeConfigured:providers.gemini.configured,
    primaryRuntime:'gemini',
    tensormuxConfigured:providers.tensormux.configured,
    openrouterConfigured:providers.openrouter.configured,
    geminiConfigured:providers.gemini.configured,
    groqConfigured:providers.groq.configured,
    providers,
    neatlogsConfigured:Boolean(process.env.NEATLOGS_WRITE_KEY||process.env.NEATLOGS_API_KEY),
    zyteConfigured:Boolean(process.env.ZYTE_API_KEY),
    scrapyCloudConfigured:Boolean(process.env.SCRAPY_CLOUD_API_KEY&&process.env.SCRAPY_CLOUD_PROJECT_ID),
    pageSpeedConfigured:['1','true','yes','on'].includes(String(process.env.PAGESPEED_ENABLED||'').toLowerCase()),
    githubRepositoryConfigured:Boolean((process.env.GITHUB_TOKEN||process.env.GH_TOKEN)&&process.env.GITHUB_REPOSITORY),
    vercelDeploymentConfigured:Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID),
    model:providers.gemini.primaryModel||null,
    time:new Date().toISOString()
  });
}
