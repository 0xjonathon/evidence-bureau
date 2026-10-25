import * as THREE from 'three';
import {SOLIDS} from './desk-layout.js';
import {STAMP_CAP_Y,STAMP_CAP_RADIUS} from './desk-performance.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion();
const clamp=THREE.MathUtils.clamp;
function shoulderTwist(arm,local){const axis=arm.lower.position.clone().normalize(),r=arm.upperRest.clone().invert().multiply(local),v=V(r.x,r.y,r.z).dot(axis);let angle=2*Math.atan2(v,r.w);angle=Math.atan2(Math.sin(angle),Math.cos(angle));return angle;}

function frame(y,z){y=y.clone().normalize();const x=y.clone().cross(z).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,x.clone().cross(y).normalize()));}
export function seedHumanoidArm(arm){
 arm.nativeMotion={upper:arm.nativeRestSeed.upper.clone(),elbow:arm.nativeRestSeed.elbow,roll:0,flex:0,deviation:0};
 arm.bendDirection=null;arm.nativeLastHand=null;arm.nativeSettled=false;arm.nativeInput=null;arm.nativeResult=null;
}
function penetration(a,b,radius){let cost=0;for(let i=1;i<=12;i++){
 const p=a.clone().lerp(b,i/12);for(const s of SOLIDS){const d=Math.hypot(...['x','y','z'].map(k=>Math.max(0,Math.abs(p[k]-s.p[k])-s.size[k]/2)));cost+=Math.max(0,radius-d)**2;}
 }return cost;}
