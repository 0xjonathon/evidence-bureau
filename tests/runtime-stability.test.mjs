import test from 'node:test';
import assert from 'node:assert/strict';
import {createActors} from './support/standard-actors.mjs';
import {detectivePerformance} from '../public/detective-performance.js';
import {poseDetective} from '../public/standard-actor.js';
import {pose,life} from '../public/clips.js';
import {SCAN_PAPER,DESK_PAPER} from '../public/desk-layout.js';

test('the chin-to-work hand frame never collapses or reverses its handedness',()=>{
 for(let i=0;i<=200;i++){
  const {grips}=detectivePerformance({clock:0,workBlend:i/200,paper:DESK_PAPER});
  for(const g of Object.values(grips)){
   assert.ok(Math.abs(g.forward.length()-1)<1e-6);
   assert.ok(Math.abs(g.normal.length()-1)<1e-6);
   assert.ok(Math.abs(g.forward.dot(g.normal))<1e-6,'the hand axes became collinear during the transition');
  }
 }
});

test('a held pose stops solving after settling and cannot keep shivering at a fixed target',()=>{
 const{detective:d}=createActors();d.root.position.set(0,1.36,-.75);let previous,maxStep=0;
 for(let i=0;i<350;i++){
  d.root.updateMatrixWorld(true);
  const performance=detectivePerformance({name:'submit',time:5.8,clock:0,workBlend:1,paper:SCAN_PAPER});
  const grips=Object.fromEntries(Object.entries(performance.grips).map(([s,g])=>[s,{...g,position:d.root.worldToLocal(g.position.clone())}]));
  poseDetective(d,pose('idle',0),life(i/40),{},grips,performance.context);
  const joints=Object.values(d.arms).flatMap(a=>[a.upper,a.lower,a.wrist]).map(b=>b.quaternion.clone());
  if(i>200)for(let j=0;j<joints.length;j++)maxStep=Math.max(maxStep,joints[j].angleTo(previous[j]));
  previous=joints;
 }
 assert.ok(maxStep<1e-5,`fixed targets continued rotating: ${maxStep} radians per frame`);
 assert.ok(Object.values(d.arms).every(a=>a.nativeSettled));
});
