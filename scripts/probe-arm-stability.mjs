import {createActors} from '../tests/support/standard-actors.mjs';
import {poseDetective} from '../public/standard-actor.js';
import {V} from '../public/desk-layout.js';
import {pose,life} from '../public/clips.js';
function run(name,tap){const{detective:d}=createActors();d.root.position.set(0,1.36,-.75);d.root.updateMatrixWorld(true);let prev,max={angle:0},total=0;const rows=[];
for(let f=0;f<400;f++){const t=f/40,grip=p=>({position:d.root.worldToLocal(p),forward:V(0,0,1),normal:V(0,1,0)}),l=grip(V(-.13,2.31,0));l.forward=V(0,1,0);l.normal=V(0,0,1);poseDetective(d,{...pose('idle',t),headX:.02,headY:0},life(t),{},{l,r:grip(V(.45,1.573+(tap?.03*(.5+.5*Math.sin(t*3.4)):0),.22))},{collision:true,taskLean:.18,poles:{l:V(-.42,1.35,-.12)},handModes:{l:'chin',r:'tap'},tipBlend:1,chinBlend:1});const q=Object.values(d.arms).flatMap(a=>[a.upper,a.lower,a.wrist]).map(b=>b.quaternion.clone());if(prev&&f>50){for(let j=0;j<q.length;j++){const angle=q[j].angleTo(prev[j]);total+=angle;if(angle>max.angle)max={angle,frame:f,bone:j};}rows.push(q.map((q,j)=>q.angleTo(prev[j])));}prev=q;}
console.log(name,{maxDegrees:max.angle*180/Math.PI,frame:max.frame,bone:max.bone,totalDegrees:total*180/Math.PI});}
run('frozen',false);run('tap',true);
