import * as THREE from 'three';
import {limbClearance,limbClearanceReport} from './desk-layout.js';
import {prepareHand,poseHand} from './anatomical-hand.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion();
function anatomicalFrame(forward,normal){const y=forward.clone().normalize(),x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));}
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
 const jointFrame=(bone,child)=>anatomicalFrame(child.position,V(0,1,0).applyQuaternion(bone.getWorldQuaternion(Q()).invert()));
 const upperFrame=jointFrame(upper,lower),lowerFrame=jointFrame(lower,wrist);
 return {side,semantic,upper,lower,upperFrame,lowerFrame,wrist,wristRest:wrist.quaternion.clone(),fingers,surface,rest,basis,palm,ends:fingers.map(c=>c[2].children.find(b=>b.isBone)),hand:{root:wrist,tipWorld:()=>end.getWorldPosition(V())},end,lastElbow:null,lastTarget:null};
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
 root.updateMatrixWorld(true);actor.arms={l:makeArm(actor,'l',role==='detective'?'right':'left'),r:makeArm(actor,'r',role==='detective'?'left':'right')};actor.head=bones.head;actor.torso=bones.chest;for(const arm of Object.values(actor.arms))prepareHand(arm);actor.motion=motion(actor);return actor;
}
export function buildDetective(){return build('detective');}
export function buildViewer(){return build('visitor');}
function frameQuat(arm,forward,normal){const y=forward.clone().normalize(),x=y.clone().cross(normal).normalize(),z=x.clone().cross(y).normalize();return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)).multiply(arm.basis.clone().invert());}
function reach(actor,arm,anchor,forward,normal,pole,tip=false,kind=null,collision=false,diagnostics=null){
 const scale=arm.wrist.getWorldScale(V()),point=tip?arm.wrist.worldToLocal(arm.end.getWorldPosition(V())):kind&&arm.graspAnchor?arm.graspAnchor:arm.palm;
 const shoulder=arm.upper.getWorldPosition(V()),a=shoulder.distanceTo(arm.lower.getWorldPosition(V())),b=arm.lower.getWorldPosition(V()).distanceTo(arm.wrist.getWorldPosition(V()));
 let desired=frameQuat(arm,forward,normal),plan,fore,bend=0;
 const preferred=kind&&actor.role==='detective'?V(arm.side==='l'?-.62:.58,1.80,-.65):pole.clone();
 if(kind&&actor.role==='detective'){const blend=THREE.MathUtils.smoothstep(anchor.x,.55,.95)*THREE.MathUtils.smoothstep(anchor.y,2.10,2.32);preferred.lerp(V(.48,2.35,-.75),blend);}
 pole=preferred;
 for(let pass=0;pass<24;pass++){
  const wristTarget=anchor.clone().sub(point.clone().multiply(scale).applyQuaternion(desired));
  const axis=wristTarget.clone().sub(shoulder).normalize(),desiredElbow=wristTarget.clone().addScaledVector(forward,-b),offset=desiredElbow.sub(shoulder);let best=-Infinity;
  if(pass===0)for(let i=-1;i<17;i++){
   if(i===-1&&(!arm.lastElbow||arm.lastTarget?.distanceTo(anchor)>.15))continue;
   const candidate=i===-1?solve(shoulder,wristTarget,a,b,arm.lastElbow):solve(shoulder,wristTarget,a,b,shoulder.clone().add(offset.clone().applyAxisAngle(axis,(i%2?-1:1)*Math.ceil(i/2)*Math.PI/8)));
   const f=candidate.wrist.clone().sub(candidate.elbow).normalize(),wristAngle=f.angleTo(forward),anatomy=candidate.elbow.distanceTo(pole),clearance=collision?Math.min(limbClearance(shoulder,candidate.elbow,.095),limbClearance(candidate.elbow,candidate.wrist,.095)):.02;
   const continuity=arm.lastElbow&&arm.lastTarget?.distanceTo(anchor)<.15?candidate.elbow.distanceTo(arm.lastElbow):0;
   const score=-wristAngle*.25-anatomy*.025-continuity*.15+Math.min(clearance,.015)*2-(clearance<-.005?1:0);
   if(score>best){best=score;plan=candidate;}
  }
  if(pass===0)pole=plan.elbow.clone();else plan=solve(shoulder,wristTarget,a,b,pole);
  fore=plan.wrist.clone().sub(plan.elbow).normalize();const want=forward.clone().normalize(),angle=fore.angleTo(want),limit=THREE.MathUtils.degToRad(32);
  const safe=angle>limit?fore.clone().applyQuaternion(Q().setFromUnitVectors(fore,want).slerp(Q(),1-limit/angle)):want;
  bend=safe.angleTo(fore);const next=frameQuat(arm,safe,normal);
  if(desired.angleTo(next)<.00001)break;desired.slerp(next,.22);
 }
 arm.wrist.quaternion.copy(arm.wristRest);
 const upperDir=plan.elbow.clone().sub(shoulder).normalize(),lowerDir=plan.wrist.clone().sub(plan.elbow).normalize(),hinge=upperDir.clone().cross(lowerDir).normalize().multiplyScalar(arm.semantic==='right'?1:-1);
 rotationWorld(arm.upper,anatomicalFrame(upperDir,hinge).multiply(arm.upperFrame.clone().invert()));
 rotationWorld(arm.lower,anatomicalFrame(lowerDir,hinge).multiply(arm.lowerFrame.clone().invert()));
 // Roll the forearm instead of twisting the wrist skin into a corkscrew.
 const current=V(0,0,1).applyQuaternion(arm.basis).applyQuaternion(arm.wrist.getWorldQuaternion(Q())),wanted=V(0,0,1).applyQuaternion(arm.basis).applyQuaternion(desired);
 const project=n=>n.clone().addScaledVector(fore,-n.dot(fore)).normalize(),n=project(current),m=project(wanted),roll=Math.atan2(fore.dot(n.clone().cross(m)),n.dot(m));
 arm.forearmRoll=roll;addWorldRotation(arm.lower,fore,roll);rotationWorld(arm.wrist,desired);arm.wristBend=bend;
 const actual=tip?arm.end.getWorldPosition(V()):arm.wrist.localToWorld(point.clone()),error=actual.distanceTo(anchor);
 arm.clearance=Math.min(limbClearance(shoulder,plan.elbow,.095),limbClearance(plan.elbow,plan.wrist,.095));
 if(diagnostics){diagnostics.reachError=Math.max(diagnostics.reachError,error);diagnostics.clearanceMin=Math.min(diagnostics.clearanceMin,arm.clearance);}
 arm.lastElbow=plan.elbow.clone();arm.lastTarget=anchor.clone();return error;
}
function relaxHand(arm){poseHand(arm,'relaxed');}
function paperGrip(arm){poseHand(arm,'pinch');}
export function poseDetective(actor,p,life,targets={},grips=null,context={}){
 const diagnostics=freshDiagnostics();actor.lastDiagnostics=diagnostics;
 actor.motion.update(life.time,context);actor.root.updateMatrixWorld(true);
 const lean=context.taskLean??p.lean;
 addWorldRotation(actor.bones.spine,V(1,0,0),lean*.45);addWorldRotation(actor.bones.chest,V(1,0,0),lean*.45);addWorldRotation(actor.head,V(0,1,0),p.headY);addWorldRotation(actor.head,V(1,0,0),p.headX);

 let miss=0;
 for(const side of ['l','r']){
  const arm=actor.arms[side],position=actor.root.localToWorld((grips?.[side]?.position||targets[side]||V(...p[side])).clone());
  if(!grips?.[side]&&!targets[side])position.y=Math.max(1.75,position.y);
  const forward=grips?.[side]?.forward||V(0,0,1),normal=grips?.[side]?.normal||V(0,1,0),pole=context.poles?.[side]||V(side==='l'?-.52:.52,1.75,-.65);
  const kind=grips?.[side]?.kind,weight=grips?.[side]?.weight??1;
  poseHand(arm,kind|| (context.handModes?.[side]==='chin'?'chin':'relaxed'),weight);
  actor.root.updateMatrixWorld(true);arm.gripWeight=weight;
  miss=Math.max(miss,reach(actor,arm,position,forward,normal,pole,context.handModes?.[side]==='tap',kind,context.collision,diagnostics));
  if(context.handModes?.[side]==='tap'){let floor=Infinity;actor.root.updateMatrixWorld(true);for(const {mesh,vertices}of arm.surface)for(const i of vertices){const v=V().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,v).applyMatrix4(mesh.matrixWorld);floor=Math.min(floor,v.y);}if(floor<1.558){position.y+=1.558-floor;reach(actor,arm,position,forward,normal,pole,true,null,context.collision,diagnostics);}}
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
  const kind=side==='r'?context.kind:null;if(!point)poseHand(arm,kind||'relaxed');actor.root.updateMatrixWorld(true);
  miss=Math.max(miss,reach(actor,arm,anchor,fwd,normal,pole,isTip,kind,context.collision,diagnostics));
 }
 diagnostics.reachError=miss;return miss;
}
export function getPoseDiagnostics(actor){return actor?.lastDiagnostics||{...DIAGNOSTIC_DEFAULT,bodyHits:[],meshHits:[]};}
