import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const v=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export const SCAN_SHEET=v(-.76,1.802,-.06);
export const SCAN_SCALE=v(.72,.84,1);
export function createEquipment(scene,room){
 const cream=new THREE.MeshStandardMaterial({color:'#c6c6aa',roughness:.58}),dark=new THREE.MeshStandardMaterial({color:'#182c30',roughness:.55}),metal=new THREE.MeshStandardMaterial({color:'#607b79',metalness:.55,roughness:.35});
 function box(parent,name,p,size,mat,r=.025){const o=new THREE.Mesh(new RoundedBoxGeometry(...size,3,r),mat);o.name=name;o.position.copy(p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function label(parent,text,p,w,h){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#183936';ctx.fillRect(0,0,512,96);ctx.fillStyle='#bed4be';ctx.font='bold 31px monospace';ctx.textAlign='center';ctx.fillText(text,256,60);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t}));m.position.copy(p);parent.add(m);return m;}
 // Keyboard from the old CRT becomes part of the detective's workstation, rotated toward him.
 const keyboard=new THREE.Group();keyboard.name='DetectiveKeyboard';scene.add(keyboard);room.updateMatrixWorld(true);
 for(const o of [...room.children])if(/^Keyboard/.test(o.name))keyboard.attach(o);
 keyboard.position.set(-1.7,0,-.65);keyboard.rotation.y=Math.PI; // re-centre below after rotation about the old keyboard centre
 const bounds=new THREE.Box3().setFromObject(keyboard),center=bounds.getCenter(v());keyboard.position.add(v(.67,1.665,-.28).sub(center));
 const laptop=new THREE.Group();laptop.name='DetectiveComputer';scene.add(laptop);
 box(laptop,'Computer rear',v(1.03,1.96,.03),[.85,.60,.065],dark,.04);
 box(laptop,'Computer hinge',v(1.03,1.68,.03),[.89,.07,.095],metal,.02);
 const back=label(laptop,'E / B',v(1.03,1.96,.068),.34,.065);void back;
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(.76,.49),new THREE.MeshBasicMaterial({color:'#245e58'}));screen.name='DetectiveScreen';screen.position.set(1.03,1.97,-.008);screen.rotation.y=Math.PI;laptop.add(screen);
 const scanner=new THREE.Group();scanner.name='EvidenceScanner';scene.add(scanner);
 box(scanner,'Scanner chassis',v(-.76,1.688,-.06),[1.02,.15,.83],cream,.055);
 box(scanner,'Scanner bed',v(-.76,1.772,-.06),[.91,.018,.73],dark,.008);
 const glass=new THREE.Mesh(new THREE.PlaneGeometry(.87,.68),new THREE.MeshPhysicalMaterial({color:'#86c4b7',transparent:true,opacity:.14,roughness:.12,metalness:.15,depthWrite:false}));glass.rotation.x=-Math.PI/2;glass.position.copy(SCAN_SHEET).add(v(0,.008,0));scanner.add(glass);
 const lid=new THREE.Group();lid.position.set(-.76,1.79,-.46);scanner.add(lid);box(lid,'Scanner lid',v(0,.015,.40),[1.02,.065,.82],cream,.035);box(lid,'Scanner lid lining',v(0,-.023,.40),[.90,.01,.71],dark,.008);
 const scanLight=new THREE.Mesh(new THREE.PlaneGeometry(.82,.025),new THREE.MeshBasicMaterial({color:'#69ffd6',transparent:true,opacity:.9,depthWrite:false}));scanLight.rotation.x=-Math.PI/2;scanLight.position.copy(SCAN_SHEET).add(v(0,.02,0));scanner.add(scanLight);scanLight.visible=false;

 const status=label(scanner,'READY / SCAN',v(-.76,1.68,.366),.50,.050);
 const led=box(scanner,'Scanner status',v(-.32,1.688,.362),[.025,.025,.008],new THREE.MeshBasicMaterial({color:'#76f4cb'}),.003);
 return {scanner,lid,scanLight,screen,keyboard,laptop,led,
  update(t,active){status.material.color.set(active&&t>=3.7&&t<5.1?'#68ffc9':'#ffffff');led.material.color.set(active&&t>=3.7&&t<5.1?(Math.sin(t*22)>0?'#ffffff':'#38dca8'):'#76f4cb');lid.rotation.x=active?-1.15*(1-THREE.MathUtils.smoothstep(t,3.05,3.65)):0;scanLight.visible=active&&t>=3.7&&t<5.1;scanLight.position.z=-.36+THREE.MathUtils.clamp((t-3.7)/1.4,0,1)*.60;},
 };
}
