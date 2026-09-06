export class CompanyZeroClient{
  constructor({baseUrl='' }={}){this.baseUrl=baseUrl.replace(/\/$/,'')}
  async health(){return this.#get('/api/health')}
  async brain(action,payload){return this.#post('/api/brain',{action,payload})}
  async run(mission,org,{live=false}={}){return this.#post('/api/runtime',{mission,org,mode:live?'live':'reference'})}
  async observe(payload){return this.#post('/api/observe',payload)}
  async #get(path){const r=await fetch(this.baseUrl+path);if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r.json()}
  async #post(path,body){const r=await fetch(this.baseUrl+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r.json()}
}
