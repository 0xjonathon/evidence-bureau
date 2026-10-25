import test from 'node:test';
import {simulateRuntime} from './support/runtime-motion.mjs';
import assert from 'node:assert/strict';
import {createActors} from './support/standard-actors.mjs';
import {poseDetective,poseViewer} from '../public/standard-actor.js';
import {poseHand,FINGER_LIMITS} from '../public/anatomical-hand.js';
import {V,TIMES,PLAYBACK_SPEED,SOLIDS,deskTask,STAMP_REST,PEN_REST,REPORT_STATION} from '../public/desk-layout.js';
import {carryingContact,stampAction,penAction} from '../public/desk-performance.js';
import {applySkinContacts,resetSkinContacts} from '../public/skin-contact.js';
import {pose,life} from '../public/clips.js';

test('grips use bounded native finger hinges and retain all native arm lengths',()=>{
 for(const actor of Object.values(createActors()))for(const arm of Object.values(actor.arms)){
  const lengths=arm.fingers.flat().map(b=>b.position.length());
  for(const kind of ['pen','stamp','pinch','chin','tap','relaxed']){
   poseHand(arm,kind);
   for(let f=0;f<5;f++)for(let j=0;j<3;j++){
    const angle=arm.fingerAngles[f*3+j],max=f===0?FINGER_LIMITS.thumb[1]:[FINGER_LIMITS.mcp,FINGER_LIMITS.pip,FINGER_LIMITS.dip][j][1];
    assert.ok(angle>=0&&angle<=max+.001,`${kind}: finger ${f}/${j} hyperextends`);
   }
   assert.deepEqual(arm.fingers.flat().map(b=>b.position.length()),lengths);
  }
 }
});

test('the actual carry and tool clips retain native limb lengths, bounded wrist motion and a continuous elbow branch',async()=>{
 for(const [verdict,cancel]of [['supported',false],['refuted',false],['mixed',false],['unknown',false],['supported',true]]){
  let lengths;
  const r=await simulateRuntime(verdict,{fps:40,cancel,onFrame:({actor,name,state,t})=>{
   lengths??=Object.values(actor.arms).map(a=>[a.upper.getWorldPosition(V()).distanceTo(a.lower.getWorldPosition(V())),a.lower.getWorldPosition(V()).distanceTo(a.wrist.getWorldPosition(V()))]);
   Object.values(actor.arms).forEach((a,i)=>{
    assert.ok(Math.abs(a.upper.getWorldPosition(V()).distanceTo(a.lower.getWorldPosition(V()))-lengths[i][0])<1e-5);
    assert.ok(Math.abs(a.lower.getWorldPosition(V()).distanceTo(a.wrist.getWorldPosition(V()))-lengths[i][1])<1e-5);
    assert.ok(a.nativeMotion.elbow<=2.6001,`${name||state}/${t}: elbow over-folded`);
    assert.ok(Math.abs(a.nativeMotion.roll)<=1.15001);
    assert.ok(a.wristBend<=.60001);
   });
  }});
  assert.ok(r.maxima.heldMiss<.005,`${verdict}/${cancel}: contact ${r.maxima.heldMiss}`);
  assert.ok(r.maxima.jointStep<.19,`${verdict}/${cancel}: joint jump ${r.maxima.jointStep} at ${JSON.stringify(r.maxima.jointStepAt)}`);
 }
});

test('the runtime torso and thighs stay seated in the recess throughout pickup and report handling',async()=>{
 await simulateRuntime('supported',{fps:20,onFrame:({actor:d,name,state,t})=>{
  assert.equal(d.root.position.x,0,'reach must lean the torso instead of sliding the hips into the desk');
  d.model.traverse(m=>{
   if(!m.isSkinnedMesh)return;const g=m.geometry;
   for(let i=0;i<g.attributes.position.count;i++){
    let own=0;for(let k=0;k<4;k++)if(/Hips|Spine|Chest|UpperLeg|LowerLeg|Foot/.test(m.skeleton.bones[g.attributes.skinIndex.array[i*4+k]].name))own+=g.attributes.skinWeight.array[i*4+k];if(own<.8)continue;
    const p=V().fromBufferAttribute(g.attributes.position,i);m.applyBoneTransform(i,p).applyMatrix4(m.matrixWorld);
    for(const s of SOLIDS.filter(s=>s.name.startsWith('desk')||s.name==='writing-mat'))assert.ok(!['x','y','z'].every(k=>Math.abs(p[k]-s.p[k])<s.size[k]/2-.001),`${name||state}/${t}: body vertex inside ${s.name}`);
   }
  });
 }});
});

test('skin-only forearm twist joints keep complete, independent bind palettes',()=>{
 for(let i=0;i<3;i++)for(const actor of Object.values(createActors())){
  actor.model.traverse(m=>{if(m.isSkinnedMesh){assert.equal(m.skeleton.boneInverses.length,m.skeleton.bones.length);assert.equal(m.skeleton.boneMatrices.length,m.skeleton.bones.length*16);}});
  for(const arm of Object.values(actor.arms)){assert.equal(arm.twistBones.length,4);assert.deepEqual(arm.twistBones.map(b=>b.fraction),[.25,.5,.75,1]);}
 }
});

test('controlled playback leaves time for grasp, contact and release without rushing the body',()=>{
 assert.ok(TIMES.submit/PLAYBACK_SPEED<8);assert.ok(TIMES.result/PLAYBACK_SPEED<16);
});

test('tools stay on their rests until grasp is complete and are set down before release',()=>{
 for(let i=0;i<=350;i++){
  const t=7.9+i*.02,tip=REPORT_STATION.clone().add(V(-.2,.004,.1));
  for(const [a,rest]of [[stampAction(t,REPORT_STATION),STAMP_REST],[penAction(t,REPORT_STATION,tip),PEN_REST]])if(a.position.distanceTo(rest)>.001)assert.ok(a.weight>.999,`tool moved before grasp / after release at ${t}`);
 }
});

test('finger-pad contact correction is shallow, reversible and does not move the contact skeleton',()=>{
 const{visitor:v}=createActors();v.root.position.set(0,2.65,1.66);v.root.updateMatrixWorld(true);const axis=V(.35,1,.08).normalize();
 poseViewer(v,{l:V(-.46,1.68,.8),r:V(0,1.564,.6).addScaledVector(axis,.105)},{l:.5,r:.5},false,null,null,{clock:1,state:'writing',kind:'pen',rightFrame:{forward:V(0,0,-1),normal:V(0,1,0)},leftFrame:{forward:V(0,0,-1),normal:V(0,1,0)},collision:true});
 assert.ok(v.skinContact.vertices>0);assert.ok(v.skinContact.maxCompression<=.0126);
 const bones=Object.values(v.arms).flatMap(a=>[a.upper,a.lower,a.wrist]).map(b=>b.getWorldPosition(V()).toArray()),surfaces=v.contactSkin.map(s=>s.mesh.geometry.attributes.position.array.slice());
 resetSkinContacts(v);for(const s of v.contactSkin)assert.deepEqual(s.mesh.geometry.attributes.position.array,s.base);
 applySkinContacts(v);assert.deepEqual(Object.values(v.arms).flatMap(a=>[a.upper,a.lower,a.wrist]).map(b=>b.getWorldPosition(V()).toArray()),bones);
 for(let i=0;i<v.contactSkin.length;i++)assert.deepEqual(v.contactSkin[i].mesh.geometry.attributes.position.array,surfaces[i]);
});
