import {baselineOrganization, localDiagnosis, governor, localMutations, validateMutation, applyMutation, candidateScore, selectCandidate, lesson} from './engine.js';
import {executeReferenceWorkload} from './lib/runtime-core.mjs';

export class CompanyZero {
  constructor({mission, memory=[]}) { this.mission=structuredClone(mission); this.memory=[...memory]; this.org=null; this.history=[]; this.version=0; }
  async launch() { this.org=baselineOrganization(this.mission,this.memory); this.version=this.org.version; return this.snapshot('launched'); }
  async operate() {
    if(!this.org) await this.launch();
    const before=executeReferenceWorkload(this.mission,this.org);
    const diagnosis=localDiagnosis(this.mission,before);
    const decision=governor(this.mission,before,diagnosis);
    const record={at:new Date().toISOString(),before,diagnosis,decision,candidates:[],promoted:null};
    if(['restructure','repair'].includes(decision.action)){
      const valid=localMutations(this.mission,this.org,diagnosis).map(m=>validateMutation(this.mission,this.org,diagnosis,m)).filter(x=>x.ok).map(x=>x.mutation);
      for(const mutation of valid){const org=applyMutation(this.mission,this.org,mutation,++this.version);const run=executeReferenceWorkload(this.mission,org);record.candidates.push({mutation,org,run,score:candidateScore(this.mission,org,run)});}
      const chosen=selectCandidate(record.candidates);
      if(chosen){this.org=chosen.org;record.promoted=chosen;this.memory.unshift(lesson(this.mission,diagnosis,chosen));}
    }
    this.history.unshift(record); return record;
  }
  setMission(mission,{preserveOrganization=false}={}) { this.mission=structuredClone(mission); if(!preserveOrganization)this.org=null; return this.snapshot('mission_changed'); }
  snapshot(event='snapshot'){return {event,mission:this.mission,organization:this.org,memory:this.memory,history:this.history};}
}
