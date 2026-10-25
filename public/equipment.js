import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {V,SOLIDS,SCAN_PAPER} from './desk-layout.js';
export const SCAN_SHEET=SCAN_PAPER,SCAN_SCALE=V(1,1,1);
export async function createEquipment(scene,room){
 room.traverse(o=>{if(/^(Keyboard|Printer|Monitor|Rubber|Pen|Leather_writing_mat|Desk_top|Desk_front_edge)/i.test(o.name))o.visible=false;});
 const root=(await new GLTFLoader().loadAsync('/assets/instrument-v9.glb?v=9')).scene;root.name='EvidenceIntegratedInstrument';scene.add(root);
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 for(const spec of SOLIDS.filter(s=>s.name.startsWith('desk')||s.name.startsWith('pen-rest')||s.name==='writing-mat')){const m=new THREE.Mesh(new RoundedBoxGeometry(...spec.size.toArray(),3,Math.min(.055,spec.size.y/4)),new THREE.MeshStandardMaterial({color:spec.name.startsWith('desk')?'#6b422c':spec.name.startsWith('pen-rest')?'#b49353':'#1d3931',metalness:spec.name.startsWith('pen-rest')?.65:0,roughness:spec.name.startsWith('desk')?.65:.9}));m.name=spec.name;m.position.copy(spec.p);m.castShadow=true;m.receiveShadow=true;root.add(m);}
 const screen=root.getObjectByName('VisitorFacingAgentScreen');screen.material=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
 const led=root.getObjectByName('InstrumentStatus'),scanLight=root.getObjectByName('OpticalScanBar');led.material=new THREE.MeshBasicMaterial({color:'#8dffdf',toneMapped:false});scanLight.material=new THREE.MeshBasicMaterial({color:'#8dffdf',toneMapped:false});
 const scanPoint=new THREE.PointLight('#80ffe0',0,1.2);scanPoint.position.set(1.46,2.30,-.72);root.add(scanPoint);
 return {root,screen,scanLight,update(task,scanning){scanLight.visible=scanning;scanLight.position.z=-1.00+task.progress*.56;scanPoint.intensity=scanning?.45:0;led.material.color.set(scanning?'#fff0b5':'#8dffdf');}};
}
