import * as THREE from 'three';
import {limbClearance,limbClearanceReport} from './desk-layout.js';
import {seedHumanoidArm,solveHumanoidArm} from './humanoid-ik.js';
import {installVolumeSkinning} from './volume-skinning.js';
import {prepareHand,poseHand} from './anatomical-hand.js';
import {installForearmTwist,turnForearm} from './forearm-twist.js';
import {prepareSkinContacts,resetSkinContacts,applySkinContacts} from './skin-contact.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion();
function anatomicalFrame(forward,normal){const y=forward.clone().normalize(),x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
let assets,metadata;
export function installCharacterAssets(models,meta){assets=models;metadata=meta;}
function boneMap(scene,human){return Object.fromEntries(Object.entries(human).map(([name,node])=>[name,scene.getObjectByName(node)]));}
function rotationWorld(bone,q){const parent=bone.parent.getWorldQuaternion(Q());bone.quaternion.copy(parent.invert().multiply(q)).normalize();bone.updateWorldMatrix(true,true);}
function addWorldRotation(bone,axis,angle){rotationWorld(bone,Q().setFromAxisAngle(axis,angle).multiply(bone.getWorldQuaternion(Q())));}
function solve(shoulder,wrist,a,b,pole){
 const dir=wrist.clone().sub(shoulder),d=THREE.MathUtils.clamp(dir.length(),Math.abs(a-b)+.0001,a+b-.0001);dir.normalize();const bend=pole.clone().sub(shoulder).addScaledVector(dir,-pole.clone().sub(shoulder).dot(dir)).normalize();const x=(a*a-b*b+d*d)/(2*d),y=Math.sqrt(Math.max(0,a*a-x*x));return {elbow:shoulder.clone().addScaledVector(dir,x).addScaledVector(bend,y),wrist:shoulder.clone().addScaledVector(dir,d)};
}
const DIAGNOSTIC_DEFAULT={reachError:0,pinchError:0,clearanceMin:Infinity,bodyHits:[],meshHits:[],elbowFlip:false,stretchError:0,paperContactError:0,viewerContactError:0};
function freshDiagnostics(){return {reachError:0,pinchError:0,clearanceMin:Infinity,bodyHits:[],meshHits:[],elbowFlip:false,stretchError:0,paperContactError:0,viewerContactError:0};}
function alignBone(bone,child,to){const from=bone.getWorldPosition(V()),old=child.getWorldPosition(V()).sub(from),next=to.clone().sub(from);rotationWorld(bone,Q().setFromUnitVectors(old.normalize(),next.normalize()).multiply(bone.getWorldQuaternion(Q())));}
function makeArm(actor,side,semantic){
 const m=actor.bones,upper=m[semantic+'UpperArm'],lower=m[semantic+'LowerArm'],wrist=m[semantic+'Hand'];
 const fingers=['Thumb','Index','Middle','Ring','Little'].map(f=>['Proximal','Intermediate','Distal'].map(s=>m[semantic+f+s]));
 const rest=fingers.map(chain=>chain.map(b=>b.quaternion.clone()));
 actor.root.updateMatrixWorld(true);
 const local=p=>wrist.worldToLocal(p.getWorldPosition(V()));const index=local(fingers[1][0]),pinky=local(fingers[4][0]),middle=local(fingers[2][0]);const y=middle.clone().normalize(),z=(semantic==='left'?index.clone().sub(pinky).cross(y):y.clone().cross(index.clone().sub(pinky))).normalize(),x=y.clone().cross(z).normalize();z.copy(x).cross(y).normalize();
 const basis=Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)),palm=middle.clone().multiplyScalar(.60);
 const end=fingers[1][2].children.find(b=>b.isBone);
 const jointNames=new Set();wrist.traverse(b=>{if(b.isBone)jointNames.add(b.name);});const surface=[];actor.model.traverse(mesh=>{if(!mesh.isSkinnedMesh||!/SKIN/.test(mesh.material?.name||''))return;const ids=new Set(mesh.skeleton.bones.map((b,i)=>jointNames.has(b.name)?i:-1)),g=mesh.geometry,vertices=[];for(let i=0;i<g.attributes.position.count;i++){let sum=0;for(let j=0;j<4;j++)if(ids.has(g.attributes.skinIndex.array[i*4+j]))sum+=g.attributes.skinWeight.array[i*4+j];if(sum>.8)vertices.push(i);}if(vertices.length)surface.push({mesh,vertices});});
 const jointFrame=(bone,child)=>anatomicalFrame(child.position,V(0,1,0).applyQuaternion(bone.getWorldQuaternion(Q()).invert()));
 const upperFrame=jointFrame(upper,lower),lowerFrame=jointFrame(lower,wrist);
 return {side,semantic,upper,lower,upperFrame,lowerFrame,upperRest:upper.quaternion.clone(),wrist,wristRest:wrist.quaternion.clone(),fingers,surface,rest,basis,palm,ends:fingers.map(c=>c[2].children.find(b=>b.isBone)),hand:{root:wrist,tipWorld:()=>end.getWorldPosition(V())},end,lastElbow:null,lastTarget:null};
}
function prepareHumanoidRest(actor){
 const saved=[];actor.model.traverse(b=>{if(b.isBone)saved.push({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()});});
 const mixer=new THREE.AnimationMixer(actor.model),clip=actor.animations.find(c=>c.name==='Sitting_Idle_Loop');mixer.clipAction(clip).play();mixer.update(.1);actor.root.updateMatrixWorld(true);
 for(const arm of Object.values(actor.arms)){
  const s=arm.upper.getWorldPosition(V()),e=arm.lower.getWorldPosition(V()),w=arm.wrist.getWorldPosition(V()),u=e.clone().sub(s).normalize(),f=w.clone().sub(e).normalize(),h=u.clone().cross(f).normalize().multiplyScalar(arm.semantic==='right'?1:-1);
  arm.upperFrame=arm.upper.getWorldQuaternion(Q()).invert().multiply(anatomicalFrame(u,h));
  arm.lowerFrame=arm.lower.getWorldQuaternion(Q()).invert().multiply(anatomicalFrame(f,h));
  arm.nativeRestSeed={upper:arm.upper.quaternion.clone(),elbow:u.angleTo(f),roll:0,flex:0,deviation:0};
 }
 mixer.stopAllAction();mixer.uncacheRoot(actor.model);for(const {b,p,q,s}of saved){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}actor.root.updateMatrixWorld(true);
}
function motion(actor){
 const mixer=new THREE.AnimationMixer(actor.model),idle=actor.animations.find(a=>a.name==='Sitting_Idle_Loop');
 const legNames=new Set();for(const b of [actor.bones.leftUpperLeg,actor.bones.rightUpperLeg])b.traverse(n=>{if(n.isBone)legNames.add(n.name);});
 mixer.clipAction(new THREE.AnimationClip('seated-legs',idle.duration,idle.tracks.filter(t=>legNames.has(t.name.split('.')[0])))).play();
 const rest=[];actor.model.traverse(b=>{if(b.isBone)rest.push({b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()});});let last=0;
 return {update(time){for(const {b,p,q,s} of rest){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}mixer.update(Math.max(0,Math.min(.1,time-last)));last=time;}};
}
function fpsGeometry(mesh,bones){
 const g=mesh.geometry,skin=g.attributes.skinIndex,weights=g.attributes.skinWeight,allowed=new Set();
 for(let i=0;i<mesh.skeleton.bones.length;i++)if(/J_Bip_[LR]_(?:UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/.test(mesh.skeleton.bones[i].name))allowed.add(i);
 const ok=i=>{let w=0;for(let k=0;k<4;k++)if(allowed.has(skin.array[i*4+k]))w+=weights.array[i*4+k];return w>.80;},idx=g.index.array,keep=[];
 for(let i=0;i<idx.length;i+=3)if(ok(idx[i])&&ok(idx[i+1])&&ok(idx[i+2]))keep.push(idx[i],idx[i+1],idx[i+2]);
 const next=g.clone();next.setIndex(keep);next.computeBoundingSphere();mesh.geometry=next;mesh.visible=keep.length>0;
}
function build(role){
 const loaded=assets[role],model=loaded.scene,root=new THREE.Group();root.add(model);const bones=boneMap(model,metadata[role].humanoid);const gradient=new THREE.DataTexture(new Uint8Array([100,185,255]),3,1,THREE.RedFormat);gradient.minFilter=THREE.NearestFilter;gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
 model.traverse(o=>{if(o.isMesh){const convert=m=>{if(/Body_00_SKIN/.test(m.name)){const next=new THREE.MeshStandardMaterial({name:m.name,map:m.map,color:m.color,roughness:.82,metalness:0,alphaTest:.45,side:THREE.FrontSide});next.toneMapped=true;return next;}if(m.isMeshBasicMaterial)m.toneMapped=false;return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});
 const actor={role,root,group:root,model,bones,animations:loaded.animations};
 if(role==='detective'){model.scale.setScalar(3.06);model.position.set(0,-3.6875,.125);model.rotation.y=Math.PI;}
 else{model.scale.setScalar(2.2);model.updateMatrixWorld(true);const shoulderHeight=bones.leftUpperArm.getWorldPosition(V()).y/2.2;model.position.y=-shoulderHeight*2.2-.55;model.traverse(o=>{if(o.isMesh){if(!(o.isSkinnedMesh&&/Body/.test(o.name))||/HAIR|AccessoryNeck/.test(o.material?.name||''))o.visible=false;else{const g=o.geometry,idx=g.index.array,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,headBones=new Set(o.skeleton.bones.map((b,i)=>/Head|Neck/.test(b.name)?i:-1).filter(i=>i>=0)),keep=[];const ownHead=i=>{let n=0;for(let k=0;k<4;k++)if(headBones.has(si.array[i*4+k]))n+=sw.array[i*4+k];return n>.20;};for(let i=0;i<idx.length;i+=3)if(!ownHead(idx[i])&&!ownHead(idx[i+1])&&!ownHead(idx[i+2]))keep.push(idx[i],idx[i+1],idx[i+2]);o.geometry=g.clone();o.geometry.setIndex(keep);}}});}
 root.updateMatrixWorld(true);actor.arms={l:makeArm(actor,'l',role==='detective'?'right':'left'),r:makeArm(actor,'r',role==='detective'?'left':'right')};actor.head=bones.head;actor.torso=bones.chest;prepareHumanoidRest(actor);for(const arm of Object.values(actor.arms)){prepareHand(arm);if(role==='detective'){poseHand(arm,'pinch',0);arm.defaultAnchor=arm.graspAnchor.clone();poseHand(arm,'relaxed');}installForearmTwist(actor,arm);}if(role==='detective')installVolumeSkinning(actor);prepareSkinContacts(actor);actor.motion=motion(actor);return actor;
}
export function buildDetective(){return build('detective');}
export function buildViewer(){return build('visitor');}
function frameQuat(arm,forward,normal){const y=forward.clone().normalize(),x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).multiply(arm.basis.clone().invert());}
function orientedStampPlan(actor,arm,anchor,point,scale,shoulder,a,b,preferred,coherent,upperBind,upperBindDir,collision){
 const weight=arm.gripWeight??1,aim=anchor.clone().sub(shoulder);aim.y=0;aim.normalize();
 const shaft=V(0,arm.semantic==='right'?-1:1,0),normal=shaft.clone().cross(aim).normalize(),goal=frameQuat(arm,aim,normal);
 arm.stampRestQ??=arm.lastSolvedQ?.clone()||goal.clone();const q=arm.stampRestQ.clone().slerp(goal,arm.orientationWeight??weight),frame=q.clone().multiply(arm.basis),wristTarget=anchor.clone().sub(point.clone().multiply(scale).applyQuaternion(q)),axis=wristTarget.clone().sub(shoulder).normalize(),offset=(coherent?arm.lastElbow:preferred).clone().sub(shoulder);
 const handForward=V(0,1,0).applyQuaternion(frame),handNormal=V(0,0,1).applyQuaternion(frame);let best=-Infinity,chosen;
 for(let i=0;i<97;i++){
  const p=solve(shoulder,wristTarget,a,b,shoulder.clone().add(offset.clone().applyAxisAngle(axis,(i%2?-1:1)*Math.ceil(i/2)*Math.PI/48))),u=p.elbow.clone().sub(shoulder).normalize(),f=p.wrist.clone().sub(p.elbow).normalize(),h=u.clone().cross(f).normalize().multiplyScalar(arm.semantic==='right'?1:-1),upper=anatomicalFrame(u,h).multiply(arm.upperFrame.clone().invert()),neutral=Q().setFromUnitVectors(upperBindDir,u).multiply(upperBind),upperAngle=upper.angleTo(neutral),base=anatomicalFrame(f,h).multiply(arm.lowerFrame.clone().invert()).multiply(arm.wristRest).multiply(arm.basis);
  const project=n=>n.clone().addScaledVector(f,-n.dot(f)).normalize(),n=project(V(0,0,1).applyQuaternion(base)),m=project(handNormal),roll=Math.atan2(f.dot(n.clone().cross(m)),n.dot(m)),bend=f.angleTo(handForward),excess=Math.max(0,upperAngle-1.57)+Math.max(0,Math.abs(roll)-1.35)+Math.max(0,bend-(.60-.20*weight)),clearance=collision?Math.min(limbClearance(shoulder,p.elbow,.15),limbClearance(p.elbow,p.wrist,.15)):.02,continuity=coherent?p.elbow.distanceTo(arm.lastElbow):0,score=-(excess>0?20+10*excess:0)+Math.min(clearance,.012)-.0015*i-continuity*.15-(clearance<-.005?1:0)-(coherent&&continuity>.095?5:0);
  if(score>best){best=score;chosen={elbow:p.elbow,wrist:p.wrist,q,frame,clearance,jointError:excess,wristBend:bend};}if(i===0&&clearance>.01&&excess===0)break;
 }
 return chosen;
}
function reach(actor,arm,anchor,forward,normal,pole,tip=false,kind=null,collision=false,diagnostics=null){
 const scale=arm.wrist.getWorldScale(V()),tipWeight=typeof tip==='number'?tip:tip?1:0;
 const point=(arm.restPoint||arm.defaultAnchor||arm.palm).clone().lerp(arm.wrist.worldToLocal(arm.end.getWorldPosition(V())),tipWeight);
 if(kind&&arm.graspAnchor)point.lerp(arm.graspAnchor,arm.anchorBlend??arm.gripWeight??1);
 const shoulder=arm.upper.getWorldPosition(V()),a=shoulder.distanceTo(arm.lower.getWorldPosition(V())),b=arm.lower.getWorldPosition(V()).distanceTo(arm.wrist.getWorldPosition(V()));
 if(actor.useHumanoidIK&&!arm.nativeMotion)seedHumanoidArm(arm);
 if(actor.useHumanoidIK&&arm.nativeMotion){
  arm.orientationGoal=!kind?frameQuat(arm,forward,normal):null;arm.orientationStrength=!kind?3:0;
  if(kind==='stamp'){const aim=anchor.clone().sub(shoulder);aim.y=0;aim.normalize();const shaft=V(0,arm.semantic==='right'?-1:1,0),goal=frameQuat(arm,aim,shaft.cross(aim).normalize());arm.nativeStampRest??=arm.lastSolvedQ.clone();arm.orientationGoal=arm.nativeStampRest.clone().slerp(goal,arm.orientationWeight??arm.gripWeight??1);arm.orientationStrength=20*(arm.orientationWeight??arm.gripWeight??1);}
  else{arm.nativeStampRest=null;if(kind==='pen'){arm.orientationGoal=frameQuat(arm,forward,normal);arm.orientationStrength=2*(arm.gripWeight??1);}}
  arm.toolFlexGoal=THREE.MathUtils.lerp(.18,kind==='pen'?Math.min(.60,arm.toolFlex??.18):kind==='stamp'?0:kind==='pinch'?.12:.18,arm.gripWeight??1);
  const solved=solveHumanoidArm(actor,arm,anchor,point,scale,{dt:actor.poseDt,collision,pole});rotationWorld(arm.upper,solved.upper);rotationWorld(arm.lower,solved.lower);turnForearm(arm,solved.state.roll);rotationWorld(arm.wrist,solved.hand);arm.upperRoll=Math.abs(arm.lastNativeTwist||0);arm.forearmRoll=solved.state.roll;arm.wristBend=Math.hypot(solved.state.flex,solved.state.deviation);arm.clearance=collision?Math.min(limbClearance(shoulder,solved.elbow,.115),limbClearance(solved.elbow,solved.wrist,.115)):.02;arm.lastElbow=solved.elbow;arm.lastTarget=anchor.clone();arm.lastSolvedQ=solved.hand.clone();if(diagnostics){diagnostics.reachError=Math.max(diagnostics.reachError,solved.error);diagnostics.clearanceMin=Math.min(diagnostics.clearanceMin,arm.clearance);}return solved.error;
 }

 // Solve elbow -> grip as one rigid segment, then recover the wrist. This
 // removes the unstable wrist/orientation feedback loop and its elbow flips.
 let restFlex=actor.role==='visitor'&&arm.side==='l'?.75:.45*(1-tipWeight),flex=kind?THREE.MathUtils.lerp(restFlex,kind==='pen'?(arm.toolFlex??.18):0,arm.gripWeight??1):restFlex,relative=Q().setFromAxisAngle(V(1,0,0),flex),grasp=point.clone().multiply(scale).applyQuaternion(arm.basis.clone().invert()).applyQuaternion(relative),combined=grasp.clone().add(V(0,b,0)),length=combined.length(),combinedFrame=anatomicalFrame(combined,V(0,0,1));
 let preferred=pole.clone();
 const coherent=arm.lastElbow&&arm.lastTarget?.distanceTo(anchor)<.15;
 const upperBind=arm.upper.parent.getWorldQuaternion(Q()).multiply(arm.upperRest),upperBindDir=arm.lower.position.clone().applyQuaternion(upperBind).normalize();
 const axis=anchor.clone().sub(shoulder).normalize();
 if(coherent&&kind!=='pinch'){const project=p=>p.clone().sub(shoulder).addScaledVector(axis,-p.clone().sub(shoulder).dot(axis)).normalize(),from=project(arm.lastElbow),to=project(preferred),turn=Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to));preferred.copy(shoulder).add(from.applyAxisAngle(axis,THREE.MathUtils.clamp(turn,-.08,.08)));}
 const offset=preferred.clone().sub(shoulder);let chosen,best=-Infinity;
 const oriented=kind==='stamp';if(kind!=='stamp')arm.stampRestQ=null;
 if(oriented){chosen=orientedStampPlan(actor,arm,anchor,point,scale,shoulder,a,b,preferred,coherent,upperBind,upperBindDir,collision);flex=chosen.wristBend;}
 else for(let i=0;i<(collision?97:1);i++){
  const candidate=solve(shoulder,anchor,a,length,shoulder.clone().add(offset.clone().applyAxisAngle(axis,(i%2?-1:1)*Math.ceil(i/2)*Math.PI/48))),direction=candidate.wrist.clone().sub(candidate.elbow).normalize();
  const vertical=Math.pow(Math.abs(direction.dot(normal)),8),dorsal=normal.clone().multiplyScalar(1-vertical).addScaledVector(V(0,0,actor.role==='detective'?1:-1),vertical).normalize();
  let initialFrame=anatomicalFrame(direction,dorsal).multiply(combinedFrame.clone().invert());
  if(actor.role==='detective'&&coherent&&(!kind||(kind==='pinch'&&(arm.gripWeight??1)<.02))){const seed=arm.lastSolvedQ.clone().multiply(arm.basis).multiply(relative.clone().invert()),from=combined.clone().applyQuaternion(seed).normalize();seed.premultiply(Q().setFromUnitVectors(from,direction));const n=V(0,0,1).applyQuaternion(seed),m=V(0,0,1).applyQuaternion(initialFrame);n.addScaledVector(direction,-n.dot(direction)).normalize();m.addScaledVector(direction,-m.dot(direction)).normalize();const angle=Math.atan2(direction.dot(n.clone().cross(m)),n.dot(m));initialFrame=seed.premultiply(Q().setFromAxisAngle(direction,THREE.MathUtils.clamp(angle*.25,-.08,.08)));}
  let frame,wrist,handFrame,q,jointError=0,frameScore=-Infinity;
  let bestTurn=0;
  const evaluateFrame=turn=>{
   const trial=initialFrame.clone().premultiply(Q().setFromAxisAngle(direction,turn)),w=candidate.elbow.clone().add(V(0,b,0).applyQuaternion(trial)),u=candidate.elbow.clone().sub(shoulder).normalize(),f=w.clone().sub(candidate.elbow).normalize(),h=u.clone().cross(f).normalize().multiplyScalar(arm.semantic==='right'?1:-1),base=anatomicalFrame(f,h).multiply(arm.lowerFrame.clone().invert()).multiply(arm.wristRest).multiply(arm.basis),proj=n=>n.clone().addScaledVector(f,-n.dot(f)).normalize(),bn=proj(V(0,0,1).applyQuaternion(base)),wn=proj(V(0,0,1).applyQuaternion(trial)),twist=Math.atan2(f.dot(bn.clone().cross(wn)),bn.dot(wn)),upperQ=anatomicalFrame(u,h).multiply(arm.upperFrame.clone().invert()),neutralQ=Q().setFromUnitVectors(upperBindDir,u).multiply(upperBind),upperAngle=neutralQ.angleTo(upperQ),excess=Math.max(0,Math.abs(twist)-1.35)+Math.max(0,upperAngle-1.57),score=-Math.abs(turn)-(excess>0?20+excess*10:0);
   if(score>frameScore){frameScore=score;frame=trial;wrist=w;jointError=excess;bestTurn=turn;}return excess;
  };
  for(let r=0;r<33;r++)if(evaluateFrame((r%2?-1:1)*Math.ceil(r/2)*Math.PI/16)===0)break;
  // Refine the feasibility boundary instead of snapping between 11.25-degree rolls.
  if(Math.abs(bestTurn)>.000001)for(const step of [.098,.049,.0245,.01225,.006125,.0030625]){const center=bestTurn;for(const sign of [-1,1])evaluateFrame(center+sign*step);}

  handFrame=frame.clone().multiply(relative);q=handFrame.clone().multiply(arm.basis.clone().invert());
  // The imported sleeve has a wider envelope than the arm capsule. Keep a
  // deliberate safety margin around the integrated instrument so the skinned
  // shoulder/sleeve cannot graze its upper housing at the corner.
  const clearance=collision?Math.min(limbClearance(shoulder,candidate.elbow,.24),limbClearance(candidate.elbow,wrist,.20)):.02;
  const continuity=coherent?candidate.elbow.distanceTo(arm.lastElbow):0,score=-(jointError>0?20+jointError*10:0)+Math.min(clearance,.012)-.0015*i-continuity*.15-(clearance<-.005?1:0)-(coherent&&continuity>.095?5:0);
  if(score>best){best=score;chosen={elbow:candidate.elbow,wrist,q,frame,handFrame,clearance,jointError};}if(i===0&&clearance>.01&&jointError===0)break;
 }

 const {elbow,wrist,q,frame,clearance}=chosen,upperDir=elbow.clone().sub(shoulder).normalize(),lowerDir=wrist.clone().sub(elbow).normalize(),hinge=upperDir.clone().cross(lowerDir).normalize().multiplyScalar(arm.semantic==='right'?1:-1);
 const bindQ=arm.upper.parent.getWorldQuaternion(Q()).multiply(arm.upperRest),bindDir=arm.lower.position.clone().applyQuaternion(bindQ).normalize(),neutral=Q().setFromUnitVectors(bindDir,upperDir).multiply(bindQ),anatomic=anatomicalFrame(upperDir,hinge).multiply(arm.upperFrame.clone().invert()),relativeUpper=neutral.clone().invert().multiply(anatomic);arm.upperRoll=2*Math.acos(Math.min(1,Math.abs(relativeUpper.w)));
 arm.wrist.quaternion.copy(arm.wristRest);rotationWorld(arm.upper,anatomicalFrame(upperDir,hinge).multiply(arm.upperFrame.clone().invert()));rotationWorld(arm.lower,anatomicalFrame(lowerDir,hinge).multiply(arm.lowerFrame.clone().invert()));
 // Pronation is carried by the forearm; wrist flexion is authored at 10° for
 // writing and neutral carrying; the stamp uses an oriented grip with a
 // bounded wrist swing. Axial rotation is distributed through the forearm.
  const current=V(0,0,1).applyQuaternion(arm.basis).applyQuaternion(arm.wrist.getWorldQuaternion(Q())),wanted=V(0,0,1).applyQuaternion(frame),project=n=>n.clone().addScaledVector(lowerDir,-n.dot(lowerDir)).normalize(),n=project(current),m=project(wanted),roll=THREE.MathUtils.clamp(Math.atan2(lowerDir.dot(n.clone().cross(m)),n.dot(m)),-1.35,1.35);
 turnForearm(arm,roll);rotationWorld(arm.wrist,q);arm.forearmRoll=roll;arm.wristBend=flex;arm.clearance=clearance;
 const actual=arm.wrist.localToWorld(point.clone()),error=actual.distanceTo(anchor);
 if(diagnostics){diagnostics.reachError=Math.max(diagnostics.reachError,error);diagnostics.clearanceMin=Math.min(diagnostics.clearanceMin,clearance);}
 arm.lastElbow=elbow.clone();arm.lastTarget=anchor.clone();arm.lastSolvedQ=q.clone();if(actor.useHumanoidIK&&!arm.nativeMotion){seedHumanoidArm(arm);return reach(actor,arm,anchor,forward,normal,pole,tip,kind,collision,diagnostics);}return error;
}
function relaxHand(arm){poseHand(arm,'relaxed');}
function paperGrip(arm){poseHand(arm,'pinch');}
export function poseDetective(actor,p,life,targets={},grips=null,context={}){
 resetSkinContacts(actor);const diagnostics=freshDiagnostics();actor.lastDiagnostics=diagnostics;
 actor.useHumanoidIK=!!context.humanoidMotion;actor.poseDt=Math.min(.07,Math.max(.001,life.time-(actor.lastPoseTime??life.time-.025)));actor.lastPoseTime=life.time;if(actor.resetPose){for(const arm of Object.values(actor.arms)){arm.nativeMotion=null;arm.nativeFrames=0;arm.lastElbow=null;arm.lastTarget=null;arm.stampRestQ=null;}actor.resetPose=false;}
 actor.motion.update(life.time,context);actor.root.updateMatrixWorld(true);
 const lean=context.taskLean??p.lean;addWorldRotation(actor.bones.spine,V(0,1,0),(context.torsoYaw||0)*.55);addWorldRotation(actor.bones.chest,V(0,1,0),(context.torsoYaw||0)*.45);
 addWorldRotation(actor.bones.spine,V(0,0,1),-(context.sideLean||0)*.6);addWorldRotation(actor.bones.chest,V(0,0,1),-(context.sideLean||0)*.4);
 addWorldRotation(actor.bones.spine,V(1,0,0),lean*.45);addWorldRotation(actor.bones.chest,V(1,0,0),lean*.45);addWorldRotation(actor.head,V(0,1,0),p.headY);addWorldRotation(actor.head,V(1,0,0),p.headX-lean*.90);

 let miss=0;
 for(const side of ['l','r']){
  const arm=actor.arms[side],position=actor.root.localToWorld((grips?.[side]?.position||targets[side]||V(...p[side])).clone());
  if(!grips?.[side]&&!targets[side])position.y=Math.max(1.75,position.y);
  const forward=grips?.[side]?.forward||V(0,0,1),normal=grips?.[side]?.normal||V(0,1,0),pole=context.poles?.[side]||V(side==='l'?-.52:.52,1.75,-.65);
  const kind=grips?.[side]?.kind,weight=grips?.[side]?.weight??1;arm.toolFlex=grips?.[side]?.wristFlex??.18;arm.toolFlatness=grips?.[side]?.flatness??0;
  arm.transitionBase={kind:side==='l'?'chin':'tap',weight:side==='l'?(context.chinBlend??0):(context.tipBlend??0)};
  const style=kind||(side==='l'&&context.chinBlend!==undefined?'chin':context.handModes?.[side]==='chin'?'chin':context.handModes?.[side]==='tap'?'tap':'relaxed');
  arm.restPoint=(arm.defaultAnchor||arm.palm).clone();if(side==='l')arm.restPoint.lerp(arm.palm,context.chinBlend??0);arm.orientationWeight=grips?.[side]?.orientationWeight;arm.anchorBlend=grips?.[side]?.anchorBlend;poseHand(arm,style,style==='chin'?(context.chinBlend??1):style==='tap'?(context.tipBlend??1):weight);
  actor.root.updateMatrixWorld(true);arm.gripWeight=weight;
  miss=Math.max(miss,reach(actor,arm,position,forward,normal,pole,context.handModes?.[side]==='tap'?(context.tipBlend??1):false,kind,context.collision,diagnostics));
  if(!actor.useHumanoidIK&&context.handModes?.[side]==='tap'&&(context.tipBlend??1)>.01){let floor=Infinity;actor.root.updateMatrixWorld(true);for(const {mesh,vertices}of arm.surface)for(const i of vertices){const v=V().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,v).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,v.y);}if(floor<1.558){position.y+=1.558-floor;reach(actor,arm,position,forward,normal,pole,context.tipBlend??1,null,context.collision,diagnostics);}}
 }
 // The original VRoid facial morphs provide the blink, rather than scaling the head mesh.
 const blink=metadata.detective.blink.find(b=>b.presetName==='blink');actor.model.traverse(o=>{if(o.isMesh&&/Face/.test(o.name)&&o.morphTargetInfluences)for(const bind of blink.binds){const index=o.morphTargetDictionary['target_'+bind.index];if(index!==undefined)o.morphTargetInfluences[index]=life.blink*bind.weight/100;}});
 applySkinContacts(actor);diagnostics.reachError=miss;diagnostics.stretchError=0;return {miss,hits:diagnostics.bodyHits,diagnostics};
}
export function poseViewer(actor,targets,curls,point=false,tip=null,gripFrame=null,context={}){
 resetSkinContacts(actor);const diagnostics=freshDiagnostics();actor.lastDiagnostics=diagnostics;
 if((context.clock||0)<(actor.lastPoseTime??0))for(const arm of Object.values(actor.arms)){arm.nativeMotion=null;arm.nativeFrames=0;}
 actor.useHumanoidIK=true;actor.poseDt=Math.min(.07,Math.max(.001,(context.clock||0)-(actor.lastPoseTime??(context.clock||0)-.025)));actor.lastPoseTime=context.clock||0;
 actor.motion.update(context.clock||0,context);actor.root.updateMatrixWorld(true);const q=actor.root.getWorldQuaternion(Q()),up=V(0,1,0).applyQuaternion(q),forward=V(0,0,-1).applyQuaternion(q),right=V(1,0,0).applyQuaternion(q);let miss=0;
 for(const side of ['l','r']){
  const arm=actor.arms[side],shoulder=arm.upper.getWorldPosition(V());
  const localFrame=(side==='r'?context.rightFrame:context.leftFrame)||gripFrame;let fwd=localFrame?.forward||up,normal=localFrame?.normal||forward.clone().negate(),anchor=targets[side],isTip=side==='r'&&point;
  if(isTip){paperGrip(arm);arm.fingers[1].forEach((b,j)=>b.quaternion.copy(arm.rest[1][j]));actor.root.updateMatrixWorld(true);fwd=up.clone().multiplyScalar(.8).addScaledVector(forward,.6).normalize();normal=forward.clone().negate();anchor=tip;}
  const pole=shoulder.clone().addScaledVector(right,side==='l'?-.5:.5).addScaledVector(up,-.28).addScaledVector(forward,-.05);
  const kind=side==='r'?context.kind:null;arm.gripWeight=side==='r'?(context.gripWeight??1):1;arm.toolFlex=localFrame?.wristFlex??.18;arm.toolFlatness=localFrame?.flatness??0;if(!isTip)poseHand(arm,kind||'relaxed',arm.gripWeight);actor.root.updateMatrixWorld(true);
  miss=Math.max(miss,reach(actor,arm,anchor,fwd,normal,pole,isTip,kind,context.collision,diagnostics));
 }
 applySkinContacts(actor);diagnostics.reachError=miss;return miss;
}
export function getPoseDiagnostics(actor){return actor?.lastDiagnostics||{...DIAGNOSTIC_DEFAULT,bodyHits:[],meshHits:[]};}
