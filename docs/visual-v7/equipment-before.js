import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {V,SOLIDS,SCAN_PAPER} from './desk-layout.js';
export const SCAN_SHEET=SCAN_PAPER,SCAN_SCALE=V(.76,.76,1);
export function createEquipment(scene,room){
 room.traverse(o=>{if(/^(Keyboard|Printer|Monitor)/.test(o.name))o.visible=false;});
 const cream=new THREE.MeshStandardMaterial({color:'#c6c6aa',roughness:.58}),dark=new THREE.MeshStandardMaterial({color:'#182c30',roughness:.55}),metal=new THREE.MeshStandardMaterial({color:'#607b79',metalness:.55,roughness:.35});
 const mat=room.getObjectByName('Leather_writing_mat');mat.scale.y=1/12;mat.position.y=1.551;
 const root=new THREE.Group();root.name='MeasuredWorkstation';scene.add(root);
 const parts={};
 for(const spec of SOLIDS.filter(s=>!['desk','writing-mat'].includes(s.name))){
  const material=spec.name.startsWith('laptop')?dark:spec.name==='scanner-bed'?dark:cream;
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(...spec.size.toArray(),3,Math.min(.025,spec.size.y/4,spec.size.z/4)),material);mesh.name=spec.name;mesh.position.copy(spec.p);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);parts[spec.name]=mesh;
 }
 // These keys belong to the laptop base; there is no separate keyboard object.
 const keys=new THREE.Group();keys.name='LaptopBuiltInKeys';root.add(keys);
 for(let row=0;row<4;row++)for(let col=0;col<12;col++){const key=new THREE.Mesh(new THREE.BoxGeometry(.058,.008,.048),metal);key.position.set(-.385+col*.07,1.635,-.70+row*.065);keys.add(key);}
 const pad=new THREE.Mesh(new THREE.PlaneGeometry(.25,.09),metal);pad.rotation.x=-Math.PI/2;pad.position.set(0,1.633,-.31);root.add(pad);
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(.86,.535),new THREE.MeshBasicMaterial({color:'#245e58',toneMapped:false}));screen.name='LaptopAgentScreen';screen.position.set(0,1.95,-.190);screen.rotation.y=Math.PI;root.add(screen);
 const lid=new THREE.Group();lid.name='ScannerLidHinge';lid.position.set(-1.22,1.768,-.66);root.add(lid);
 const cover=new THREE.Mesh(new RoundedBoxGeometry(1.08,.046,.82,3,.012),cream);cover.position.z=.41;cover.castShadow=true;lid.add(cover);
 const lining=new THREE.Mesh(new THREE.BoxGeometry(.98,.008,.72),dark);lining.position.set(0,-.024,.41);lid.add(lining);
 const scanLight=new THREE.Mesh(new THREE.PlaneGeometry(.86,.018),new THREE.MeshBasicMaterial({color:'#69ffd6',transparent:true,opacity:.85,depthWrite:false}));scanLight.rotation.x=-Math.PI/2;scanLight.position.copy(SCAN_PAPER).add(V(0,.006,0));root.add(scanLight);scanLight.visible=false;
 return {root,lid,screen,laptop:parts['laptop-base'],keys,scanLight,
  update(task,scanning){lid.rotation.x=-1.65*task.lid;scanLight.visible=scanning;scanLight.position.z=-.55+task.progress*.60;}
 };
}
