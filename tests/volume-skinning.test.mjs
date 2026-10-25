import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Vector3} from 'three';
import {rigidBlend,volumeShader} from '../public/volume-skinning.js';
import {createActors} from './support/standard-actors.mjs';
test('sleeve skinning preserves radius through opposing forearm twists',()=>{
 const up=new Vector3(0,1,0),a=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(up,Math.PI/2)),b=new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(up,-Math.PI/2)),p=new Vector3(1,.5,0).applyMatrix4(rigidBlend([a,b],[.5,.5]));
 assert.ok(Math.abs(Math.hypot(p.x,p.z)-1)<1e-9);assert.ok(Math.abs(p.y-.5)<1e-9);
});
test('volume skinning retains rigid translation and common scale at every blend weight',()=>{
 const m=new Matrix4().compose(new Vector3(.4,-2,1),new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.7),new Vector3(2.448,2.448,2.448));
 for(const w of [0,.1,.5,.9,1])assert.ok(new Vector3(.2,.4,.8).applyMatrix4(m).distanceTo(new Vector3(.2,.4,.8).applyMatrix4(rigidBlend([m,m],[w,1-w])))<1e-9);
});
test('shirt, blazer, collar and their shadow passes use the same volume deformation',()=>{
 const {detective:d}=createActors();let garments=0;d.model.traverse(m=>{if(!m.isSkinnedMesh||!/Detective blazer|Detective collar/.test(m.material.name))return;garments++;assert.ok(m.userData.volumeSkinning);assert.equal(m.material.customProgramCacheKey(),'evidence-volume-v1');assert.equal(m.customDepthMaterial.customProgramCacheKey(),'evidence-volume-v1');assert.equal(m.customDistanceMaterial.customProgramCacheKey(),'evidence-volume-v1');});assert.ok(garments>=4);
 const shader={vertexShader:'#include <skinning_pars_vertex>\n#include <skinbase_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>'};volumeShader(shader);assert.ok(shader.vertexShader.includes('ebTranslation'));assert.ok(!shader.vertexShader.includes('#include <skinning_vertex>'));assert.ok(!shader.vertexShader.includes('#include <skinnormal_vertex>'));
});
