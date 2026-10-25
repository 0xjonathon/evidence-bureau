import {Matrix4,Vector3} from 'three';
import {SOLIDS} from './desk-layout.js';
const MAX_COMPRESSION=.012;
// A small finger-pad corrective, not an IK escape hatch: only vertices strongly
// owned by native hand/finger joints, and only a shallow 0.012 scene-unit band
// at a contact. Forearms, body and deep intersections remain collision errors.
export function prepareSkinContacts(actor){
 actor.contactSkin=[];
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!/SKIN/.test(mesh.material?.name||''))return;
  const g=mesh.geometry,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,ids=new Set(mesh.skeleton.bones.map((b,i)=>/J_Bip_[LR]_(Hand|Thumb|Index|Middle|Ring|Little)/.test(b.name)?i:-1)),vertices=[];
  for(let i=0;i<g.attributes.position.count;i++){let own=0;for(let k=0;k<4;k++)if(ids.has(si.getComponent(i,k)))own+=sw.getComponent(i,k);if(own>.8)vertices.push(i);}
  if(vertices.length)actor.contactSkin.push({mesh,vertices,base:g.attributes.position.array.slice(),changed:[]});
 });
}
export function resetSkinContacts(actor){
 for(const s of actor.contactSkin||[]){const p=s.mesh.geometry.attributes.position;for(const i of s.changed)p.setXYZ(i,s.base[i*3],s.base[i*3+1],s.base[i*3+2]);if(s.changed.length)p.needsUpdate=true;s.changed=[];}
}
export function applySkinContacts(actor){
 actor.root.updateMatrixWorld(true);let count=0,max=0;
 for(const s of actor.contactSkin||[]){
  const m=s.mesh,g=m.geometry,positions=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,skin=m.skeleton.bones.map((b,i)=>new Matrix4().multiplyMatrices(b.matrixWorld,m.skeleton.boneInverses[i]));
  const toWorld=new Matrix4().multiplyMatrices(m.matrixWorld,m.bindMatrixInverse),weighted=new Matrix4(),full=new Matrix4(),world=new Vector3(),target=new Vector3();
  for(const i of s.vertices){
   world.fromArray(s.base,i*3);m.applyBoneTransform(i,world).applyMatrix4(m.matrixWorld);target.copy(world);
   for(const solid of SOLIDS){
    const top=solid.p.y+solid.size.y/2;
    if(Math.abs(world.x-solid.p.x)>solid.size.x/2||Math.abs(world.z-solid.p.z)>solid.size.z/2||world.y<top-MAX_COMPRESSION||world.y>top+.0005)continue;
    target.y=Math.max(target.y,top+.0005);
   }
   const delta=target.y-world.y;if(delta<=0)continue;
   weighted.elements.fill(0);
   for(let k=0;k<4;k++){const weight=sw.getComponent(i,k);if(!weight)continue;const matrix=skin[si.getComponent(i,k)].elements;for(let n=0;n<16;n++)weighted.elements[n]+=matrix[n]*weight;}
   full.copy(toWorld).multiply(weighted).multiply(m.bindMatrix).invert();target.applyMatrix4(full);positions.setXYZ(i,target.x,target.y,target.z);s.changed.push(i);count++;max=Math.max(max,delta);
  }
  if(s.changed.length)positions.needsUpdate=true;
 }
 actor.skinContact={vertices:count,maxCompression:max};
}
