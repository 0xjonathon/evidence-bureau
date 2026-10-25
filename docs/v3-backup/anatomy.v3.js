import * as THREE from 'three';
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion();
const Y=new THREE.Vector3(0,1,0);
/** A continuous skinned character. All poses deform one surface through real joints. */
export function createActor(root,{viewer=false}={}){
 const bones=new Map(),rest=new Map();root.traverse(o=>{if(o.isBone){bones.set(o.name,o);rest.set(o.name,o.quaternion.clone());}if(o.isMesh){o.castShadow=!viewer;o.receiveShadow=true;o.frustumCulled=false;if(o.material){const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{m.roughness=Math.max(m.roughness||.6,.52);if(m.transparent){m.depthWrite=true;m.alphaTest=.32;}});}}});
 if(viewer){const meshes=[];root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});for(const source of meshes){source.visible=false;if(/eyebrow|short04|high-poly|shoes/.test(source.name))continue;const geometry=source.geometry.clone(),indices=geometry.index,skinIndices=geometry.attributes.skinIndex,skinWeights=geometry.attributes.skinWeight;const retained=[];const weight=i=>{let w=0;for(let k=0;k<4;k++){const name=source.skeleton.bones[skinIndices.getComponent(i,k)]?.name||'';if(/^(lowerarm|hand|index|middle|ring|pinky|thumb)_/.test(name))w+=skinWeights.getComponent(i,k);}return w;};for(let i=0;i<indices.count;i+=3){const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);if(weight(a)>.65&&weight(b)>.65&&weight(c)>.65)retained.push(a,b,c);}geometry.setIndex(retained);geometry.computeBoundingSphere();const view=source.clone(false);view.name='FirstPersonArms_'+source.name;view.geometry=geometry;view.visible=true;view.frustumCulled=false;source.parent.add(view);}}
 const get=name=>bones.get(name);root.updateMatrixWorld(true);
 const arms={};for(const side of ['l','r']){
  const hand=get('hand_'+side),middle=get('middle_01_'+side),index=get('index_01_'+side),pinky=get('pinky_01_'+side);
  const f=middle.position.clone().normalize(),l=index.position.clone().sub(pinky.position);l.addScaledVector(f,-l.dot(f)).normalize();const n=l.clone().cross(f).normalize();
  const localBasis=new THREE.Matrix4().makeBasis(l,f,n);arms[side]={upper:get('upperarm_'+side),lower:get('lowerarm_'+side),hand,basis:new THREE.Quaternion().setFromRotationMatrix(localBasis).invert(),tipLength:get('index_03_'+side).position.length()*.85,tipLocal:hand.worldToLocal(get('index_03_'+side).localToWorld(new THREE.Vector3(0,get('index_03_'+side).position.length()*.85,0))),fingers:[...bones.values()].filter(b=>/^(index|middle|ring|pinky|thumb)_/.test(b.name)&&b.name.endsWith('_'+side))};
 }
 function worldRotation(bone,q){const parent=bone.parent.getWorldQuaternion(Q()).invert();bone.quaternion.copy(parent.multiply(q));bone.updateWorldMatrix(false,true);}
 function aim(bone,child,target){const p=bone.getWorldPosition(V()),from=child.getWorldPosition(V()).sub(p).normalize(),to=target.clone().sub(p).normalize();const delta=Q().setFromUnitVectors(from,to);worldRotation(bone,delta.multiply(bone.getWorldQuaternion(Q())));}
 function solve(upper,lower,end,target,pole){root.updateWorldMatrix(true,true);const s=upper.getWorldPosition(V()),e=lower.getWorldPosition(V()),w=end.getWorldPosition(V());const a=s.distanceTo(e),b=e.distanceTo(w),dir=target.clone().sub(s);const d=THREE.MathUtils.clamp(dir.length(),Math.abs(a-b)+.002,a+b-.002);dir.normalize();const bend=pole.clone().sub(s);bend.addScaledVector(dir,-bend.dot(dir));if(bend.lengthSq()<.0001)bend.set(0,0,1);bend.normalize();const along=(a*a-b*b+d*d)/(2*d),h=Math.sqrt(Math.max(0,a*a-along*along));const elbow=s.clone().addScaledVector(dir,along).addScaledVector(bend,h);const wrist=s.clone().addScaledVector(dir,d);aim(upper,lower,elbow);aim(lower,end,wrist);}
 function reset(){for(const [name,b]of bones)b.quaternion.copy(rest.get(name));if(viewer)get('head').scale.setScalar(.001);root.updateWorldMatrix(true,true);}
 function palm(side,target,forward,backNormal,curl=.1,{point=false,pole,contactTarget}={}){
  const arm=arms[side],f=forward.clone().normalize(),normal=backNormal.clone().normalize();const lateral=f.clone().cross(normal).normalize().multiplyScalar(side==='l'?1:-1);const z=lateral.clone().cross(f).normalize();const q=Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral,f,z)).multiply(arm.basis);
  const scale=root.getWorldScale(V()).x;const wrist=point&&contactTarget?contactTarget.clone().sub(arm.tipLocal.clone().applyQuaternion(q).multiplyScalar(scale)):target.clone().addScaledVector(f,-.075*scale);
  solve(arm.upper,arm.lower,arm.hand,wrist,pole||target.clone().add(new THREE.Vector3(side==='l'?.7:-.7,.25,-.4)));
  worldRotation(arm.hand,q);
  // Flex phalanges around a common anatomical bend plane; no separate capsule pieces.
  const flexAxis=f.clone().cross(normal.clone().negate()).normalize();
  for(const bone of arm.fingers){const isIndex=bone.name.startsWith('index_');const amount=point&&isIndex?0:curl*(bone.name.startsWith('thumb_')?.38:1);if(amount)worldRotation(bone,Q().setFromAxisAngle(flexAxis,amount).multiply(bone.getWorldQuaternion(Q())));}
  return wrist.distanceTo(arm.hand.getWorldPosition(V()));
 }
 function seated(){for(const side of ['l','r']){const x=side==='l'?.28:-.28;solve(get('thigh_'+side),get('calf_'+side),get('foot_'+side),new THREE.Vector3(x,.22,.4),new THREE.Vector3(x,1.0,1.15));}}
 return {root,bones,reset,palm,seated,get,worldRotation,tip(side){const a=arms[side];return get('index_03_'+side).localToWorld(new THREE.Vector3(0,a.tipLength,0));}};
}
