import{simulateRuntime}from'../tests/support/runtime-motion.mjs';
import{V,SOLIDS}from'../public/desk-layout.js';
let worstPaper={depth:0},minHand=Infinity,heldContact=0;
const r=await simulateRuntime(process.argv[2]||'supported',{fps:40,onFrame:({actor,task,renderedPaper,name,t})=>{
 if(task.held){const tip=actor.arms.r.ends[0].getWorldPosition(V()).add(actor.arms.r.ends[1].getWorldPosition(V())).multiplyScalar(.5),contact=renderedPaper.clone().add(V(0,.16,-.30));heldContact=Math.max(heldContact,tip.distanceTo(contact));
 for(const x of[-.42,0,.42])for(const z of[-.30,0,.30]){const p=renderedPaper.clone().add(V(x,0,z));for(const s of SOLIDS){const depth=Math.min(...['x','y','z'].map(k=>s.size[k]/2-Math.abs(p[k]-s.p[k])));if(depth>worstPaper.depth)worstPaper={depth,name,t,solid:s.name,p:p.toArray()};}}}
}});
console.log(JSON.stringify({maxima:r.maxima,heldContact,worstPaper},null,2));
