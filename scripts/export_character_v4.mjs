// Export the exact in-game continuous sleeves, sixteen-joint hands and authored anime meshes.
import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {installCharacterAssets,buildDetective,poseDetective,buildViewer,poseViewer} from '../public/rig.js';
import {pose,life} from '../public/clips.js';
import * as THREE from 'three';
class LocalFileReader {readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:'+blob.type+';base64,'+Buffer.from(b).toString('base64');this.onloadend?.();});}}
globalThis.FileReader=LocalFileReader;
const root=new URL('../',import.meta.url),bytes=await readFile(new URL('public/assets/anime-detective-v4.glb',root));
const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
installCharacterAssets(loaded.scene,JSON.parse(await readFile(new URL('public/assets/seamless-hand-v4.json',root),'utf8')));
const det=buildDetective();det.root.name='Anime Detective / runtime rig';poseDetective(det,pose('idle',0),life(0));det.root.updateMatrixWorld(true);
const output=await new GLTFExporter().parseAsync(det.root,{binary:true,onlyVisible:true});
await writeFile(new URL('public/assets/character-rig-v4.glb',root),Buffer.from(output));
console.log('Exact runtime rig exported:',output.byteLength);
