import {Quaternion} from 'three';
import {V,STAMP_REST,PEN_REST,VISITOR_PEN,smooth,path} from './desk-layout.js';
export function approachGrip(rest,point,weight){return rest.clone().lerp(point,weight).add(V(0,.10*Math.sin(weight*Math.PI),0));}
export const STAMP_CAP_RADIUS=.035,STAMP_CAP_Y=.18,STAMP_GRIP_Y=.232;
export function stampGripNormal(weight=1){return V(-weight,1-weight,0).normalize();}
export function stampGripPoint(position){return position.clone().add(V(0,STAMP_GRIP_Y,0));}
export const MARK={seal:[240,520],cross:[[160,470],[320,580],[320,470],[160,580]],annotation:[20,290]};
export function paperPoint(position,x,y,lift=0){return V((x/1024-.5)*.84,lift,.60*(y/736-.5)).add(position);}
export function carryingContact(name,position,weight=1){
 const p=position.clone().add(V(0,.16,-.30)),forward=p.clone().sub(V(.40,2.05,-.45));forward.y*=.65;forward.normalize();
 const normal=V(0,1,0);return {position:p,forward,normal,kind:'pinch',weight};
}
export function stampAction(t,position){const press=paperPoint(position,...MARK.seal,.004),raised=press.clone().add(V(0,.20,0));return {position:path(t,[[8.25,STAMP_REST],[8.8,STAMP_REST.clone().add(V(0,.25,0))],[9.7,raised],[10.2,raised],[10.72,press],[11.12,press],[11.7,raised],[12.6,STAMP_REST.clone().add(V(0,.25,0))],[13.2,STAMP_REST]]),press,weight:smooth(t,7.9,8.25)*(1-smooth(t,13.2,14)),marked:t>=10.72};}
export function crossAction(t,position){
 const a=smooth(t,9.4,10.35),b=smooth(t,10.65,11.6);let x=160+160*a,y=470+110*a,lift=.004;
 if(t>10.35&&t<10.65){const u=smooth(t,10.35,10.65);x=320;y=580-110*u;lift+=.045*Math.sin(u*Math.PI);}
 else if(t>=10.65){x=320-160*b;y=470+110*b;}
 return {tip:paperPoint(position,x,y,lift),mark:(a+b)/2};
}
export function penFlatness(axis){return 1-smooth(Math.abs(axis.y),0,.7);}
export function penWristFlex(axis){return .18+.42*penFlatness(axis);}
export function penGripPoint(position,axis){return position.clone().addScaledVector(axis,.105).add(V(0,.012*(1-Math.abs(axis.y)),0));}
export function penAction(t,position,tip){const ready=paperPoint(position,160,470,.18),writingAxis=V(-.35,1,-.08).normalize(),q=new Quaternion().setFromUnitVectors(V(0,1,0),V(.12,0,-1).normalize()).slerp(new Quaternion().setFromUnitVectors(V(0,1,0),writingAxis),smooth(t,8.25,8.6)*(1-smooth(t,12.9,13.5))),axis=V(0,1,0).applyQuaternion(q);return {axis,q,wristFlex:penWristFlex(axis),flatness:penFlatness(axis),position:t>=9.4&&t<11.7?tip:path(t,[[8.25,PEN_REST],[8.6,PEN_REST.clone().add(V(0,.2,0))],[9.05,ready],[9.4,tip],[11.7,tip],[12.15,ready],[12.9,PEN_REST.clone().add(V(0,.2,0))],[13.5,PEN_REST]]),weight:smooth(t,7.9,8.25)*(1-smooth(t,13.5,14.2))};}

export function visitorPutdown(t,start,startQ){
 const up=V(0,1,0),u=smooth(t,.05,.85),q=startQ.clone().slerp(new Quaternion().setFromUnitVectors(up,V(.12,0,-1).normalize()),u),axis=up.clone().applyQuaternion(q),position=start.clone().lerp(VISITOR_PEN,u);
 position.y+=Math.sin(u*Math.PI)*.065;const release=smooth(t,.85,1.15),gripWeight=1-smooth(t,.85,1.05);
 const right=penGripPoint(position,axis).add(V(0,.08*(1-gripWeight),0)).lerp(V(.52,1.80,1.72),release),left=V(-.46,1.69,.80).lerp(V(-.52,1.80,1.72),smooth(t,.4,1.05));
 return {position,q,right,left,gripWeight,kind:t<1.05?'pen':null,frame:{forward:V(0,0,-1),normal:up,wristFlex:penWristFlex(axis),flatness:penFlatness(axis)}};
}

export function visitorPickup(t,point){
 const take=smooth(t,.55,2.1),up=V(0,1,0),q=new Quaternion().setFromUnitVectors(up,V(.12,0,-1).normalize()).slerp(new Quaternion().setFromUnitVectors(up,V(.35,1,.08).normalize()),take),axis=up.clone().applyQuaternion(q),position=VISITOR_PEN.clone().lerp(point,take);
 return {position,q,right:penGripPoint(position,axis),frame:{forward:V(0,0,-1),normal:up,wristFlex:penWristFlex(axis),flatness:penFlatness(axis)}};
}
