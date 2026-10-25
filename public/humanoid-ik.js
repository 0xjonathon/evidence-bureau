import * as THREE from 'three';
import {SOLIDS} from './desk-layout.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion(),UP=V(0,1,0);
const clamp=THREE.MathUtils.clamp;
function limitedShoulder(arm,q){
 const axis=arm.lower.position.clone().normalize(),relative=arm.upperRest.clone().invert().multiply(q),projection=axis.clone().multiplyScalar(V(relative.x,relative.y,relative.z).dot(axis)),twist=new THREE.Quaternion(projection.x,projection.y,projection.z,relative.w).normalize(),swing=relative.clone().multiply(twist.clone().invert());
 let angle=2*Math.atan2(V(twist.x,twist.y,twist.z).dot(axis),twist.w);if(angle>Math.PI)angle-=2*Math.PI;if(angle<-Math.PI)angle+=2*Math.PI;
 arm.lastNativeTwist=clamp(angle,-1.50,1.50);return arm.upperRest.clone().multiply(swing).multiply(Q().setFromAxisAngle(axis,clamp(angle,-1.50,1.50)));
}
function copy(s){return {upper:s.upper.clone(),elbow:s.elbow,roll:s.roll,flex:s.flex,deviation:s.deviation};}
export function seedHumanoidArm(arm){
 const shoulder=arm.upper.getWorldPosition(V()),elbow=arm.lower.getWorldPosition(V()),wrist=arm.wrist.getWorldPosition(V());
 if(arm.nativeRestSeed){arm.nativeMotion=copy(arm.nativeRestSeed);arm.nativeMotion.upper=limitedShoulder(arm,arm.nativeMotion.upper);return;}
 arm.nativeMotion={upper:limitedShoulder(arm,arm.upper.quaternion),elbow:clamp(elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow)),.06,2.60),roll:clamp(arm.forearmRoll||0,-1.35,1.35),flex:clamp(arm.wristBend||0,-.55,.55),deviation:0};
}
function outsideCost(a,b,radius){let total=0;for(let j=1;j<=6;j++){const p=a.clone().lerp(b,j/6);for(const solid of SOLIDS){const dx=Math.max(0,Math.abs(p.x-solid.p.x)-solid.size.x/2),dy=Math.max(0,Math.abs(p.y-solid.p.y)-solid.size.y/2),dz=Math.max(0,Math.abs(p.z-solid.p.z)-solid.size.z/2),d2=dx*dx+dy*dy+dz*dz;if(d2<radius*radius)total+=(radius-Math.sqrt(d2))**2;}}return total;}
export function solveHumanoidArm(actor,arm,anchor,point,scale,{dt=.025,collision=true}={}){
 const parent=arm.upper.parent.getWorldQuaternion(Q()),shoulder=arm.upper.getWorldPosition(V()),a=arm.lower.position.length()*scale.y,b=arm.wrist.position.length()*scale.y,sign=arm.semantic==='right'?1:-1,previous=copy(arm.nativeMotion),grasp=point.clone().multiply(scale),pads=arm.ends.map(b=>arm.wrist.worldToLocal(b.getWorldPosition(V())).multiply(scale));
 function fk(s){
  const upper=parent.clone().multiply(s.upper),uf=upper.clone().multiply(arm.upperFrame),lf=uf.clone().multiply(Q().setFromAxisAngle(V(0,0,1),sign*s.elbow)),elbow=shoulder.clone().add(V(0,a,0).applyQuaternion(uf)),wrist=elbow.clone().add(V(0,b,0).applyQuaternion(lf)),lower=lf.clone().multiply(arm.lowerFrame.clone().invert()),direction=V(0,1,0).applyQuaternion(lf),neutral=lower.clone().multiply(arm.wristRest).multiply(arm.basis),forearmFrame=Q().setFromAxisAngle(direction,s.roll).multiply(neutral),frame=forearmFrame.clone().multiply(Q().setFromAxisAngle(V(1,0,0),s.flex)).multiply(Q().setFromAxisAngle(V(0,0,1),s.deviation)),hand=frame.clone().multiply(arm.basis.clone().invert()),contact=wrist.clone().add(grasp.clone().applyQuaternion(hand));
  return {upper,lower,elbow,wrist,hand,frame,forearmFrame,contact};
 }
 function cost(s){
  const p=fk(s);let loss=100000*p.contact.distanceToSquared(anchor);if(arm.orientationGoal)loss+=(arm.orientationStrength||0)*p.hand.angleTo(arm.orientationGoal)**2;
  // The rest configuration resolves redundant degrees of freedom without
  // ever selecting a different discrete elbow/wrist branch.
  loss+=.4*s.upper.angleTo(previous.upper)**2+.10*((s.elbow-previous.elbow)**2+(s.roll-previous.roll)**2+(s.flex-previous.flex)**2+(s.deviation-previous.deviation)**2);
  if(collision){loss+=1000*(outsideCost(shoulder,p.elbow,.20)+outsideCost(p.elbow,p.wrist,.12));for(const pad of pads){const tip=p.wrist.clone().add(pad.clone().applyQuaternion(p.hand));for(const solid of SOLIDS){const dx=Math.max(0,Math.abs(tip.x-solid.p.x)-solid.size.x/2),dy=Math.max(0,Math.abs(tip.y-solid.p.y)-solid.size.y/2),dz=Math.max(0,Math.abs(tip.z-solid.p.z)-solid.size.z/2),d=Math.sqrt(dx*dx+dy*dy+dz*dz);if(d<.012)loss+=3000*(.012-d)**2;}}}
  const side=arm.side==='l'?-1:1;loss+=40*Math.max(0,.12-side*(p.elbow.x-actor.root.position.x))**2;
  return loss;
 }
 let current=copy(previous),best=cost(current);const maxTurn=Math.min(.38,12*dt),limits={elbow:[.06,2.60],roll:[-1.35,1.35],flex:[-.50,.50],deviation:[-.25,.25]},axes=[V(1,0,0),V(0,1,0),V(0,0,1)];
 const warm=arm.nativeFrames?1:3;const initial=fk(current),settled=initial.contact.distanceTo(anchor)<.001&&(!arm.orientationGoal||initial.hand.angleTo(arm.orientationGoal)<.03)&&(!collision||outsideCost(shoulder,initial.elbow,.20)+outsideCost(initial.elbow,initial.wrist,.12)<1e-7);
 for(let cycle=0;cycle<(settled?0:warm);cycle++)for(const step of [.16,.08,.04,.02,.01,.005,.0025,.00125])for(let pass=0;pass<2;pass++)for(let j=0;j<7;j++){
  const base=copy(current);for(const dir of [-1,1]){
   const trial=copy(base);
   if(j<3){trial.upper.multiply(Q().setFromAxisAngle(axes[j],step*dir));trial.upper=limitedShoulder(arm,trial.upper);if(arm.nativeFrames&&previous.upper.angleTo(trial.upper)>maxTurn)continue;}
   else{const key=['elbow','roll','flex','deviation'][j-3],[lo,hi]=limits[key];trial[key]=clamp(base[key]+step*dir,arm.nativeFrames?Math.max(lo,previous[key]-maxTurn):lo,arm.nativeFrames?Math.min(hi,previous[key]+maxTurn):hi);}
   if(arm.nativeFrames&&Math.hypot(previous.upper.angleTo(trial.upper),trial.elbow-previous.elbow,trial.roll-previous.roll,trial.flex-previous.flex,trial.deviation-previous.deviation)>maxTurn)continue;const score=cost(trial);if(score<best){best=score;current=trial;}
  }
 }
 arm.nativeMotion=current;arm.nativeFrames=(arm.nativeFrames||0)+1;const result=fk(current);result.error=result.contact.distanceTo(anchor);result.state=current;limitedShoulder(arm,current.upper);return result;
}
