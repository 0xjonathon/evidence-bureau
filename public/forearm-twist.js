import * as THREE from 'three';
// Skin-only twist joints preserve the elbow seam while the radius/ulna turn.
// The native elbow, wrist and all finger joints remain the contact skeleton.
export function installForearmTwist(actor,arm){
 const fractions=[.25,.5,.75,1],axis=arm.wrist.position.clone().normalize(),length=arm.wrist.position.length();
 arm.twistAxis=axis;arm.twistBones=fractions.map((fraction,i)=>{const bone=new THREE.Bone();bone.name=`${arm.lower.name}_Twist_${i+1}`;arm.lower.add(bone);return {bone,fraction};});
 actor.root.updateMatrixWorld(true);
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;const skeleton=mesh.skeleton,index=skeleton.bones.indexOf(arm.lower);if(index<0)return;
  const original=mesh.geometry,weights=original.attributes.skinWeight,indices=original.attributes.skinIndex;
  if(!Array.from(indices.array).some((n,i)=>n===index&&weights.array[i]>0))return;
  skeleton.bones=skeleton.bones.slice();skeleton.boneInverses=skeleton.boneInverses.map(m=>m.clone());
  mesh.geometry=original.clone();const g=mesh.geometry,inv=skeleton.boneInverses[index].clone(),slots=[index];
  for(const {bone}of arm.twistBones){let slot=skeleton.bones.indexOf(bone);if(slot<0){slot=skeleton.bones.length;skeleton.bones.push(bone);skeleton.boneInverses.push(inv.clone());}slots.push(slot);}
  const si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
  for(let i=0;i<g.attributes.position.count;i++){
   const entries=[];for(let k=0;k<4;k++){const id=si.getComponent(i,k),weight=sw.getComponent(i,k);if(weight<=0)continue;
    if(id!==index){entries.push([id,weight]);continue;}
    const local=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(mesh.bindMatrix).applyMatrix4(inv),t=THREE.MathUtils.smoothstep(local.dot(axis)/length,.08,.92)*4,lo=Math.min(3,Math.floor(t)),u=t-lo;
    entries.push([slots[lo],weight*(1-u)],[slots[lo+1],weight*u]);
   }
   entries.sort((a,b)=>b[1]-a[1]);const keep=entries.slice(0,4),sum=keep.reduce((n,p)=>n+p[1],0)||1;
   for(let k=0;k<4;k++){si.setComponent(i,k,keep[k]?.[0]||0);sw.setComponent(i,k,(keep[k]?.[1]||0)/sum);}
  }
  skeleton.init();si.needsUpdate=true;sw.needsUpdate=true;
 });
}
export function turnForearm(arm,angle){for(const {bone,fraction}of arm.twistBones||[])bone.quaternion.setFromAxisAngle(arm.twistAxis,angle*fraction);}
