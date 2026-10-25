import RAPIER from './vendor/rapier.js';
import * as THREE from 'three';
import {V,SOLIDS,PAPER_SIZE,DESK_PAPER} from './desk-layout.js';
let initialized;
export async function createDeskPhysics(){
 initialized??=RAPIER.init();await initialized;
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/120;world.numSolverIterations=12;world.integrationParameters.normalizedPredictionDistance=.001;world.integrationParameters.normalizedAllowedLinearError=.0002;world.integrationParameters.maxCcdSubsteps=4;
 const boxes=[];for(const solid of SOLIDS){const d=RAPIER.ColliderDesc.cuboid(solid.size.x/2,solid.size.y/2,solid.size.z/2).setTranslation(...solid.p.toArray()).setFriction(.8);const c=world.createCollider(d);c.userData={name:solid.name};boxes.push(c);}
 let body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...DESK_PAPER.toArray()).setCcdEnabled(true).setLinearDamping(8).setAngularDamping(12).enabledRotations(false,false,false));
 const shape=new RAPIER.Cuboid(PAPER_SIZE.x/2,PAPER_SIZE.y/2,PAPER_SIZE.z/2);
 let collider=world.createCollider(RAPIER.ColliderDesc.cuboid(PAPER_SIZE.x/2,PAPER_SIZE.y/2,PAPER_SIZE.z/2).setDensity(45).setFriction(1).setRestitution(0),body);
 let held=false,blocked=0,accumulator=0;
 function step(dt,target,grasp,lidAngle=0){
  accumulator+=Math.min(dt,.50);while(accumulator>=world.timestep){
   if(grasp){
    const pos=body.translation(),delta=target.clone().sub(V(pos.x,pos.y,pos.z)),length=delta.length();
    // Shape sweep is necessary: kinematic targets alone do not stop on contact.
    let allowed=1;
    if(length>.00001){const hit=world.castShape(pos,{x:0,y:0,z:0,w:1},delta,shape,0,1,false,undefined,undefined,collider,body);if(hit){allowed=Math.max(0,hit.time_of_impact-.002/length);blocked++;}}
    const speed=delta.multiplyScalar(allowed).multiplyScalar(1/world.timestep);speed.clampLength(0,3.6);
    body.setLinvel(speed,true);body.setGravityScale(0,true);
   }else{body.setGravityScale(1,true);if(held)body.setLinvel({x:0,y:0,z:0},true);}
   held=grasp;world.step();accumulator-=world.timestep;
  }
  const p=body.translation();return {position:V(p.x,p.y,p.z),blocked};
 }
 function newSheet(point){
  world.removeRigidBody(body);
  body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...point.toArray()).setCcdEnabled(true).setLinearDamping(8).setAngularDamping(12).enabledRotations(false,false,false));
  collider=world.createCollider(RAPIER.ColliderDesc.cuboid(PAPER_SIZE.x/2,PAPER_SIZE.y/2,PAPER_SIZE.z/2).setDensity(45).setFriction(1),body);held=false;
 }
 return {world,get body(){return body;},get collider(){return collider;},boxes,step,newSheet,position:()=>{const p=body.translation();return V(p.x,p.y,p.z);},dispose:()=>world.free()};
}
