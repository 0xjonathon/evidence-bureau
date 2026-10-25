import * as THREE from 'three';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),Q=()=>new THREE.Quaternion();
// Native VRoid hands: +Y points from wrist to knuckles, +Z is the back of
// the hand. Each finger bends on its own rest-space hinge; no ball-joint CCD.
export const FINGER_LIMITS={mcp:[0,1.35],pip:[0,1.65],dip:[0,1.10],thumb:[0,1.05],opposition:[-.85,.85],spread:[-.65,.65]};
export function prepareHand(arm){
 const wq=arm.wrist.getWorldQuaternion(Q());
 arm.hinges=arm.fingers.map(chain=>chain.map(b=>{
  const into= b.getWorldQuaternion(Q()).invert().multiply(wq).multiply(arm.basis);
  return {x:V(1,0,0).applyQuaternion(into),y:V(0,1,0).applyQuaternion(into),z:V(0,0,1).applyQuaternion(into)};
 }));arm.handPoses=new Map();
}
function apply(arm,angles){
 for(let f=0;f<5;f++)for(let j=0;j<3;j++){
  const b=arm.fingers[f][j],h=arm.hinges[f][j];b.quaternion.copy(arm.rest[f][j]).multiply(Q().setFromAxisAngle(h.x,-angles[f*3+j]));
  if(f===0&&j===0)b.quaternion.multiply(Q().setFromAxisAngle(h.y,angles[15])).multiply(Q().setFromAxisAngle(h.z,angles[16]));
 }arm.wrist.updateWorldMatrix(true,true);
}
function localTip(arm,f){return arm.wrist.worldToLocal(arm.ends[f].getWorldPosition(V())).applyQuaternion(arm.basis.clone().invert());}
function buildPose(arm,kind){
 const pen=kind==='pen',stamp=kind==='stamp',thumbSide=arm.semantic==='right'?-1:1;
 const angles=Array(17).fill(0);for(let f=0;f<5;f++)for(let j=0;j<3;j++)angles[f*3+j]=f===0?[.25,.25,.2][j]:stamp?(f>1?[.35,.45,.40][j]:[.65,1.0,.65][j]):pen?[.38,.85,.5][j]:f>1?[.35,.55,.30][j]:[.10,.18,.10][j];
 const target=V(thumbSide*(pen?.020:stamp?.020:.018),pen?.107:stamp?.085:.132,pen?-.050:stamp?-.060:-.030),gap=pen?.004:stamp?.0125:.002;
 const targets=stamp?[target.clone().add(V(0,0,gap)),target.clone().add(V(0,0,-gap))]:[target.clone().add(V(thumbSide*gap,0,0)),target.clone().add(V(-thumbSide*gap,0,0))];
 const initial=angles.slice(),params=[0,1,2,3,4,5,6,7,8,15,16];
 if(pen){angles[3]=.3;angles[4]=.65;angles[5]=.35;}
 const bounds=i=>i===15?FINGER_LIMITS.opposition:i===16?FINGER_LIMITS.spread:i<3?FINGER_LIMITS.thumb:pen&&i%3===0?[.18,.85]:pen&&i%3===2?[.12,.65]:[FINGER_LIMITS.mcp,FINGER_LIMITS.pip,FINGER_LIMITS.dip][i%3];
 const loss=()=>{apply(arm,angles);return localTip(arm,0).distanceToSquared(targets[0])+localTip(arm,1).distanceToSquared(targets[1])+(pen?.6*localTip(arm,2).distanceToSquared(target.clone().add(V(-thumbSide*.012,-.003,-.006))):0)+.000005*angles.reduce((s,a,i)=>s+(a-initial[i])**2,0);};
 let best=loss();for(const step of [.25,.12,.06,.025,.01])for(let pass=0;pass<8;pass++)for(const i of params){const before=angles[i],[lo,hi]=bounds(i);let chosen=before;for(const sign of [-1,1]){angles[i]=THREE.MathUtils.clamp(before+sign*step,lo,hi);const score=loss();if(score<best){best=score;chosen=angles[i];}}angles[i]=chosen;}
 apply(arm,angles);const anchor=arm.wrist.worldToLocal(arm.ends[0].getWorldPosition(V())).add(arm.wrist.worldToLocal(arm.ends[1].getWorldPosition(V()))).multiplyScalar(.5);
 return {angles,anchor,contactGap:localTip(arm,0).distanceTo(localTip(arm,1))};
}
export function poseHand(arm,kind='relaxed',weight=1){
 if(!arm.hinges)prepareHand(arm);
 if(['pen','stamp','pinch'].includes(kind)){
  if(!arm.handPoses.has(kind))arm.handPoses.set(kind,buildPose(arm,kind));
  const p=arm.handPoses.get(kind),blended=p.angles.map((a,i)=>{if(kind==='pen'&&i>=6&&i<15)a+=([.08,.15,.10][i%3]-a)*(arm.toolFlatness??0);const relaxed=i<3?[.16,.10,.06][i]:i<15?[.10,.16,.10][i%3]:0;return relaxed+(a-relaxed)*weight;});apply(arm,blended);arm.graspAnchor=p.anchor;arm.fingerAngles=blended;return p.anchor;
 }
 const angles=Array(17).fill(0);for(let f=0;f<5;f++)for(let j=0;j<3;j++)angles[f*3+j]=f===0?[.16,.1,.06][j]:kind==='chin'?[1.05,1.35,.80][j]:kind==='tap'?(f===1?[.35,.20,.10][j]:[.90,1.25,.80][j]):[.10,.16,.10][j];if(kind==='chin'){angles[0]=.45;angles[1]=.35;angles[2]=.25;angles[15]=arm.semantic==='right'?-.45:.45;angles[16]=arm.semantic==='right'?-.30:.30;}if(kind==='chin'||kind==='tap'){for(let f=0;f<5;f++)for(let j=0;j<3;j++){const relaxed=f===0?[.16,.10,.06][j]:[.10,.16,.10][j];angles[f*3+j]=relaxed+(angles[f*3+j]-relaxed)*weight;}angles[15]*=weight;angles[16]*=weight;}apply(arm,angles);arm.fingerAngles=angles;arm.graspAnchor=null;return arm.palm;
}
