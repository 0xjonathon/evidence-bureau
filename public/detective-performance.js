import {V,PRINTER_PAPER,smooth,path,deskTask} from './desk-layout.js';
import {carryingContact,stampAction,stampGripPoint,stampGripNormal,penAction,penGripPoint,crossAction,paperPoint} from './desk-performance.js';
const UP=V(0,1,0),FRONT=V(0,0,1);
// Contact strength and arm travel have different timings. Opening the fingers
// must never teleport the arm back to its resting pose.
export function detectivePerformance({name=null,state='greet',time:t=0,clock=0,workBlend=0,paper,verdict,annotationTip}){
 const moving=!!name&&name!=='onboard',task=deskTask(name,t),rest={l:V(-.47,1.85,.12),r:V(.43,1.85,.18)},chin=V(-.13,2.34,0),tap=V(.45,1.60+.010*(.5+.5*Math.sin(clock*2.6)),.35);
 const grip=(position,kind=null,weight=1,normal=UP,forward=FRONT)=>({position,forward:forward.clone(),normal:normal.clone(),kind,weight});
 const grips={l:grip(chin.clone().lerp(rest.l,workBlend),null,1,V(0,-Math.sin(workBlend*Math.PI/2),Math.cos(workBlend*Math.PI/2)),V(0,Math.cos(workBlend*Math.PI/2),Math.sin(workBlend*Math.PI/2))),r:grip(tap.lerp(rest.r,workBlend))};let tool=null;
 if(moving){
  const c=carryingContact(name,paper,task.grip);let target=grips.r.position.clone().lerp(c.position,task.grip);
  if(name==='result'&&t<3.1){const pickup=carryingContact(name,PRINTER_PAPER).position;target=path(t,[[0,grips.r.position],[.7,grips.r.position],[1.7,V(.85,2.05,.75)],[2.55,pickup],[3.1,pickup]]);}
  if(name==='submit'&&t>=6.35){const release=c.position.clone();target=path(t,[[6.35,release],[6.65,release.clone().add(V(0,.08,0))],[7.65,V(.95,2.48,.30)],[8.5,grips.r.position]]);}
  if(name==='result'&&t>=7.25&&t<13.2)target=c.position.clone().lerp(rest.r,smooth(t,7.25,8.5));
  if(name==='result'&&t>=17.75)target=c.position.clone().lerp(grips.r.position,smooth(t,17.75,18.4));
  if(name==='return'&&t<2.2)target=path(t,[[0,grips.r.position],[.6,V(.65,2.40,.25)],[1.3,V(1.15,2.65,-.50)],[1.9,c.position.clone().add(V(0,.08,0))],[2.2,c.position]]);
  if(name==='return'&&t>=8.15)target=c.position.clone().lerp(grips.r.position,smooth(t,8.15,9.2));
  grips.r=grip(target,task.grip>.0001?c.kind:null,task.grip,c.normal,grips.r.forward.clone().lerp(c.forward,task.grip).normalize());
 }
 if(name==='result'&&t>=7.25&&t<14.3){
  if(verdict==='supported'){
   const action=stampAction(t,paper),point=stampGripPoint(action.position),travel=smooth(t,7.25,8.20)*(1-smooth(t,13.2,14.3));
   grips.l=grip(rest.l.clone().lerp(point,travel).add(V(0,.08*Math.sin(travel*Math.PI),0)),'stamp',action.weight,stampGripNormal(action.weight));grips.l.orientationWeight=travel;grips.l.anchorBlend=travel;tool={kind:'stamp',...action};
  }else{
   const cross=crossAction(t,paper),tip=verdict==='refuted'?cross.tip:annotationTip||paperPoint(paper,160,470,.004),action=penAction(t,paper,tip),travel=smooth(t,7.25,8.20)*(1-smooth(t,13.5,14.3));
   grips.l={...grip(rest.l.clone().lerp(penGripPoint(action.position,action.axis),travel).add(V(0,.08*Math.sin(travel*Math.PI),0)),'pen',action.weight),wristFlex:action.wristFlex,flatness:action.flatness};grips.l.anchorBlend=travel;tool={kind:'pen',...action,mark:cross.mark};
  }
 }
 return {grips,tool,context:{heldTool:tool,state,sequence:name,time:t,taskLean:.18+.32*workBlend,sideLean:.40*smooth(paper.x,.65,1.46)*workBlend,collision:true,humanoidMotion:true,stabilizeMotion:false,torsoYaw:.15*smooth(paper.x,.7,1.46)*workBlend,poles:{l:V(-.62,1.55,-.35),r:V(.35,1.35,-.75).lerp(V(1.05,2.15,-1.65),smooth(paper.y,1.85,2.35)*smooth(paper.x,.2,1.0))},handModes:{l:'chin',r:'tap'},tipBlend:1-workBlend,chinBlend:1-workBlend}};
}
