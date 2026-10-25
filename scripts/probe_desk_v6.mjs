import {createActors} from '../tests/support/standard-actors.mjs';import {poseDetective,poseViewer} from '../public/standard-actor.js';import {pose,life} from '../public/clips.js';import {V,FLAT,deskTask,TIMES} from '../public/desk-layout.js';
const {detective:det,visitor}=createActors();
for(const name of ['submit','return','result']){let worst=0,clearance=Infinity,pinch=0,frame;
 for(let i=0;i<=TIMES[name]*30;i++){
 const t=i/30,task=deskTask(name,t),weight=task.held?1:0;if(!weight)continue;det.root.position.set(task.root,1.56,-.75);det.root.updateMatrixWorld(true);const p=pose('idle',t),grips={};
 for(const[side,x]of[['l',-.39],['r',.39]])grips[side]={position:det.root.worldToLocal(V(x,-.01,.002).applyQuaternion(FLAT).add(task.point)),forward:V(0,0,1),normal:V(0,1,0),kind:'pinch'};
 const d=poseDetective(det,p,life(t),{},grips,{state:'sequence',sequence:name,time:t,taskLean:.7,collision:true});if(d.miss>worst){worst=d.miss;frame=t;}clearance=Math.min(clearance,det.arms.l.clearance,det.arms.r.clearance);pinch=Math.max(pinch,det.arms.l.pinchError,det.arms.r.pinchError);
 }console.log(name,{worst,frame,clearance,pinch});
}
