import * as THREE from 'three';
// Dual-quaternion blending preserves sleeve volume through elbow bends and
// shoulder twists. Collision queries use the same transform as the GPU.
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion();
export function rigidBlend(matrices,weights){
 const real=new THREE.Quaternion(0,0,0,0),dual=new THREE.Quaternion(0,0,0,0),p=V(),q=Q(),s=V();let reference,scale=0;
 for(let i=0;i<matrices.length;i++){
  if(!weights[i])continue;matrices[i].decompose(p,q,s);reference??=q.clone();const sign=reference.dot(q)<0?-1:1,w=weights[i]*sign,d=new THREE.Quaternion(p.x,p.y,p.z,0).multiply(q);
  real.x+=q.x*w;real.y+=q.y*w;real.z+=q.z*w;real.w+=q.w*w;dual.x+=d.x*w*.5;dual.y+=d.y*w*.5;dual.z+=d.z*w*.5;dual.w+=d.w*w*.5;scale+=s.x*weights[i];
 }
 const length=real.length();real.set(real.x/length,real.y/length,real.z/length,real.w/length);dual.set(dual.x/length,dual.y/length,dual.z/length,dual.w/length);const translation=dual.multiply(real.clone().conjugate());
 return new THREE.Matrix4().compose(V().set(translation.x*2,translation.y*2,translation.z*2),real,V().setScalar(scale));
}
const functions=`
#ifdef USE_SKINNING
vec4 ebQuat(mat3 m){
 float tr=m[0][0]+m[1][1]+m[2][2];vec4 q;
 if(tr>0.0){float s=sqrt(tr+1.0)*2.0;q=vec4((m[1][2]-m[2][1])/s,(m[2][0]-m[0][2])/s,(m[0][1]-m[1][0])/s,0.25*s);}
 else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){float s=sqrt(1.0+m[0][0]-m[1][1]-m[2][2])*2.0;q=vec4(.25*s,(m[1][0]+m[0][1])/s,(m[2][0]+m[0][2])/s,(m[1][2]-m[2][1])/s);}
 else if(m[1][1]>m[2][2]){float s=sqrt(1.0+m[1][1]-m[0][0]-m[2][2])*2.0;q=vec4((m[1][0]+m[0][1])/s,.25*s,(m[2][1]+m[1][2])/s,(m[2][0]-m[0][2])/s);}
 else{float s=sqrt(1.0+m[2][2]-m[0][0]-m[1][1])*2.0;q=vec4((m[2][0]+m[0][2])/s,(m[2][1]+m[1][2])/s,.25*s,(m[0][1]-m[1][0])/s);}return normalize(q);
}
vec4 ebMultiply(vec4 a,vec4 b){return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz));}
vec3 ebRotate(vec4 q,vec3 p){return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
void ebAdd(mat4 m,float w,vec4 ref,inout vec4 r,inout vec4 d,inout float scale){
 float s=length(m[0].xyz);vec4 q=ebQuat(mat3(m)/s);float signQ=dot(q,ref)<0.0?-1.0:1.0;
 r+=w*signQ*q;d+=w*signQ*.5*ebMultiply(vec4(m[3].xyz,0.0),q);scale+=w*s;
}
#endif
`;
const palette=`
#include <skinbase_vertex>
#ifdef USE_SKINNING
vec4 ebReal=vec4(0.0),ebDual=vec4(0.0);float ebScale=0.0;
vec4 ebReference=ebQuat(mat3(boneMatX)/length(boneMatX[0].xyz));
ebAdd(boneMatX,skinWeight.x,ebReference,ebReal,ebDual,ebScale);ebAdd(boneMatY,skinWeight.y,ebReference,ebReal,ebDual,ebScale);ebAdd(boneMatZ,skinWeight.z,ebReference,ebReal,ebDual,ebScale);ebAdd(boneMatW,skinWeight.w,ebReference,ebReal,ebDual,ebScale);
float ebLength=length(ebReal);ebReal/=ebLength;ebDual/=ebLength;
vec3 ebTranslation=2.0*ebMultiply(ebDual,vec4(-ebReal.xyz,ebReal.w)).xyz;
#endif
`;
const normals=`
#ifdef USE_SKINNING
objectNormal=mat3(bindMatrixInverse)*ebRotate(ebReal,mat3(bindMatrix)*objectNormal);
#ifdef USE_TANGENT
objectTangent=mat3(bindMatrixInverse)*ebRotate(ebReal,mat3(bindMatrix)*objectTangent);
#endif
#endif
`;
const positions=`
#ifdef USE_SKINNING
vec3 ebPoint=(bindMatrix*vec4(transformed,1.0)).xyz;
transformed=(bindMatrixInverse*vec4(ebRotate(ebReal,ebPoint*ebScale)+ebTranslation,1.0)).xyz;
#endif
`;
export function volumeShader(shader){shader.vertexShader=shader.vertexShader.replace('#include <skinning_pars_vertex>','#include <skinning_pars_vertex>\n'+functions).replace('#include <skinbase_vertex>',palette).replace('#include <skinnormal_vertex>',normals).replace('#include <skinning_vertex>',positions);}
function material(original){const m=original.clone();m.onBeforeCompile=volumeShader;m.customProgramCacheKey=()=> 'evidence-volume-v1';return m;}
export function installVolumeSkinning(actor){
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||/SKIN|Face|HAIR|EYE/i.test(mesh.material?.name||''))return;
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(material):material(mesh.material);
  mesh.customDepthMaterial=material(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}));
  mesh.customDistanceMaterial=material(new THREE.MeshDistanceMaterial());mesh.userData.volumeSkinning=true;
  mesh.applyBoneTransform=function(index,position){
   const si=this.geometry.attributes.skinIndex,sw=this.geometry.attributes.skinWeight,matrices=[],weights=[];
   for(let k=0;k<4;k++){const id=si.getComponent(index,k);matrices.push(new THREE.Matrix4().multiplyMatrices(this.skeleton.bones[id].matrixWorld,this.skeleton.boneInverses[id]));weights.push(sw.getComponent(index,k));}
   return position.applyMatrix4(this.bindMatrix).applyMatrix4(rigidBlend(matrices,weights)).applyMatrix4(this.bindMatrixInverse);
  };
 });
}
