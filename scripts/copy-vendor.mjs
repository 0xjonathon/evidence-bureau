// Copies the pinned three.js build into public/vendor so static hosting can serve it.
// Locally, server/index.mjs serves the same paths straight from node_modules.
import {cp, mkdir, rm, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const three = path.join(root, 'node_modules/three');
const out = path.join(root, 'public/vendor');

await rm(out, {recursive: true, force: true});
await mkdir(path.join(out, 'addons/loaders'), {recursive: true});
await mkdir(path.join(out, 'addons/utils'), {recursive: true});
await mkdir(path.join(out, 'addons/geometries'), {recursive: true});
await cp(path.join(three, 'examples/jsm/geometries/RoundedBoxGeometry.js'), path.join(out, 'addons/geometries/RoundedBoxGeometry.js'));
await cp(path.join(three, 'build/three.module.js'), path.join(out, 'three.module.js'));
await cp(path.join(three, 'build/three.core.js'), path.join(out, 'three.core.js'));
// Only the addon files the scene imports (see public/scene.js).
await cp(path.join(three, 'examples/jsm/loaders/GLTFLoader.js'), path.join(out, 'addons/loaders/GLTFLoader.js'));
await cp(path.join(three, 'examples/jsm/utils/BufferGeometryUtils.js'), path.join(out, 'addons/utils/BufferGeometryUtils.js'));
console.log('vendor ready:', out);
await cp(path.join(root,'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs'),path.join(out,'rapier.mjs'));
await cp(path.join(root,'node_modules/@dimforge/rapier3d-compat/LICENSE'),path.join(out,'RAPIER-LICENSE'));
await mkdir(path.join(out,'hanzi'),{recursive:true});
for(const name of await readdir(path.join(root,'node_modules/hanzi-writer-data'))){if(name.endsWith('.json')&&[...name.replace('.json','')].length===1||name==='ARPHICPL.TXT')await cp(path.join(root,'node_modules/hanzi-writer-data',name),path.join(out,'hanzi',name));}
