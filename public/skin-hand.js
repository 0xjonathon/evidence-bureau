import * as THREE from 'three';
let source=null;
export function installHandSurface(data){source=data;}
export function createSkinHand(thumbSign,scale,material){
 const root=new THREE.Group(),bones=[new THREE.Bone()],chains=[];bones[0].name='wrist';
 const fingers=source?.fingers||[];
 for(let f=0;f<fingers.length;f++){
  const spec=fingers[f],chain=[],base=new THREE.Vector3(...spec.base),dir=new THREE.Vector3(...(spec.direction||[0,1,0])).normalize();
  let parent=bones[0];
  for(let j=0;j<3;j++){
   const b=new THREE.Bone();b.name=`finger_${f}_${j}`;b.position.copy(j===0?base:dir.clone().multiplyScalar(spec.length/3));parent.add(b);parent=b;bones.push(b);chain.push(b);
  }chains.push(chain);
 }
 const geometry=new THREE.BufferGeometry();
 if(source){
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));geometry.setIndex(source.indices);geometry.computeVertexNormals();
  const si=[],sw=[];
  for(let i=0;i<source.positions.length;i+=3){
   const v=new THREE.Vector3(...source.positions.slice(i,i+3));let best=null;
   fingers.forEach((f,k)=>{const base=new THREE.Vector3(...f.base),d=new THREE.Vector3(...(f.direction||[0,1,0])).normalize(),delta=v.clone().sub(base),along=delta.dot(d),perp=delta.clone().addScaledVector(d,-along).length();
    if(along>-.025&&(!best||perp<best.perp))best={k,along,perp,f};});
   if(!best||best.perp>.075){si.push(0,0,0,0);sw.push(1,0,0,0);continue;}
   const t=Math.max(0,Math.min(2,best.along/(best.f.length/3))),lo=Math.floor(t),u=t-lo,blend=THREE.MathUtils.smoothstep(best.along,-.02,.035),a=1+best.k*3+lo,b=Math.min(a+1,3+best.k*3);
   si.push(0,a,b,0);sw.push(1-blend,blend*(1-u),blend*u,0);
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 }
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='Single continuous hand surface';mesh.add(bones[0]);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;root.add(mesh);
 // Authored left hand is mirrored once at the outer group; normals are handled by Three's determinant.
 root.scale.set(thumbSign<0?-scale:scale,scale,scale);
 function set(curl,point=false){
  chains.forEach((chain,f)=>chain.forEach((b,j)=>{b.rotation.set(0,0,0);if(f===4){b.rotation.x=-curl*.42;b.rotation.z=-curl*.38;}else b.rotation.x=-(point&&f===0?0:curl)*(j===0?.78:j===1?1.1:.65);}));
 }
 const tip=new THREE.Vector3(fingers[0]?.base[0]||-.105,(fingers[0]?.base[1]||.233)+(fingers[0]?.length||.192),-.007);
 return {root,mesh,bones,chains,thumbSign,scale,tip,set,
  tipWorld(){root.updateMatrixWorld(true);const p=tip.clone();const b=chains[0]?.[2];if(!b)return root.localToWorld(p);return b.localToWorld(new THREE.Vector3(0,(fingers[0].length)/3,-.007));},
  grip(){set(.62);chains[4]?.forEach((b,j)=>{b.rotation.x=j===0?.70:.12;b.rotation.z=j===0?-.65:0;});}
 };
}
export function createSleeve(upperLength,lowerLength,girth,material){
 const rows=30,sides=24,positions=[],indices=[],si=[],sw=[],length=upperLength+lowerLength;
 for(let y=0;y<=rows;y++){
  const h=length*y/rows,r=girth*(.15-.055*y/rows+.012*Math.sin(y/rows*Math.PI))*(y===0?.04:y===1?.9:1);
  for(let j=0;j<sides;j++){const a=j*2*Math.PI/sides;positions.push(Math.cos(a)*r,h,Math.sin(a)*r);const w=THREE.MathUtils.smoothstep(h,upperLength-.12,upperLength+.12);si.push(0,1,0,0);sw.push(1-w,w,0,0);}
 }
 for(let y=0;y<rows;y++)for(let j=0;j<sides;j++){const a=y*sides+j,b=y*sides+(j+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 const a=new THREE.Bone(),b=new THREE.Bone();a.add(b);b.position.y=upperLength;
 const mesh=new THREE.SkinnedMesh(g,material);mesh.add(a);mesh.bind(new THREE.Skeleton([a,b]));mesh.frustumCulled=false;mesh.castShadow=true;
 return {mesh,a,b};
}
