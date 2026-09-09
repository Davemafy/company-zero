const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';const BUCKET=process.env.CZ_ARTIFACT_BUCKET||'company-zero-artifacts';
if(!URL||!KEY){console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');process.exit(1)}
const headers={apikey:KEY,authorization:`Bearer ${KEY}`,'content-type':'application/json'};
const read=await fetch(`${URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,{headers});if(read.ok){console.log(`artifact-storage: READY (${BUCKET})`);process.exit(0)}
const create=await fetch(`${URL}/storage/v1/bucket`,{method:'POST',headers,body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:10485760})});if(!create.ok&&create.status!==409){console.error(`artifact-storage: FAILED (${create.status})`,await create.text());process.exit(1)}console.log(`artifact-storage: CREATED (${BUCKET})`);
