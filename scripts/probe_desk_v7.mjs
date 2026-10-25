import {createActors} from '../tests/support/standard-actors.mjs';
import {poseDetective} from '../public/standard-actor.js';
import {pose,life} from '../public/clips.js';
import {V,deskTask,TIMES,limbClearanceReport,SOLIDS} from '../public/desk-layout.js';
const {detective:det}=createActors();
for(const name of ['submit','return','result']){let reach=0,clearance=Infinity,pinch=0,worst;
 for(let i=0;i<=TIMES[name]*30;i++){
 const t=i/30,task=deskTask(name,t);if(!task.held)continue;det.root.position.set(task.root,1.56,-.75);det.root.updateMatrixWorld(true);const grips={};
 for(const [side,x]of [['r',0]])grips[side]={position:det.root.worldToLocal(task.point.clone().add(name==='result'?V(-.42,.078,-.30):V(x,.078,-.30))),forward:name==='result'?V(1,0,0):V(0,0,1),normal:V(0,-1,0),kind:'pinch'};
 const d=poseDetective(det,pose('idle',t),life(t),{},grips,{state:'sequence',sequence:name,time:t,taskLean:.65,collision:true});reach=Math.max(reach,d.miss);pinch=Math.max(pinch,d.diagnostics.pinchError);if(d.diagnostics.clearanceMin<clearance){clearance=d.diagnostics.clearanceMin;worst={t,hits:d.hits};}
 }console.log(name,{reach,pinch,clearance,worst});
}
