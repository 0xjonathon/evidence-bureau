import * as THREE from 'three';
export const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export const DESK_TOP=1.55,PAPER_SIZE=V(.84,.006,.60);
export const DESK_PAPER=V(0,1.56,.60),SCAN_PAPER=V(1.46,2.228,-.60),PRINTER_PAPER=V(1.46,1.699,.78);
export const REPORT_STATION=V(-.30,1.56,.60);
export const FLAT=new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-Math.PI/2);
export const STAMP_REST=V(-.81,1.558,-.02),PEN_REST=V(-.62,1.64,.18),VISITOR_PEN=V(.59,1.569,1.02);
// Render geometry, swept paper volume and limb IK use these identical dimensions.
export const SOLIDS=[
 {name:'desk',p:V(0,1.45,.925),size:V(7.15,.20,1.35)},
 {name:'desk-rear-left',p:V(-2.0875,1.45,-.525),size:V(2.975,.20,1.55)},
 {name:'desk-rear-right',p:V(2.0875,1.45,-.525),size:V(2.975,.20,1.55)},
 {name:'pen-rest-front',p:V(-.5938,1.59,-.0384),size:V(.045,.08,.045)},
 {name:'pen-rest-back',p:V(-.5819,1.59,-.1377),size:V(.045,.08,.045)},
 {name:'writing-mat',p:V(0,1.551,.80),size:V(2.1,.002,1.10)},
 {name:'instrument-plinth',p:V(1.46,1.608,-.32),size:V(1.14,.10,1.04)},
 {name:'instrument-upper',p:V(1.46,1.984,-.32),size:V(1.14,.46,1.04)},
 {name:'instrument-back',p:V(1.46,1.70,-.825),size:V(1.14,.092,.03)},
 {name:'instrument-left',p:V(.905,1.70,-.32),size:V(.03,.092,1.04)},
 {name:'instrument-right',p:V(2.015,1.70,-.32),size:V(.03,.092,1.04)},
 {name:'instrument-glass',p:V(1.46,2.218,-.32),size:V(1.02,.008,.88)},
 {name:'instrument-output',p:V(1.46,1.686,.66),size:V(1.04,.016,.92)},
];
for(const solid of SOLIDS)if(solid.name.startsWith('instrument-'))solid.p.z-=.40;
export const PLAYBACK_SPEED=1.8;
export const TIMES={onboard:2.6,submit:8.5,return:8,result:18.4};
export const smooth=(t,a,b)=>{const x=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return x*x*x*(10+x*(-15+x*6));};
export function path(t,keys){for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return keys[i-1][1].clone().lerp(keys[i][1],smooth(t,keys[i-1][0],keys[i][0]));return keys.at(-1)[1].clone();}
export function deskTask(name,t){
 let point=DESK_PAPER.clone(),held=false,owner='desk',root=0,grip=0;
 if(name==='submit'){
  point=path(t,[[0,DESK_PAPER],[1.8,DESK_PAPER],[3,V(0,2.43,.90)],[3.9,V(1.46,2.43,.78)],[5.45,V(1.46,2.43,-.60)],[6.15,SCAN_PAPER],[8.5,SCAN_PAPER]]);
  held=t>=1.4&&t<6.35;grip=smooth(t,.35,1.4)*(1-smooth(t,6.35,6.65));owner=t<1.4?'desk':t<6.35?'detective':'instrument';root=.12*smooth(t,2.6,4.2)*(1-smooth(t,6.45,8));
 }
 if(name==='return'){
  point=path(t,[[0,SCAN_PAPER],[1.3,SCAN_PAPER],[2.4,V(1.46,2.43,-.60)],[3.9,V(1.46,2.43,.78)],[5.0,V(0,2.43,.90)],[6.7,DESK_PAPER],[8,DESK_PAPER]]);
  held=t>=1&&t<6.95;grip=smooth(t,0,1)*(1-smooth(t,6.95,7.6));owner=t<1?'instrument':t<6.95?'detective':'desk';root=.12*(1-smooth(t,2.7,4.1));
 }
 if(name==='result'){
  point=path(t,[[0,V(1.46,1.699,-.72)],[2.1,PRINTER_PAPER],[3.3,PRINTER_PAPER],[4.4,V(1.46,2.43,.78)],[5.8,V(-.30,2.43,.90)],[7,REPORT_STATION],[14.3,REPORT_STATION],[15.25,V(-.30,1.85,.60)],[16.4,V(0,1.85,.60)],[17.5,DESK_PAPER],[18.4,DESK_PAPER]]);
  held=t>=3.1&&t<7.25||t>=14.05&&t<17.75;grip=smooth(t,2.2,3.1)*(1-smooth(t,7.25,7.9))+smooth(t,13.2,14.05)*(1-smooth(t,17.75,18.3));owner=t<3.1?'instrument':held?'detective':'desk';root=0;
 }
 return {point,held,owner,root,grip,lid:0,stamp:name==='result'?smooth(t,10,10.7)*(1-smooth(t,11.1,12)):0,progress:name==='submit'?smooth(t,6.7,8.4):0};
}
export function pointBoxDistance(p,solid){return Math.hypot(...['x','y','z'].map(k=>Math.max(0,Math.abs(p[k]-solid.p[k])-solid.size[k]/2)));}
export function limbClearanceReport(a,b,radius,solids=SOLIDS){let clearance=Infinity,solid=null,point=null;for(const o of solids)for(let i=0;i<=28;i++){const p=a.clone().lerp(b,i/28),d=pointBoxDistance(p,o)-radius;if(d<clearance){clearance=d;solid=o.name;point=p;}}return {clearance,solid,point};}
export function limbClearance(a,b,radius,solids=SOLIDS){return limbClearanceReport(a,b,radius,solids).clearance;}
