import * as THREE from 'three';
export function projectSheet(element,sheet,camera,width,height){
 const local=new THREE.Matrix4().set(.84/1024,0,0,-.42,0,-.60/736,0,.30,0,0,1,.003,0,0,0,1);
 const m=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(sheet.matrixWorld).multiply(local).elements;
 const x=i=>width*.5*(m[i]+m[i+3]),y=i=>height*.5*(-m[i+1]+m[i+3]);
 const css=[x(0),y(0),0,m[3],x(4),y(4),0,m[7],0,0,1,0,x(12),y(12),0,m[15]];
 element.style.transform='matrix3d('+css.join(',')+')';
}
