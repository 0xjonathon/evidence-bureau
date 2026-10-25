import * as THREE from 'three';
import {limbClearance,limbClearanceReport} from './desk-layout.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion();
let assets,metadata;
export function installCharacterAssets(models,meta){assets=models;metadata=meta;}
function boneMap(scene,human){return Object.fromEntries(Object.entries(human).map(([name,node])=>[name,scene.getObjectByName(node)]));}
function rotationWorld(bone,q){const parent=bone.parent.getWorldQuaternion(Q());bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(true,true);}
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
 return {side,semantic,upper,lower,wrist,fingers,surface,rest,basis,palm,ends:fingers.map(c=>c[2].children.find(b=>b.isBone)),hand:{root:wrist,tipWorld:()=>end.getWorldPosition(V())},end,lastElbow:null,lastTarget:null};
}
function motion(actor){
 const mixer=new THREE.AnimationMixer(actor.model);const upper=new Set();for(const b of[actor.bones.leftShoulder,actor.bones.rightShoulder])b.traverse(n=>{if(n.isBone)upper.add(n.name);});
 const boneName=t=>t.name.split('.')[0];const idle=actor.animations.find(a=>a.name==='Sitting_Idle_Loop');
 const legs=new THREE.AnimationClip('seated-base',idle.duration,idle.tracks.filter(t=>!upper.has(boneName(t))));mixer.clipAction(legs).play();
 const actions=new Map();for(const clip of actor.animations){const layer=new THREE.AnimationClip(clip.name,clip.duration,clip.tracks.filter(t=>upper.has(boneName(t))));actions.set(clip.name,mixer.clipAction(layer));}
 const animated=[];actor.model.traverse(b=>{if(b.isBone)animated.push({bone:b,position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()});});let current=null,last=0;
 return {update(time,context){for(const p of animated){p.bone.position.copy(p.position);p.bone.quaternion.copy(p.quaternion);p.bone.scale.copy(p.scale);}let name='Sitting_Idle_Loop';if(context.state==='search')name='Driving_Loop';if(context.sequence&&context.time>1.1&&context.sequence!=='result')name='PickUp_Table';if(context.sequence==='result'&&context.time>3.5)name='Interact';
  if(name!==current){if(current)actions.get(current).fadeOut(.35);actions.get(name).reset().fadeIn(.35).play();current=name;}
  const dt=Math.max(0,Math.min(.1,time-last));last=time;mixer.update(dt);for(const p of animated){p.position.copy(p.bone.position);p.quaternion.copy(p.bone.quaternion);p.scale.copy(p.bone.scale);}
 }};
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
 model.traverse(o=>{if(o.isMesh){const convert=m=>{if(/Body_00_SKIN/.test(m.name)){const next=new THREE.MeshToonMaterial({name:m.name,map:m.map,color:m.color,gradientMap:gradient,alphaTest:.45,side:THREE.DoubleSide});next.toneMapped=false;return next;}if(m.isMeshBasicMaterial)m.toneMapped=false;return m;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});
 const actor={role,root,group:root,model,bones,animations:loaded.animations};
 if(role==='detective'){model.scale.setScalar(3.06);model.position.set(0,-3.6875,.125);model.rotation.y=Math.PI;}
 else{model.scale.setScalar(2.2);model.updateMatrixWorld(true);const shoulderHeight=bones.leftUpperArm.getWorldPosition(V()).y/2.2;model.position.y=-shoulderHeight*2.2-.55;model.traverse(o=>{if(o.isMesh){if(!(o.isSkinnedMesh&&/Body/.test(o.name))||/HAIR|AccessoryNeck/.test(o.material?.name||''))o.visible=false;else{const g=o.geometry,idx=g.index.array,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,headBones=new Set(o.skeleton.bones.map((b,i)=>/Head|Neck/.test(b.name)?i:-1).filter(i=>i>=0)),keep=[];const ownHead=i=>{let n=0;for(let k=0;k<4;k++)if(headBones.has(si.array[i*4+k]))n+=sw.array[i*4+k];return n>.20;};for(let i=0;i<idx.length;i+=3)if(!ownHead(idx[i])&&!ownHead(idx[i+1])&&!ownHead(idx[i+2]))keep.push(idx[i],idx[i+1],idx[i+2]);o.geometry=g.clone();o.geometry.setIndex(keep);}}});}
 root.updateMatrixWorld(true);actor.arms={l:makeArm(actor,'l',role==='detective'?'right':'left'),r:makeArm(actor,'r',role==='detective'?'left':'right')};actor.head=bones.head;actor.torso=bones.chest;actor.motion=motion(actor);return actor;
}
export function buildDetective(){return build('detective');}
export function buildViewer(){return build('visitor');}
function frameQuat(arm,forward,normal){const y=forward.clone().normalize(),x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).multiply(arm.basis.clone().invert());}
function reach(actor,arm,anchor,forward,normal,pole,tip=false,kind=null,collision=false,diagnostics=null){
 let desired=frameQuat(arm,forward,normal);const scale=arm.wrist.getWorldScale(V());
 const point=tip?arm.wrist.worldToLocal(arm.end.getWorldPosition(V())):kind?arm.palm.clone().multiplyScalar(1+.8*(arm.gripWeight??1)):arm.palm;
 const wristTarget=anchor.clone().sub(point.clone().multiply(scale).applyQuaternion(desired));
 const shoulder=arm.upper.getWorldPosition(V()),elbow=arm.lower.getWorldPosition(V()),wrist=arm.wrist.getWorldPosition(V());let plan=solve(shoulder,wristTarget,shoulder.distanceTo(elbow),elbow.distanceTo(wrist),pole);
 if(collision){
  const axis=wristTarget.clone().sub(shoulder).normalize(),offset=(arm.lastElbow&&arm.lastTarget?.distanceTo(anchor)<.20?arm.lastElbow:pole).clone().sub(shoulder);let best=-Infinity;
  for(let i=0;i<64;i++){
   const candidate=solve(shoulder,wristTarget,shoulder.distanceTo(elbow),elbow.distanceTo(wrist),shoulder.clone().add(offset.clone().applyAxisAngle(axis,(i%2?-1:1)*Math.ceil(i/2)*Math.PI/32)));
   const clearance=Math.min(limbClearance(shoulder,candidate.elbow,.095),limbClearance(candidate.elbow,candidate.wrist,.085));
   const score=Math.min(clearance,.025)-.0005*i;if(score>best){best=score;plan=candidate;}if(clearance>.012)break;
  }
  const upperReport=limbClearanceReport(shoulder,plan.elbow,.095),lowerReport=limbClearanceReport(plan.elbow,plan.wrist,.085);
  arm.clearance=Math.min(upperReport.clearance,lowerReport.clearance);
  if(diagnostics){
   diagnostics.clearanceMin=Math.min(diagnostics.clearanceMin,arm.clearance);
   for(const hit of [upperReport,lowerReport])if(hit.clearance<0)diagnostics.bodyHits.push({side:arm.side,solid:hit.solid,clearance:hit.clearance});
  }
 }

 alignBone(arm.upper,arm.lower,plan.elbow);alignBone(arm.lower,arm.wrist,plan.wrist);rotationWorld(arm.wrist,desired);
 const actual=tip?arm.end.getWorldPosition(V()):arm.wrist.localToWorld(point.clone());
 const error=actual.distanceTo(anchor);if(diagnostics)diagnostics.reachError=Math.max(diagnostics.reachError,error);
 if(arm.lastElbow){const before=arm.lastElbow.clone().sub(shoulder),after=plan.elbow.clone().sub(shoulder);if(before.lengthSq()>1e-8&&after.lengthSq()>1e-8&&before.normalize().dot(after.normalize())<-.2)diagnostics.elbowFlip=true;}
 arm.lastElbow=plan.elbow.clone();arm.lastTarget=anchor.clone();return error;
}
function paperGrip(arm){
 const handQ=arm.wrist.getWorldQuaternion(Q()),axis=V(1,0,0).applyQuaternion(arm.basis).applyQuaternion(handQ),normal=V(0,0,1).applyQuaternion(arm.basis).applyQuaternion(handQ);
 for(let f=0;f<5;f++)for(let j=0;j<3;j++){
  const bone=arm.fingers[f][j];bone.quaternion.copy(arm.rest[f][j]);bone.updateWorldMatrix(true,true);
  const bend=f===0?[.30,.12,.08][j]:f===1?[-.15,-.35,-.18][j]:[-.22,-.45,-.25][j];addWorldRotation(bone,axis,bend);
 }
 addWorldRotation(arm.fingers[0][0],normal,arm.semantic==='left'?.22:-.22);
}
function writingGrip(arm){const axis=V(1,0,0).applyQuaternion(arm.basis).applyQuaternion(arm.wrist.getWorldQuaternion(Q()));for(let f=2;f<5;f++)for(let j=0;j<3;j++){const b=arm.fingers[f][j];b.quaternion.copy(arm.rest[f][j]);b.updateWorldMatrix(true,true);addWorldRotation(b,axis,-[.85,1.05,.65][j]);}}
function typingPose(arm,time){
 const axis=V(1,0,0).applyQuaternion(arm.basis).applyQuaternion(arm.wrist.getWorldQuaternion(Q()));
 for(let f=1;f<5;f++)for(let j=0;j<3;j++){
  const bone=arm.fingers[f][j];bone.quaternion.copy(arm.rest[f][j]);bone.updateWorldMatrix(true,true);
  const tap=(1+Math.sin(time*11+f*1.9+(arm.side==='l'?0:2)))*.5;addWorldRotation(bone,axis,-[.04,.06,.03][j]-tap*[.08,.14,.05][j]);
 }
}
function relaxHand(arm){
 const axis=V(1,0,0).applyQuaternion(arm.basis).applyQuaternion(arm.wrist.getWorldQuaternion(Q()));
 for(let f=0;f<5;f++)for(let j=0;j<3;j++){
  const bone=arm.fingers[f][j];bone.quaternion.copy(arm.rest[f][j]);bone.updateWorldMatrix(true,true);
  addWorldRotation(bone,axis,f===0?[.12,.05,.03][j]:[-.06,-.12,-.07][j]);
 }
}
function pinchContact(arm,anchor,normal,gap){
 for(const [f,sign]of [[0,-1],[1,1]]){
  const target=anchor.clone().addScaledVector(normal,gap),chain=arm.fingers[f],end=arm.ends[f];
  target.addScaledVector(normal,(sign-1)*gap);
  for(let iteration=0;iteration<48;iteration++)for(let j=2;j>=0;j--){
   const b=chain[j],pivot=b.getWorldPosition(V()),from=end.getWorldPosition(V()).sub(pivot).normalize(),to=target.clone().sub(pivot).normalize(),delta=Q().setFromUnitVectors(from,to),angle=2*Math.acos(Math.min(1,Math.abs(delta.w)));
   if(angle>.35)delta.copy(Q().slerp(delta,.35/angle));
   rotationWorld(b,delta.multiply(b.getWorldQuaternion(Q())));
  }
 }
 arm.pinchError=Math.max(arm.ends[0].getWorldPosition(V()).distanceTo(anchor.clone().addScaledVector(normal,-gap)),arm.ends[1].getWorldPosition(V()).distanceTo(anchor.clone().addScaledVector(normal,gap)));
}
export function poseDetective(actor,p,life,targets={},grips=null,context={}){
 const diagnostics=freshDiagnostics();actor.lastDiagnostics=diagnostics;
 actor.motion.update(life.time,context);actor.root.updateMatrixWorld(true);
 const lean=context.taskLean??p.lean;
 addWorldRotation(actor.bones.spine,V(1,0,0),lean*.45);addWorldRotation(actor.bones.chest,V(1,0,0),lean*.45);addWorldRotation(actor.head,V(0,1,0),p.headY);addWorldRotation(actor.head,V(1,0,0),p.headX);

 let miss=0;
 for(const side of ['l','r']){
  const arm=actor.arms[side],position=actor.root.localToWorld((grips?.[side]?.position||targets[side]||V(...p[side])).clone());
  if(!grips?.[side]&&!targets[side])position.y=Math.max(1.69,position.y);
  const forward=grips?.[side]?.forward||V(0,0,1),normal=grips?.[side]?.normal||V(0,1,0),pole=context.poles?.[side]||actor.root.localToWorld(V(side==='l'?-1.3:1.3,.15,-.05));
  if(context.handModes?.[side]==='chin'){relaxHand(arm);const axis=V(1,0,0).applyQuaternion(arm.basis).applyQuaternion(arm.wrist.getWorldQuaternion(Q()));for(let f=1;f<5;f++)for(let j=0;j<3;j++)addWorldRotation(arm.fingers[f][j],axis,-[.8,1.0,.6][j]);}else if(context.handModes?.[side]==='tap')typingPose(arm,life.time*.22);else if(grips?.[side])paperGrip(arm);else relaxHand(arm);
  actor.root.updateMatrixWorld(true);const kind=grips?.[side]?.kind;arm.gripWeight=grips?.[side]?.weight??1;if(kind==='pen')writingGrip(arm);
  miss=Math.max(miss,reach(actor,arm,position,forward,normal,pole,context.handModes?.[side]==='tap',kind,context.collision,diagnostics));
  if(context.handModes?.[side]==='tap'){let floor=Infinity;actor.root.updateMatrixWorld(true);for(const {mesh,vertices}of arm.surface)for(const i of vertices){const v=V().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,v).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,v.y);}if(floor<1.554){position.y+=1.554-floor;reach(actor,arm,position,forward,normal,pole,true,null,context.collision,diagnostics);}}
  if(kind){const before=arm.fingers.slice(0,2).map(c=>c.map(b=>b.quaternion.clone()));pinchContact(arm,position,normal,kind==='stamp'?.026:kind==='pen'?.010:.004);for(let f=0;f<2;f++)for(let j=0;j<3;j++)arm.fingers[f][j].quaternion.slerpQuaternions(before[f][j],arm.fingers[f][j].quaternion.clone(),arm.gripWeight);actor.root.updateMatrixWorld(true);diagnostics.pinchError=Math.max(diagnostics.pinchError,arm.pinchError);}
 }
 // The original VRoid facial morphs provide the blink, rather than scaling the head mesh.
 const blink=metadata.detective.blink.find(b=>b.presetName==='blink');actor.model.traverse(o=>{if(o.isMesh&&/Face/.test(o.name)&&o.morphTargetInfluences)for(const bind of blink.binds){const index=o.morphTargetDictionary['target_'+bind.index];if(index!==undefined)o.morphTargetInfluences[index]=life.blink*bind.weight/100;}});
 diagnostics.reachError=miss;diagnostics.stretchError=0;return {miss,hits:diagnostics.bodyHits,diagnostics};
}
export function poseViewer(actor,targets,curls,point=false,tip=null,gripFrame=null,context={}){
 const diagnostics=freshDiagnostics();actor.lastDiagnostics=diagnostics;
 actor.motion.update(context.clock||0,context);actor.root.updateMatrixWorld(true);const q=actor.root.getWorldQuaternion(Q()),up=V(0,1,0).applyQuaternion(q),forward=V(0,0,-1).applyQuaternion(q),right=V(1,0,0).applyQuaternion(q);let miss=0;
 for(const side of ['l','r']){
  const arm=actor.arms[side],shoulder=arm.upper.getWorldPosition(V());
  const localFrame=(side==='r'?context.rightFrame:context.leftFrame)||gripFrame;let fwd=localFrame?.forward||up,normal=localFrame?.normal||forward.clone().negate(),anchor=targets[side],isTip=side==='r'&&point;
  if(isTip){paperGrip(arm);arm.fingers[1].forEach((b,j)=>b.quaternion.copy(arm.rest[1][j]));actor.root.updateMatrixWorld(true);fwd=up.clone().multiplyScalar(.8).addScaledVector(forward,.6).normalize();normal=forward.clone().negate();anchor=tip;}
  const pole=shoulder.clone().addScaledVector(right,side==='l'?-.8:.8).addScaledVector(up,-1.0).addScaledVector(forward,-.2);
  if(!point)paperGrip(arm);actor.root.updateMatrixWorld(true);const kind=side==='r'?context.kind:null;if(kind==='pen')writingGrip(arm);
  miss=Math.max(miss,reach(actor,arm,anchor,fwd,normal,pole,isTip,kind,context.collision,diagnostics));if(kind){pinchContact(arm,anchor,normal,.008);diagnostics.pinchError=Math.max(diagnostics.pinchError,arm.pinchError);}
 }
 diagnostics.reachError=miss;return miss;
}
export function getPoseDiagnostics(actor){return actor?.lastDiagnostics||{...DIAGNOSTIC_DEFAULT,bodyHits:[],meshHits:[]};}
