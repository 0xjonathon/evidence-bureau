import{simulateRuntime}from'../tests/support/runtime-motion.mjs';
import{V,SOLIDS}from'../public/desk-layout.js';
let surfaces,frame=0,worst={depth:0},handoffs=[],held=false,previousPaper=null,maxPaperStep=0,stampWood={depth:0};
const r=await simulateRuntime(process.argv[2]||'supported',{fps:40,onFrame:({actor,task,renderedPaper,name,t,tool,performance})=>{
 if(!surfaces){surfaces=[];actor.model.traverse(m=>{if(!m.isSkinnedMesh)return;const g=m.geometry,ids=[];for(let i=0;i<g.attributes.position.count;i++){let own=0;for(let k=0;k<4;k++)if(/J_Bip_[LR]_(UpperArm|LowerArm|Hand|Thumb|Index|Middle|Ring|Little)/.test(m.skeleton.bones[g.attributes.skinIndex.getComponent(i,k)].name))own+=g.attributes.skinWeight.getComponent(i,k);if(own>.8)ids.push(i);}if(ids.length)surfaces.push({m,ids});});}
 if(task.held!==held){handoffs.push({name,t,held:task.held,paperOffset:renderedPaper.distanceTo(task.point)});held=task.held;}
 if(previousPaper&&task.held)maxPaperStep=Math.max(maxPaperStep,renderedPaper.distanceTo(previousPaper));previousPaper=renderedPaper.clone();
 if(frame++%3)return;
 for(const {m,ids}of surfaces)for(const i of ids){const p=V().fromBufferAttribute(m.geometry.attributes.position,i);m.applyBoneTransform(i,p).applyMatrix4(m.matrixWorld);for(const s of SOLIDS){const dx=s.size.x/2-Math.abs(p.x-s.p.x),dy=s.size.y/2-Math.abs(p.y-s.p.y),dz=s.size.z/2-Math.abs(p.z-s.p.z);if(dx>0&&dy>0&&dz>0){const depth=Math.min(dx,dy,dz);if(depth>worst.depth)worst={depth,name,t,mesh:m.name,i,solid:s.name,p:p.toArray()};}}
 if(tool?.kind==='stamp'&&tool.weight>.999&&/SKIN/.test(m.material.name)){const cap=tool.actualPosition.clone().add(V(0,.18,0)),depth=.035-p.distanceTo(cap);if(depth>stampWood.depth)stampWood={depth,name,t,i};}
 }
}});
console.log(JSON.stringify({maxima:r.maxima,worst,handoffs,maxPaperStep,stampWood},null,2));
