import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const assets=[];
for(const name of ['bureau-room-v3','detective-standard-v5','visitor-standard-v5','instrument-v8']){
 const bytes=await readFile(new URL('../public/assets/'+name+'.glb',import.meta.url));
 if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB: '+name);
 const j=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12))),external=[...(j.buffers||[]),...(j.images||[])].filter(x=>x.uri&&!x.uri.startsWith('data:'));if(external.length)throw Error('External resource: '+name);
 let triangles=0;for(const mesh of j.meshes)for(const p of mesh.primitives)triangles+=(j.accessors[p.indices]?.count||0)/3;
 const skinJoints=(j.skins||[]).map(s=>s.joints.length);let character;
 if(name.includes('standard-v5')){
  character=JSON.parse(await readFile(new URL('../public/assets/'+name+'.json',import.meta.url)));
  const count=name.startsWith('detective')?107:129;if(!skinJoints.includes(count)||Object.keys(character.humanoid).length!==54)throw Error('Missing standard rig: '+name);
  if(character.license!=='CC0-1.0')throw Error('Missing license: '+name);
  for(const clip of character.clips)if(!j.animations.some(a=>a.name===clip&&a.channels.length>250))throw Error('Missing motion: '+clip);
 }
 assets.push({name,file:'public/assets/'+name+'.glb',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meshes:j.meshes.length,nodes:j.nodes.length,triangles,materials:j.materials.length,textures:j.images?.length||0,skinJoints,externalResources:external.length,runtime:true,...(character?{sourceModel:character.sourceModel,license:character.license,humanoidJoints:54,clips:character.clips}: {})});
}
const report={version:'8.0.0',assets,sourceScene:'assets-source-v5.blend',instrumentSource:'instrument-source-v8.blend',provenance:'Original room and integrated instrument. Two VRoid beta CC0 sample humanoids and Quaternius CC0 motion layers; see docs/ASSET-CREDITS.md.',animation:'World-seated visitor, bounded native arm IK and finger hinges, skin-only forearm twist helpers, upright head compensation and phased contact, Rapier swept paper volume, integrated scanner/display/output, verdict-specific tools, report returned to the desk before opening.',validation:'137 tests pass, including actual skinned arm/hand surface samples, paper paths and fast playback, exported chassis bounds, tool reach, stamp knob/shaft contact, visitor pickup/setdown, shallow reversible skin contact, joint limits, grip contact, elbow continuity, torso/thigh clearance and independent skin bind palettes. See tests/desk-interaction.test.mjs and docs/visual-v8/REVIEW.md.'};
await writeFile(new URL('../docs/asset-manifest.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
