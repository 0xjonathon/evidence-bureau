import {createActors} from './standard-actors.mjs';
import {poseDetective} from '../../public/standard-actor.js';
import {detectivePerformance} from '../../public/detective-performance.js';
import {createDeskPhysics} from '../../public/desk-physics.js';
import {V,TIMES,PLAYBACK_SPEED,DESK_PAPER,SCAN_PAPER,deskTask} from '../../public/desk-layout.js';
import {pose,life} from '../../public/clips.js';
export async function simulateRuntime(verdict='supported',{fps=40,onFrame=()=>{},cancel=false}={}){
 const {detective:actor}=createActors(),physics=await createDeskPhysics();let clock=0,work=0,body=1.36,rootX=0,offset=V(),previous=null;const maxima={jointStep:0,contactMiss:0,heldMiss:0,shoulderTwist:0,forearmTwist:0,wristBend:0},events=[];
 const stages=[{state:'greet',duration:2.5},{name:'submit'},{state:'search',duration:2.5},{name:cancel?'return':'result'},{state:cancel?'writing':'holding-report',duration:2.5}];
 try{for(const stage of stages){const {name,state=name?'sequence':'greet'}=stage;if(name==='result')physics.newSheet(deskTask(name,0).point);const duration=name?TIMES[name]/PLAYBACK_SPEED:stage.duration;
  for(let i=0;i<duration*fps;i++){
   const dt=1/fps,t=name?Math.min(i*dt*PLAYBACK_SPEED,TIMES[name]):0,task=deskTask(name,t),moving=!!name;clock+=dt;work+=(Number(moving)-work)*(1-Math.exp(-4.8*dt));body+=((moving?1.48:1.36)-body)*(1-Math.exp(-3.2*dt));rootX+=(task.root+(moving?.12:0)-rootX)*(1-Math.exp(-8*dt));actor.root.position.set(rootX,body,-.75);actor.root.updateMatrixWorld(true);
   const physical=physics.step(dt*(name?PLAYBACK_SPEED:1),name?task.point:state==='search'?SCAN_PAPER:DESK_PAPER,name?task.held||task.owner==='instrument':false),paper=physical.position;
   const performance=detectivePerformance({name,state,time:t,clock,workBlend:work,paper,verdict}),grips=Object.fromEntries(Object.entries(performance.grips).map(([side,g])=>[side,{...g,position:actor.root.worldToLocal(g.position.clone())}]));
   const response=poseDetective(actor,{...pose('idle',clock),headX:moving?.27:.02,headY:0},life(clock),{},grips,performance.context);
   if(task.held&&actor.arms.r.graspAnchor)offset=actor.arms.r.wrist.localToWorld(actor.arms.r.graspAnchor.clone()).sub(performance.grips.r.position);else offset.multiplyScalar(Math.exp(-18*dt));const renderedPaper=paper.clone().add(offset);
   const tool=performance.tool;if(tool){const actual=actor.arms.l.wrist.localToWorld(actor.arms.l.graspAnchor.clone());tool.actualPosition=tool.position.clone().add(actual.sub(performance.grips.l.position).multiplyScalar(tool.weight));}
   maxima.contactMiss=Math.max(maxima.contactMiss,response.miss);if(task.held)maxima.heldMiss=Math.max(maxima.heldMiss,response.miss);
   const bones=Object.values(actor.arms).flatMap(a=>[a.upper,a.lower,a.wrist]),quats=bones.map(b=>b.quaternion.clone());if(previous)for(let j=0;j<quats.length;j++){const angle=quats[j].angleTo(previous[j]);if(angle>maxima.jointStep){maxima.jointStep=angle;maxima.jointStepAt={name,state,t,bone:bones[j].name};}}previous=quats;
   for(const a of Object.values(actor.arms)){maxima.shoulderTwist=Math.max(maxima.shoulderTwist,a.upperRoll);maxima.forearmTwist=Math.max(maxima.forearmTwist,Math.abs(a.forearmRoll));maxima.wristBend=Math.max(maxima.wristBend,a.wristBend);}
   onFrame({actor,name,state,t,dt,clock,task,performance,paper,renderedPaper,tool,physical,response});
  }
 }return {maxima,events,actor};}finally{physics.dispose();}
}
