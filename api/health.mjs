import {json} from './_utils.mjs';
export default function handler(req,res){
  return json(res,200,{
    ok:true,
    platform:'vercel',
    tensormuxConfigured:Boolean(process.env.TENSORMUX_BASE_URL&&process.env.TENSORMUX_API_KEY),
    neatlogsConfigured:Boolean(process.env.NEATLOGS_WRITE_KEY||process.env.NEATLOGS_API_KEY),
    model:process.env.TENSORMUX_MODEL||null,
    time:new Date().toISOString()
  });
}
