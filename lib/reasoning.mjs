const configured=()=>Boolean(process.env.TENSORMUX_BASE_URL&&process.env.TENSORMUX_API_KEY);
const base=()=>String(process.env.TENSORMUX_BASE_URL||'').replace(/\/$/,'');
const model=()=>process.env.TENSORMUX_RUNTIME_MODEL||process.env.TENSORMUX_MODEL||'glm-4-7-flash';
const configuredTimeout=()=>{const n=Number(process.env.TENSORMUX_TIMEOUT_MS||60000);return Number.isFinite(n)?Math.min(180000,Math.max(5000,n)):60000};

export async function proposeStructured({task,instructions,input,timeoutMs=configuredTimeout()}){
  if(!configured())return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(`${base()}/chat/completions`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.TENSORMUX_API_KEY}`},signal:controller.signal,body:JSON.stringify({model:model(),temperature:0,response_format:{type:'json_object'},messages:[
      {role:'system',content:`You are the ${task} proposal layer inside Company Zero. ${instructions} Return only valid JSON. Never claim an external fact that is not present in the supplied input. Mark unknown facts as unknown. Do not include chain-of-thought.`},
      {role:'user',content:JSON.stringify(input)}
    ]})});
    const text=await response.text();let body;try{body=text?JSON.parse(text):{}}catch{body={}}
    if(!response.ok)throw Object.assign(Error(`reasoning_http_${response.status}`),{details:body});
    const content=body?.choices?.[0]?.message?.content;if(!content)throw Error('reasoning_empty_response');
    const value=JSON.parse(content);return{value,model:model(),requestId:body.id||null,usage:body.usage||null};
  }finally{clearTimeout(timer)}
}

export function reasoningConfigured(){return configured()}
