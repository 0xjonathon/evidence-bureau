import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {installCharacterAssets,buildDetective,buildViewer} from '../../public/standard-actor.js';
globalThis.self=globalThis;
const loader=new GLTFLoader();loader.register(parser=>{parser.textureLoader={load(url,done){const t=new THREE.Texture();done(t);return t;}};return {name:'NODE_SKELETON_INSPECTION'};});
const originals={},meta={},json={};
for(const role of ['detective','visitor']){
 const b=await readFile(new URL('../../public/assets/'+role+'-standard-v5.glb',import.meta.url));
 json[role]=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 originals[role]=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'');
 meta[role]=JSON.parse(await readFile(new URL('../../public/assets/'+role+'-standard-v5.json',import.meta.url)));
}
export {meta,json};
export function createActors(){
 const models=Object.fromEntries(Object.entries(originals).map(([role,m])=>[role,{scene:clone(m.scene),animations:m.animations}]));
 installCharacterAssets(models,meta);const detective=buildDetective(),visitor=buildViewer();detective.root.position.set(0,1.56,-.75);detective.root.scale.setScalar(.8);detective.root.updateMatrixWorld(true);return {detective,visitor};
}