// One elbow branch and one anatomical hinge. The wrist is derived from that
// hinge, rather than being an independent rotation that can invert the sleeve.
export function solveHumanoidArm(actor,arm,anchor,point,scale,{dt=.025,collision=true,pole=null}={}){
 const shoulder=arm.upper.getWorldPosition(V()),parent=arm.upper.parent.getWorldQuaternion(Q()),a=arm.lower.position.length()*scale.y,b=arm.wrist.position.length()*scale.y,sign=arm.semantic==='right'?1:-1,grasp=point.clone().multiply(scale),previous=arm.nativeMotion;
 const axis=anchor.clone().sub(shoulder).normalize(),preferred=(pole||shoulder.clone().add(V(arm.side==='l'?-.5:.5,-.5,0))).clone().sub(shoulder);
 preferred.addScaledVector(axis,-preferred.dot(axis)).normalize();
 const desiredFlex=arm.toolFlexGoal??.15,flex=arm.nativeFrames?clamp(desiredFlex,previous.flex-2*dt,previous.flex+2*dt):desiredFlex;
 const handPose=arm.fingerAngles.map(n=>n.toFixed(5)).join(',');
 if(arm.collisionPadPose!==handPose){
  arm.collisionPadPose=handPose;arm.collisionPads=[];
  for(const{mesh,vertices}of arm.surface)for(let j=0;j<vertices.length;j+=2){const i=vertices[j],p=V().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,p).applyMatrix4(mesh.matrixWorld);arm.collisionPads.push(arm.wrist.worldToLocal(p).multiply(scale));}
 }

 const inputs=[...shoulder.toArray(),...parent.toArray(),...anchor.toArray(),...grasp.toArray(),...preferred.toArray(),...arm.fingerAngles,a,b,Number(collision),...(arm.toolCollider?.kind==='stamp'?arm.toolCollider.position.toArray():[0,0,0]),...(arm.orientationGoal?.toArray()||[0,0,0,0]),flex];
 if(arm.nativeSettled&&arm.nativeInput?.every((n,i)=>Math.abs(n-inputs[i])<1e-6))return arm.nativeResult;
 arm.nativeInput=inputs;
 function solveAt(direction){
  let hand=arm.nativeLastHand?.clone()||arm.lower.getWorldQuaternion(Q()).multiply(arm.wristRest),result;
  for(let i=0;i<14;i++){
   const desired=anchor.clone().sub(grasp.clone().applyQuaternion(hand)),delta=desired.clone().sub(shoulder),distance=clamp(delta.length(),Math.sqrt(a*a+b*b+2*a*b*Math.cos(2.60)),a+b-.004),dir=delta.normalize(),plane=direction.clone().addScaledVector(dir,-direction.dot(dir)).normalize();
   const x=(a*a-b*b+distance*distance)/(2*distance),y=Math.sqrt(Math.max(0,a*a-x*x)),elbow=shoulder.clone().addScaledVector(dir,x).addScaledVector(plane,y),wrist=shoulder.clone().addScaledVector(dir,distance),u=elbow.clone().sub(shoulder).normalize(),f=wrist.clone().sub(elbow).normalize(),hinge=u.clone().cross(f).normalize().multiplyScalar(sign),upper=frame(u,hinge).multiply(arm.upperFrame.clone().invert()),lower=frame(f,hinge).multiply(arm.lowerFrame.clone().invert()),neutral=lower.clone().multiply(arm.wristRest).multiply(arm.basis);
   let roll=0;
   if(arm.orientationGoal){const goal=arm.orientationGoal.clone().multiply(arm.basis),project=n=>n.addScaledVector(f,-n.dot(f)).normalize(),n=project(V(0,0,1).applyQuaternion(neutral)),m=project(V(0,0,1).applyQuaternion(goal));let angle=Math.atan2(f.dot(n.clone().cross(m)),n.dot(m));angle+=Math.round((previous.roll-angle)/(2*Math.PI))*2*Math.PI;roll=clamp(angle,-1.15,1.15);}
   if(arm.nativeFrames)roll=clamp(roll,previous.roll-3*dt,previous.roll+3*dt);
   const forearmFrame=Q().setFromAxisAngle(f,roll).multiply(neutral),handFrame=forearmFrame.clone().multiply(Q().setFromAxisAngle(V(1,0,0),flex)),nextHand=handFrame.clone().multiply(arm.basis.clone().invert());
   result={upper,lower,elbow,wrist,hand:nextHand,frame:handFrame,forearmFrame,contact:wrist.clone().add(grasp.clone().applyQuaternion(nextHand)),roll,elbowAngle:u.angleTo(f)};
   hand.slerp(nextHand,.7);
  }
  result.error=result.contact.distanceTo(anchor);
  result.collision=collision?penetration(shoulder,result.elbow,.23)+penetration(result.elbow,result.wrist,.16):0;
  if(collision)for(const pad of arm.collisionPads){const p=pad.clone().applyQuaternion(result.hand).add(result.wrist);for(const s of SOLIDS){const depth=Math.min(...['x','y','z'].map(k=>s.size[k]/2-Math.abs(p[k]-s.p[k])));if(depth>-.001)result.collision+=Math.max(0,depth+.001)**2;}}
  if(collision&&arm.toolCollider?.kind==='stamp'){
   const origin=arm.toolCollider.position,cap=origin.clone().add(V(0,STAMP_CAP_Y,0));
   for(const pad of arm.collisionPads){const p=pad.clone().applyQuaternion(result.hand).add(result.wrist),capDepth=Math.max(0,STAMP_CAP_RADIUS+.001-p.distanceTo(cap));result.collision+=8*capDepth*capDepth;
    const height=p.y-origin.y;if(height>.057&&height<.167){const radius=.028-(height-.057)/.11*.003,depth=Math.max(0,radius+.001-Math.hypot(p.x-origin.x,p.z-origin.z));result.collision+=8*depth*depth;}
   }
  }
  result.twist=shoulderTwist(arm,parent.clone().invert().multiply(result.upper));
  result.cost=10000*result.collision;
  return result;
 }
 const score=(r,direction)=>r.cost+.4*Math.atan2(axis.dot(direction.clone().cross(preferred)),direction.dot(preferred))**2+.5*Math.max(0,Math.abs(r.twist)-1.5)**2;
 let chosen=arm.bendDirection?arm.bendDirection.clone().addScaledVector(axis,-arm.bendDirection.dot(axis)).normalize():preferred.clone(),result=solveAt(chosen),best=score(result,chosen);
 if(!arm.bendDirection&&result.cost>1e-5){for(let i=1;i<=32;i++){const direction=preferred.clone().applyAxisAngle(axis,(i%2?-1:1)*Math.ceil(i/2)*Math.PI/16),trial=solveAt(direction),value=score(trial,direction);if(value<best){chosen=direction;result=trial;best=value;}}}
 const center=chosen.clone(),step=2.4*dt;
 for(const angle of [-step,step,-step*.5,step*.5,-step*.25,step*.25]){const direction=center.clone().applyAxisAngle(axis,angle),trial=solveAt(direction),value=score(trial,direction);if(value<best-1e-9){chosen=direction;result=trial;best=value;}}
 arm.nativeSettled=!!arm.bendDirection&&chosen.distanceTo(arm.bendDirection)<.0002&&Math.abs(result.roll-previous.roll)<.0002;
 arm.bendDirection=chosen;arm.nativeLastHand=result.hand.clone();arm.nativeFrames=(arm.nativeFrames||0)+1;
 const local=parent.clone().invert().multiply(result.upper);arm.nativeMotion={upper:local,elbow:result.elbowAngle,roll:result.roll,flex,deviation:0};
 arm.lastNativeTwist=result.twist;
 result.state=arm.nativeMotion;arm.nativeResult=result;return result;
}
