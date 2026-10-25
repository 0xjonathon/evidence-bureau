import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {installCharacterAssets,buildDetective,poseDetective,buildViewer,poseViewer,placePalm,POLES} from '../public/rig.js';
import {pose,life} from '../public/clips.js';import {shareText,publicSources} from '../public/share.js';
import {sequences,paperOwner} from '../public/motion.js';
const data=JSON.parse(await readFile(new URL('../public/assets/seamless-hand-v4.json',import.meta.url),'utf8'));
installCharacterAssets(null,data);const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
test('the hand surface is one connected mesh with five authored fingers, without duplicated shells',()=>{
 assert.equal(data.fingers.length,5);assert.ok(data.positions.length/3<10000);assert.equal(data.normals.length,data.positions.length);
 const edges=new Map();for(let i=0;i<data.indices.length;i+=3)for(let j=0;j<3;j++){const a=data.indices[i+j],b=data.indices[i+(j+1)%3];if(!edges.has(a))edges.set(a,new Set());if(!edges.has(b))edges.set(b,new Set());edges.get(a).add(b);edges.get(b).add(a);}
 const seen=new Set(),stack=[0];while(stack.length){const n=stack.pop();if(seen.has(n))continue;seen.add(n);for(const x of edges.get(n)||[])stack.push(x);}assert.equal(seen.size,data.positions.length/3,'stray or duplicated hand shells');
 const unique=new Set();for(let i=0;i<data.positions.length;i+=3)unique.add(data.positions.slice(i,i+3).join(','));assert.equal(unique.size,data.positions.length/3,'duplicate vertices/surfaces');
});
test('all skin influences are finite, normalized, and target one of the sixteen deform joints',()=>{
 const det=buildDetective();for(const side of ['l','r']){const hand=det.arms[side].hand;assert.equal(hand.bones.length,16);assert.equal(hand.root.children.filter(o=>o.isSkinnedMesh).length,1);const {skinIndex:idx,skinWeight:w}=hand.mesh.geometry.attributes;for(let i=0;i<w.count;i++){let sum=0;for(let j=0;j<4;j++){assert.ok(idx.array[i*4+j]<16);const v=w.array[i*4+j];assert.ok(Number.isFinite(v)&&v>=0);sum+=v;}assert.ok(Math.abs(sum-1)<1e-6);}}
});
test('paper pinch constraints align the real palms and keep the arm surfaces attached',()=>{
 const det=buildDetective();const frame={forward:V(0,1,0),normal:V(0,0,1)};
 const grips={l:{position:V(-.50,.70,1.1),...frame},r:{position:V(.50,.70,1.1),...frame}};
 const diag=poseDetective(det,pose('offer',2),life(0),{},grips);assert.ok(diag.miss<.01);
 det.root.updateMatrixWorld(true);
 for(const s of ['l','r']){const arm=det.arms[s],p=arm.hand.root.localToWorld(V(0,.135,0));assert.ok(p.distanceTo(grips[s].position)<.01);assert.ok(arm.hand.chains[0][1].rotation.x<-.5);assert.ok(arm.hand.chains[4][0].rotation.x>0);assert.ok(arm.surface.mesh.isSkinnedMesh);assert.ok(arm.surface.b.getWorldPosition(V()).distanceTo(arm.lower.getWorldPosition(V()))<1e-6);}
});
test('first-person paper grips and pointing fingers remain finite under camera transforms',()=>{
 const viewer=buildViewer();viewer.group.position.set(0,2.9,2.35);viewer.group.rotation.x=-.1;viewer.group.updateMatrixWorld(true);
 const targets={l:V(-.35,2.35,.7),r:V(.35,2.35,.7)},frame={forward:V(0,1,0),normal:V(0,0,1)};
 const miss=poseViewer(viewer,targets,{l:.4,r:.4},false,null,frame);assert.ok(miss<.03);
 const tip=V(.2,2.3,.8);poseViewer(viewer,targets,{l:.7,r:.7},true,tip);assert.ok(viewer.arms.r.hand.tipWorld().distanceTo(tip)<.03);
});
test('scan completes only after shared contact, grasp, placement and a visible scan interval',()=>{
 const at=cue=>sequences.submit.cues.find(c=>c[1]===cue)[0];assert.ok(at('contact')<at('grasp'));assert.ok(at('grasp')<at('place'));assert.ok(at('place')<at('scan'));assert.ok(at('scanned')-at('scan')>=1);assert.ok(sequences.submit.duration>at('scanned'));assert.equal(paperOwner('submit',at('scan')),'scanner');
});
test('sharing preserves demo status, sources and uncertainty without private browser URLs or tokens',()=>{
 const r={id:'CASE-TEST',claim:'公开科学问题',verdict:'unknown',summary:'证据还不够。',mode:'demo',sources:[{title:'source',url:'https://example.com/article'},{title:'injection',url:'javascript:alert(1)'}],limitations:['仍需一手来源']};
 assert.equal(publicSources(r).length,1);const text=shareText(r);for(const s of ['离线示例','无法判断','https://example.com/article','仍需一手来源'])assert.ok(text.includes(s));assert.ok(!text.includes('javascript:'));assert.ok(!text.includes('127.0.0.1'));assert.ok(!text.includes('x-agent-token'));
});
test('mobile viewmodel reaches the shared sheet without extending beyond its bones',()=>{
 const viewer=buildViewer(),camera=new THREE.PerspectiveCamera();camera.position.set(0,2.9,2.9);camera.lookAt(0,2.2,.45);camera.updateMatrixWorld(true);const forward=V(0,0,-1).applyQuaternion(camera.quaternion),up=V(0,1,0).applyQuaternion(camera.quaternion);
 viewer.group.position.copy(camera.position).addScaledVector(up,-.02).addScaledVector(forward,.42);viewer.group.quaternion.copy(camera.quaternion);viewer.group.updateMatrixWorld(true);
 const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.60,0,0)),center=V(0,2.193,.234),targets={};for(const [k,x]of [['l',-.53],['r',.53]])targets[k]=V(x,-.29,-.012).multiplyScalar(.8).applyQuaternion(rotation).add(center);
 const miss=poseViewer(viewer,targets,{l:.6,r:.6},false,null,{forward:V(0,1,0).applyQuaternion(rotation),normal:V(0,0,1).applyQuaternion(rotation)});assert.ok(miss<.01,`mobile grip miss ${miss}`);
});
