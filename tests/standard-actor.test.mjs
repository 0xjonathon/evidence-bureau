import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createActors,meta,json} from './support/standard-actors.mjs';import {poseDetective,poseViewer,getPoseDiagnostics} from '../public/standard-actor.js';import {pose,life,composePose,sequencePlan} from '../public/clips.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const frame={forward:V(0,1,0).applyAxisAngle(V(1,0,0),-.6),normal:V(0,0,1).applyAxisAngle(V(1,0,0),-.6)};
test('both shipped models retain the external standard humanoid skeletons and articulated fingers',()=>{
 assert.equal(meta.detective.sourceModel,'Sakurada_Fumiriya');assert.equal(meta.visitor.sourceModel,'Sendagaya_Shibu');
 for(const [role,count]of [['detective',107],['visitor',129]]){
  assert.equal(meta[role].license,'CC0-1.0');assert.equal(json[role].skins[0].joints.length,count);assert.equal(Object.keys(meta[role].humanoid).length,54);
  const names=new Set(json[role].nodes.map(n=>n.name));for(const node of Object.values(meta[role].humanoid))assert.ok(names.has(node));
  for(const side of ['left','right'])for(const finger of ['Thumb','Index','Middle','Ring','Little'])for(const segment of ['Proximal','Intermediate','Distal'])assert.ok(meta[role].humanoid[side+finger+segment]);
 }
});
test('the motion layers are actual retargeted source clips with hand, body, and seated animation channels',()=>{
 for(const role of ['detective','visitor'])for(const name of ['Sitting_Idle_Loop','Sitting_Talking_Loop','Driving_Loop','PickUp_Table','Interact']){
  const clip=json[role].animations.find(a=>a.name===name);assert.ok(clip);assert.ok(clip.channels.length>250);const nodes=new Set(clip.channels.map(c=>json[role].nodes[c.target.node].name));
  for(const humanoid of ['hips','spine','head','leftHand','rightHand','leftIndexDistal'])assert.ok(nodes.has(meta[role].humanoid[humanoid]));
 }
});
test('runtime joints and render meshes come from the imported skins, with no constructed hand bones',()=>{
 const {detective,visitor}=createActors();for(const a of [detective,visitor]){
  for(const side of ['l','r'])for(const key of ['upper','lower','wrist'])assert.ok(a.arms[side][key].isBone);
  let skinned=0;a.model.traverse(o=>{if(o.isSkinnedMesh){skinned++;assert.ok(o.skeleton.bones.length>=107);const w=o.geometry.attributes.skinWeight;for(let i=0;i<w.count;i++){let sum=0;for(let j=0;j<4;j++){assert.ok(Number.isFinite(w.array[i*4+j]));sum+=w.array[i*4+j];}assert.ok(Math.abs(sum-1)<.002);}}});assert.ok(skinned>0);
 }
});
test('successive IK overlays do not accumulate angles or bury the seated body',()=>{
 const {detective}=createActors();const grips={};for(const [k,x]of [['l',-.416],['r',.416]])grips[k]={position:detective.root.worldToLocal(V(x,2.18,.22)),...frame};
 const lengths=Object.fromEntries(Object.entries(detective.arms).map(([k,a])=>[k,[a.upper.getWorldPosition(V()).distanceTo(a.lower.getWorldPosition(V())),a.lower.getWorldPosition(V()).distanceTo(a.wrist.getWorldPosition(V()))]]));
 for(let i=0;i<300;i++){
  const result=poseDetective(detective,pose('offer',2.3),life(i/40),{},grips,{state:'sequence',sequence:'onboard',time:3.2});assert.ok(result.miss<.005,`contact ${result.miss}`);
  assert.ok(detective.head.getWorldPosition(V()).y>2.4);
  for(const [k,a]of Object.entries(detective.arms)){assert.ok(a.upper.getWorldPosition(V()).y>2.05);assert.ok(Math.abs(a.upper.getWorldPosition(V()).distanceTo(a.lower.getWorldPosition(V()))-lengths[k][0])<1e-5);assert.ok(Math.abs(a.lower.getWorldPosition(V()).distanceTo(a.wrist.getWorldPosition(V()))-lengths[k][1])<1e-5);}
 }
});
function setupViewer(a,fov,depth){const cam=new THREE.PerspectiveCamera(fov);cam.position.set(0,2.9,2.9);cam.lookAt(0,2.2,.45);cam.updateMatrixWorld(true);const fwd=V(0,0,-1).applyQuaternion(cam.quaternion),up=V(0,1,0).applyQuaternion(cam.quaternion),drop=.55-depth*Math.tan(fov*Math.PI/360)-.20;a.root.position.copy(cam.position).addScaledVector(up,-.02+drop).addScaledVector(fwd,depth);a.root.quaternion.copy(cam.quaternion);a.root.updateMatrixWorld(true);return cam;}
test('the standard first-person rig reaches the sheet while shoulders stay below the camera frame',()=>{
 const {visitor}=createActors(),cam=setupViewer(visitor,49,2.1),targets={l:V(-.424,2.002,.365),r:V(.424,2.002,.365)};
 for(let i=0;i<120;i++){const miss=poseViewer(visitor,targets,{l:.4,r:.4},false,null,frame,{clock:i/40,state:'sequence',sequence:'onboard',time:3.2});assert.ok(miss<.005);for(const a of Object.values(visitor.arms)){const ndc=a.upper.getWorldPosition(V()).project(cam);assert.ok(ndc.y<-1,'shoulder cutoff is visible');}}
});
test('pointing uses the real imported index fingertip and maintains the UI contact position',()=>{
 const {visitor}=createActors(),cam=setupViewer(visitor,49,1.05),tip=cam.localToWorld(V(.1,-.3,-1.65)),targets={l:cam.localToWorld(V(-.5,-1.6,-1.4)),r:tip};
 for(let i=0;i<60;i++){poseViewer(visitor,targets,{l:.7,r:.7},true,tip,null,{clock:i/40,state:'sequence',sequence:'onboard',time:.75});assert.ok(visitor.arms.r.hand.tipWorld().distanceTo(tip)<.005);}
});
test('the imported hand surfaces stay above the desk during the seated idle loop',()=>{
 const {detective}=createActors(),hands=[];
 detective.model.traverse(o=>{if(!o.isSkinnedMesh||!/Body/.test(o.name))return;const g=o.geometry,ids=new Set(o.skeleton.bones.map((b,i)=>/J_Bip_[LR]_(Hand|Thumb|Index|Middle|Ring|Little)/.test(b.name)?i:-1)),vertices=[];
  for(let i=0;i<g.attributes.position.count;i++){let sum=0;for(let j=0;j<4;j++)if(ids.has(g.attributes.skinIndex.array[i*4+j]))sum+=g.attributes.skinWeight.array[i*4+j];if(sum>.8)vertices.push(i);}if(vertices.length)hands.push({mesh:o,vertices});
 });
 assert.ok(hands.reduce((n,h)=>n+h.vertices.length,0)>1000);
 for(let frame=0;frame<60;frame++){
  const t=frame/15;poseDetective(detective,pose('idle',t),life(t),{},null,{state:'greet',time:0});detective.root.updateMatrixWorld(true);
  for(const {mesh,vertices}of hands)for(const i of vertices){const p=V().fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,p).applyMatrix4(mesh.matrixWorld);assert.ok(p.y>1.605,`hand intersects desk at ${p.y}`);}
 }
});
test('both original arms reach the scanner bed without stretching the skeleton',()=>{
 const {detective}=createActors(),q=new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-Math.PI/2),grips={};
 for(const [side,x]of [['l',-.52],['r',.52]])grips[side]={position:detective.root.worldToLocal(V(-.76,1.802,-.06).add(V(x*.72,-.02*.84,-.012).applyQuaternion(q))),forward:V(0,1,0).applyQuaternion(q),normal:V(0,0,1).applyQuaternion(q)};
 for(let frame=0;frame<60;frame++){
  const result=poseDetective(detective,composePose(sequencePlan('submit'),2.94,pose('idle',0)),life(frame/30),{},grips,{state:'sequence',sequence:'submit',time:2.94});assert.ok(result.miss<.005,`scanner grip misses by ${result.miss}`);
  for(const arm of Object.values(detective.arms))for(const bone of [arm.upper,arm.lower,arm.wrist])assert.ok(bone.scale.distanceTo(V(1,1,1))<.00001);
 }
});
test('pose diagnostics expose contact, clearance and elbow stability without NaN',()=>{
 const {detective}=createActors(),q=new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-Math.PI/2),grips={};
 for(const [side,x]of [['l',-.52],['r',.52]])grips[side]={position:detective.root.worldToLocal(V(-.76,1.802,-.06).add(V(x*.72,-.02*.84,-.012).applyQuaternion(q))),forward:V(0,1,0).applyQuaternion(q),normal:V(0,0,1).applyQuaternion(q),kind:'pinch'};
 const result=poseDetective(detective,pose('idle',0),life(0),{},grips,{state:'sequence',sequence:'submit',time:2.94,collision:true});
 const d=getPoseDiagnostics(detective);assert.equal(result.diagnostics,d);
 for(const key of ['reachError','pinchError','clearanceMin','stretchError'])assert.ok(Number.isFinite(d[key]),`${key} is not finite`);
 assert.ok(Array.isArray(d.bodyHits)&&Array.isArray(d.meshHits));assert.equal(typeof d.elbowFlip,'boolean');assert.ok(d.reachError<.2);
});
