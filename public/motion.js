export const ease=value=>{const t=Math.max(0,Math.min(1,value));return t*t*t*(10-15*t+6*t*t);};
export const span=(time,start,end)=>ease((time-start)/(end-start));
export const sequences={
 onboard:{duration:5.4,cues:[[.75,'touch'],[1.35,'prepare'],[2.35,'offer'],[3.15,'contact'],[3.5,'release']]},
 submit:{duration:5.6,cues:[[.1,'submit'],[1.6,'contact'],[1.9,'grasp'],[2.95,'place'],[3.7,'scan'],[5.1,'scanned']]},
 return:{duration:4.0,cues:[[.05,'scanner-open'],[.35,'retrieve'],[.8,'offer'],[2.0,'contact'],[2.3,'release']]},
 result:{duration:6.5,cues:[[.05,'print'],[2.35,'stamp'],[4.5,'return'],[5.0,'contact'],[5.25,'release']]}
};
export class SequenceClock{
 constructor(name,onCue=()=>{}){if(!sequences[name])throw Error('Unknown sequence');this.name=name;this.spec=sequences[name];this.onCue=onCue;this.fired=new Set();this.time=0;}
 advance(time){this.time=Math.max(this.time,Math.min(time,this.spec.duration));for(const [at,cue]of this.spec.cues)if(this.time>=at&&!this.fired.has(at)){this.fired.add(at);this.onCue(cue);}return this.time>=this.spec.duration;}
 get duration(){return this.spec.duration;}
}
export function paperOwner(name,time){
 const cues=sequences[name]?.cues;if(!cues)throw Error('Unknown sequence');const at=key=>cues.find(c=>c[1]===key)?.[0]??Infinity;
 if(name==='submit'){if(time>=at('place'))return 'scanner';if(time>=at('grasp'))return 'detective';if(time>=at('contact'))return 'shared';return 'visitor';}
 if(name==='return'&&time<at('retrieve'))return 'scanner';
 if(name==='result'&&time<1.2)return 'printer';
 if(time>=at('release'))return 'visitor';if(time>=at('contact'))return 'shared';return 'detective';
}
