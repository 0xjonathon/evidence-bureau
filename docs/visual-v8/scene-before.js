import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createEquipment} from './equipment.js';
import {createAgentDisplay} from './agent-screen.js';
import {buildDetective,poseDetective,buildViewer,poseViewer,installCharacterAssets} from './standard-actor.js';
import {pose as clipPose,life} from './clips.js';
import {V,FLAT,DESK_PAPER,SCAN_PAPER,STAMP_REST,PEN_REST,VISITOR_PEN,TIMES,deskTask,smooth,path} from './desk-layout.js';
import {createDeskPhysics} from './desk-physics.js';
import {Handwriting} from './handwriting.js';
import {projectSheet} from './project-sheet.js';
import {paperPoint,carryingContact,stampAction,crossAction,penAction} from './desk-performance.js';
const UP=V(0,1,0),FRONT=V(0,0,1);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function createOffice(container,onObject){
 const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;container.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#14241f');scene.fog=new THREE.FogExp2('#14241f',.015);
 const camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.06,70);
 scene.add(new THREE.HemisphereLight('#e5e9df','#233129',1.65));
 const key=new THREE.DirectionalLight('#ffe5c5',2.5);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-4});key.shadow.normalBias=.008;scene.add(key);
 const rim=new THREE.DirectionalLight('#8eb7cf',1.3);rim.position.set(3,4,-3);scene.add(rim);
 const practical=new THREE.PointLight('#ffc77a',5,4,1.4);practical.position.set(-2.05,2.43,.45);scene.add(practical);
 const room=(await new GLTFLoader().loadAsync('/assets/bureau-room-v3.glb')).scene;scene.add(room);room.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});room.getObjectByName('PrinterReceipt').visible=false;
 const loader=new GLTFLoader();loader.register(parser=>{parser.textureLoader=new THREE.TextureLoader();return {name:'LOCAL_IMAGE_LOADER'};});
 const [detective,visitor,dm,vm,physics]=await Promise.all([loader.loadAsync('/assets/detective-standard-v5.glb'),loader.loadAsync('/assets/visitor-standard-v5.glb'),fetch('/assets/detective-standard-v5.json').then(r=>r.json()),fetch('/assets/visitor-standard-v5.json').then(r=>r.json()),createDeskPhysics()]);
 installCharacterAssets({detective,visitor},{detective:dm,visitor:vm});
 const det=buildDetective();det.root.name='Detective';det.root.scale.setScalar(.8);det.root.position.set(0,1.36,-.75);scene.add(det.root);
 const viewer=buildViewer();viewer.root.position.set(0,2.65,1.66);scene.add(viewer.root);
 det.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const equipment=await createEquipment(scene,room),display=createAgentDisplay(equipment.screen);
 container.dataset.workstation='integrated-visitor-facing';container.dataset.progressDisplay='synchronized';
 const paperCanvas=document.createElement('canvas');paperCanvas.width=1024;paperCanvas.height=736;
 const ctx=paperCanvas.getContext('2d'),texture=new THREE.CanvasTexture(paperCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 const paperGeometry=new THREE.PlaneGeometry(.84,.60,24,16),paper=new THREE.Mesh(paperGeometry,new THREE.MeshStandardMaterial({map:texture,roughness:.94,side:THREE.DoubleSide}));paper.quaternion.copy(FLAT);paper.position.copy(DESK_PAPER);paper.receiveShadow=true;scene.add(paper);
 const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(-.435,-.315,.006),V(.435,-.315,.006),V(.435,.315,.006),V(-.435,.315,.006)]),new THREE.LineBasicMaterial({color:'#c2f3cb',transparent:true,opacity:.6}));paper.add(outline);
 function makePen(color){const g=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:'#d4b66d',metalness:.8,roughness:.25}),body=new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.3});const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.010,.010,.33,12),body);shaft.position.y=.195;g.add(shaft);const nib=new THREE.Mesh(new THREE.ConeGeometry(.010,.032,12),metal);nib.rotation.z=Math.PI;nib.position.y=.016;g.add(nib);const cap=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.018,12),metal);cap.position.y=.369;g.add(cap);scene.add(g);return g;}
 const visitorPen=makePen('#233d37'),detectivePen=makePen('#6a2b25');
 const stamp=new THREE.Group();scene.add(stamp);const stampBody=new THREE.MeshStandardMaterial({color:'#59372b',roughness:.4}),stampMetal=new THREE.MeshStandardMaterial({color:'#a58b53',metalness:.6,roughness:.3});
 function stampPart(geometry,y,material){const m=new THREE.Mesh(geometry,material);m.position.y=y;m.castShadow=true;stamp.add(m);}
 stampPart(new THREE.CylinderGeometry(.083,.083,.026,32),.013,stampBody);stampPart(new THREE.CylinderGeometry(.055,.072,.035,32),.044,stampMetal);stampPart(new THREE.CylinderGeometry(.025,.028,.11,20),.112,stampBody);stampPart(new THREE.SphereGeometry(.048,24,16),.18,stampBody);
 const pulse=new THREE.Mesh(new THREE.RingGeometry(.09,.097,64),new THREE.MeshBasicMaterial({color:'#a9efc7',side:THREE.DoubleSide,transparent:true,depthWrite:false}));pulse.rotation.x=-Math.PI/2;scene.add(pulse);pulse.visible=false;
 const paperDOM=document.querySelector('#paperStage'),welcome=document.querySelector('#welcome'),panel=document.querySelector('#investigationPanel'),projection=document.querySelector('#projectionLink');
 const handwriter=new Handwriting(),annotation=new Handwriting();
 let state='greet',seq=null,report=null,claim='',images=[],imageVersion=0,clock=0,last=performance.now(),disposed=false,raf,view=0,readyResolvers=[],lastInk=-1,mark=0,archive=null,bodyY=1.36,rootX=0;
 let lastWriting={tip:null,writing:false,completed:0,total:0},lastPenPixel=null,penAtStroke=false;
 function draft(text){report=null;claim=text||'';penAtStroke=false;if(!claim)lastPenPixel=null;handwriter.setText(claim);}
 function setClaim(text,urls=[]){if(text!==claim||report)draft(text);const version=++imageVersion;images=[];for(const [i,url]of urls.entries()){const image=new Image();image.onload=()=>{if(version===imageVersion)images[i]=image;};image.src=url;}}
 function setReport(value){report=value;claim=value.claim;mark=0;annotation.setText(value.verdict==='mixed'?'存在争议':value.verdict==='unknown'?'证据不足':'');}
 function drawSheet(){
  ctx.fillStyle='#f0e7d1';ctx.fillRect(0,0,1024,736);ctx.strokeStyle='#8c9b81';ctx.lineWidth=2;ctx.strokeRect(26,26,972,684);
  ctx.fillStyle='#4b6155';ctx.font='17px monospace';ctx.fillText('THE EVIDENCE BUREAU / '+(report?'CASE REPORT':'INVESTIGATION REQUEST'),64,64);
  ctx.font='bold 43px "Songti SC",serif';ctx.fillText(report?'有据调查报告':'调查委托单',64,134);ctx.fillRect(64,160,896,2);
  ctx.strokeStyle='#bac0aa';ctx.lineWidth=1;for(let y=249;y<491;y+=43){ctx.beginPath();ctx.moveTo(64,y);ctx.lineTo(960,y);ctx.stroke();}
  if(!report){lastWriting=handwriter.render(ctx);images.forEach((img,i)=>{if(!img)return;const x=74+i*142;ctx.fillStyle='#fffcf0';ctx.fillRect(x-6,458,130,85);ctx.drawImage(img,x,464,118,70);ctx.strokeStyle='#a3916b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+14,458);ctx.lineTo(x+14,479);ctx.arc(x+10,479,4,0,Math.PI);ctx.lineTo(x+6,455);ctx.stroke();});}
  else{
   ctx.fillStyle='#354f42';ctx.font='bold 31px serif';ctx.fillText(({supported:'现有证据支持',refuted:'现有证据反驳',mixed:'存在争议',unknown:'证据不足'}[report.verdict]),64,218);
   ctx.font='24px serif';for(let i=0;i<Math.min(claim.length,62);i+=31)ctx.fillText(claim.slice(i,i+31),64,266+Math.floor(i/31)*36);
   ctx.font='22px serif';for(let i=0;i<Math.min((report.summary||'').length,81);i+=27)ctx.fillText(report.summary.slice(i,i+27),64,357+Math.floor(i/27)*36);
   ctx.font='17px monospace';(report.sources||[]).slice(0,2).forEach((s,i)=>{let host='';try{host=new URL(s.url).host;}catch{}ctx.fillText('['+s.id+'] '+host,64,627+i*26);});
   if(report.verdict==='supported'&&mark>0){ctx.save();ctx.translate(240,520);ctx.rotate(-.12);ctx.strokeStyle='#2d694a';ctx.fillStyle='#2d694a';ctx.lineWidth=6;for(const r of[77,85]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}ctx.textAlign='center';ctx.font='bold 40px serif';ctx.fillText('有 据',0,12);ctx.font='13px monospace';ctx.fillText('VERIFIED',0,40);ctx.restore();}
   if(report.verdict==='refuted'&&mark>0){ctx.strokeStyle='#963e31';ctx.lineCap='round';ctx.lineWidth=12;const a=Math.min(mark*2,1),b=Math.max(0,mark*2-1);ctx.beginPath();ctx.moveTo(160,470);ctx.lineTo(160+a*160,470+a*110);if(b){ctx.moveTo(320,470);ctx.lineTo(320-b*160,470+b*110);}ctx.stroke();}
   if(['mixed','unknown'].includes(report.verdict)){ctx.save();ctx.translate(20,290);annotation.render(ctx);ctx.restore();}
   ctx.fillStyle='#6c7b66';ctx.font='15px monospace';ctx.fillText(report.id||'',64,695);
  }
  texture.needsUpdate=true;
 }
 function sheetPoint(x,y,lift=0){return paperPoint(paper.position,x,y,lift);}
 function worldGrip(p,forward=FRONT,normal=UP,kind=null,weight=1){return {position:det.root.worldToLocal(p.clone()),forward,normal,kind,weight};}
 function parkPen(pen,point){pen.position.copy(point);pen.quaternion.setFromUnitVectors(UP,V(.12,0,-1).normalize());}
 function whenWritten(){return handwriter.ready&&handwriter.progress>=handwriter.length?Promise.resolve():new Promise(r=>readyResolvers.push(r));}
 function playSequence(name,onCue=()=>{}){if(seq){seq.resolve();seq=null;}state='sequence';if(name==='onboard'){report=null;physics.newSheet(DESK_PAPER);if(archive){scene.remove(archive);archive.material.map.dispose();archive.material.dispose();archive.geometry.dispose();archive=null;}}
  if(name==='result'){if(archive){scene.remove(archive);archive.geometry.dispose();archive.material.map.dispose();archive.material.dispose();}archive=paper.clone();archive.geometry=paper.geometry.clone();archive.material=paper.material.clone();archive.material.map=new THREE.CanvasTexture(paperCanvas.cloneNode());const c=document.createElement('canvas');c.width=1024;c.height=736;c.getContext('2d').drawImage(paperCanvas,0,0);archive.material.map.image=c;archive.material.map.needsUpdate=true;archive.position.copy(SCAN_PAPER);archive.visible=true;scene.add(archive);physics.newSheet(deskTask(name,0).point);}
  return new Promise(resolve=>seq={name,t:0,resolve,onCue,cues:new Set(),speed:reduced?3:1,penStart:visitorPen.position.clone(),penQ:visitorPen.quaternion.clone()});
 }
 function cue(active,key){if(!active.cues.has(key)){active.cues.add(key);active.onCue(key);}}
 function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}resize();window.addEventListener('resize',resize);
 function projectTerminal(){if(state!=='search')return;const a=equipment.screen.getWorldPosition(V()).project(camera),x=(a.x*.5+.5)*innerWidth,y=(-a.y*.5+.5)*innerHeight,w=innerWidth<650?innerWidth*.90:Math.min(470,innerWidth*.40),left=innerWidth<650?innerWidth*.05:Math.min(innerWidth-w-32,Math.max(innerWidth*.48,x-w*.5)),top=innerWidth<650?innerHeight*.38:Math.max(115,y-355);Object.assign(panel.style,{left:left+'px',top:top+'px',width:w+'px'});panel.style.setProperty('--origin-x',(x-left)+'px');panel.style.setProperty('--origin-y',(y-top)+'px');const r=panel.getBoundingClientRect();projection.querySelector('.projection-beam').setAttribute('d',`M${x-23} ${y} L${r.left+20} ${r.bottom} L${r.right-20} ${r.bottom} L${x+23} ${y} Z`);projection.querySelector('.projection-wire').setAttribute('d',`M${x} ${y} L${r.left+20} ${r.bottom}`);projection.querySelector('circle').setAttribute('cx',x);projection.querySelector('circle').setAttribute('cy',y);}
 function render(now){
  if(disposed)return;raf=requestAnimationFrame(render);if(document.hidden||now-last<1000/40)return;const dt=Math.min((now-last)/1000,.07);last=now;clock+=dt;
  const active=seq;if(active)active.t=Math.min(TIMES[active.name],active.t+dt*active.speed);const t=active?.t||0,task=deskTask(active?.name,t);
  const puttingDown=active?.name==='submit'&&t<1.15;const overhead=state==='writing'||active?.name==='onboard'||puttingDown;view=THREE.MathUtils.damp(view,overhead?1:0,3.8,dt);
  // The visitor stays seated in world space; only the viewpoint bends down toward the sheet.
  const portrait=innerWidth/innerHeight<.8,closeHeight=portrait?4.10:2.93;
  camera.position.copy(V(0,2.90,portrait?4.90:3.40).lerp(V(0,closeHeight,1.08),view));const fov=portrait?THREE.MathUtils.lerp(60,46,view):46;if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}const look=V(portrait?.4:.16,2.05,-.32).lerp(V(0,1.56,.56),view);camera.lookAt(look);camera.updateMatrixWorld(true);
  if(penAtStroke)handwriter.update(dt);if(report&&active?.name==='result'&&t>=9.4&&t<12.2)annotation.update(dt*1.5);
  const commanded=!!active&&(task.held||task.owner==='instrument');const physical=physics.step(dt*(active?.speed||1),active?task.point:state==='ready'||state==='search'?SCAN_PAPER:DESK_PAPER,commanded,0);paper.position.copy(physical.position);
  paper.visible=true;
  outline.visible=state==='greet';outline.material.opacity=.28+.34*(.5+.5*Math.sin(clock*2.4));
  equipment.update(task,active?.name==='submit'&&t>6.65);container.dataset.scanProgress=String(Math.round(task.progress*100));
  const moving=!!active&&active.name!=='onboard',aimY=moving?1.56:1.36;bodyY=THREE.MathUtils.damp(bodyY,aimY,3.2,dt);rootX=task.root;det.root.position.set(rootX,bodyY,-.75);det.root.updateMatrixWorld(true);
  const p=clipPose('idle',clock);p.headX=.02;p.headY=0;const grips={},targets={};let lean=moving?.65:.32;
  const rest={l:V(-.47,1.72,-.24),r:V(.45,1.72,-.23)};
  // A relaxed chin rest belongs to the detective's anatomical right (screen left).
  const chin=V(-.13,2.31,0);grips.l=worldGrip(chin,UP,FRONT);grips.r=worldGrip(V(.45,1.573+.030*(.5+.5*Math.sin(clock*3.4)),.08),FRONT,UP);
  if(moving){
   const weight=task.grip;
   grips.l=worldGrip(rest.l,FRONT,UP);const contact=carryingContact(active.name,paper.position,weight);grips.r=worldGrip(rest.r.clone().lerp(contact.position,weight),contact.forward,contact.normal,contact.kind,weight);
  }
  parkPen(detectivePen,PEN_REST);if(state!=='writing'&&active?.name!=='onboard'&&!puttingDown)parkPen(visitorPen,VISITOR_PEN);stamp.position.copy(STAMP_REST);pulse.visible=false;
  if(active?.name==='result'&&t>8.1&&t<14.2){
   const verdict=report?.verdict;
   if(verdict==='supported'){
    const action=stampAction(t,paper.position),press=action.press,pos=action.position;stamp.position.copy(pos);
    const w=action.weight;grips.l=worldGrip(rest.l.clone().lerp(pos.clone().add(V(0,.15,0)),w),UP.clone().negate(),FRONT,'stamp',w);
    if(t>=10.72){mark=1;cue(active,'stamp');}const impact=(t-10.72)/.6;if(impact>0&&impact<1){pulse.visible=true;pulse.position.copy(press);pulse.scale.setScalar(1+impact*3);pulse.material.opacity=(1-impact)*.6;}
   }else{
    let tip=sheetPoint(160,470,.004);if(verdict==='refuted'){const action=crossAction(t,paper.position);tip=action.tip;mark=action.mark;if(t>=11.6)cue(active,'cross');}
    else{const stroke=annotation.render(ctx);if(stroke.tip)tip=sheetPoint(20+stroke.tip.x,290+stroke.tip.y,.004+stroke.tip.lift);}
    const action=penAction(t,paper.position,tip),axis=action.axis;detectivePen.position.copy(action.position);detectivePen.quaternion.setFromUnitVectors(UP,V(.12,0,-1).normalize()).slerp(new THREE.Quaternion().setFromUnitVectors(UP,axis),smooth(t,8.1,8.8)*(1-smooth(t,12.9,13.5)));if(t>=13.5)parkPen(detectivePen,PEN_REST);
    const w=action.weight;grips.l=worldGrip(rest.l.clone().lerp(detectivePen.position.clone().addScaledVector(axis,.105),w),axis.clone().negate(),V(1,0,0),'pen',w);
   }
   if(t<13.2)grips.r=worldGrip(V(.39,1.70,-.13),FRONT,UP);
  }
  const diag=poseDetective(det,p,life(clock),targets,grips,{state,sequence:active?.name,time:t,taskLean:lean,collision:true,poles:!moving?{l:V(-.42,1.35,-.12)}:null,handModes:!moving?{l:'chin',r:'tap'}:null});
  drawSheet();
  const writing=state==='writing'||active?.name==='onboard';viewer.root.visible=writing||puttingDown;
  let vl=V(-.52,1.67,1.08),vr=V(.52,1.67,1.08),kind=null,frame=null;
  if(writing){
   vl=V(-.46,1.64,.80);if(lastWriting.writing&&lastWriting.tip)lastPenPixel=lastWriting.tip;
   const point=lastPenPixel?sheetPoint(lastPenPixel.x,lastPenPixel.y,lastWriting.writing?.004+(lastPenPixel.lift||0):.038):sheetPoint(760,265,.045),axis=V(.20,1,.18).normalize(),take=active?.name==='onboard'?smooth(t,.55,2.1):1;
   if(active?.name==='onboard')visitorPen.position.copy(VISITOR_PEN.clone().lerp(point,take));
   else if(!penAtStroke||!lastWriting.writing){visitorPen.position.lerp(point,1-Math.exp(-dt*15));if(visitorPen.position.distanceTo(point)<.008){visitorPen.position.copy(point);penAtStroke=true;}}
   else if(visitorPen.position.distanceTo(point)>.10){penAtStroke=false;visitorPen.position.lerp(point,1-Math.exp(-dt*15));}
   else visitorPen.position.copy(point);
   visitorPen.quaternion.setFromUnitVectors(UP,V(.12,0,-1).normalize()).slerp(new THREE.Quaternion().setFromUnitVectors(UP,axis),take);vr=visitorPen.position.clone().addScaledVector(axis,.105);kind='pen';frame={forward:axis.clone().negate(),normal:V(-1,0,0)};
  }
  if(puttingDown){const u=smooth(t,.05,.85),axis=UP.clone().applyQuaternion(active.penQ.clone().slerp(new THREE.Quaternion().setFromUnitVectors(UP,V(.12,0,-1).normalize()),u));visitorPen.position.copy(active.penStart).lerp(VISITOR_PEN,u);visitorPen.position.y+=Math.sin(u*Math.PI)*.065;visitorPen.quaternion.setFromUnitVectors(UP,axis);const release=smooth(t,.85,1.15);vr=visitorPen.position.clone().addScaledVector(axis,.105).lerp(V(.52,1.40,1.25),release);vl=V(-.46,1.64,.80).lerp(V(-.52,1.4,1.25),smooth(t,.4,1.05));kind=t<.85?'pen':null;frame={forward:axis.clone().negate(),normal:V(-1,0,0)};}
  const viewerMiss=poseViewer(viewer,{l:vl,r:vr},{l:.5,r:.5},false,null,null,{clock,state,kind,rightFrame:frame,leftFrame:{forward:V(0,0,-1),normal:UP},collision:true});
  // Match the bent paper edge to the finger pickup contact, flatten it in the feed channel.
  const curl=moving?task.grip*.078:state==='greet'?.006:0,positions=paperGeometry.attributes.position;for(let i=0;i<positions.count;i++)positions.setZ(i,curl*(active?.name==='result'?Math.pow(Math.max(0,-positions.getX(i)/.42),8):Math.exp(-Math.pow(positions.getX(i)/.22,4)))*Math.pow(Math.max(0,positions.getY(i)/.30),6));positions.needsUpdate=true;paper.updateMatrixWorld(true);
  if(writing)projectSheet(paperDOM,paper,camera,innerWidth,innerHeight);
  const hot=paper.position.clone().add(V(0,.02,.01)).project(camera);welcome.style.left=((hot.x*.5+.5)*innerWidth)+'px';welcome.style.top=((-hot.y*.5+.5)*innerHeight)+'px';
  display.draw(now,state==='search'||active?.name==='result'||state==='holding-report');projectTerminal();
  const ink=Math.floor(handwriter.progress);if(ink!==lastInk){lastInk=ink;container.dispatchEvent(new CustomEvent('handwriting',{detail:{pending:handwriter.length-ink}}));}if(handwriter.ready&&handwriter.progress>=handwriter.length){for(const resolve of readyResolvers)resolve();readyResolvers=[];}
  Object.assign(container.dataset,{sequence:active?.name||state,paperOwner:active?task.owner:state==='search'?'instrument':'desk',paperY:paper.position.y.toFixed(4),physicsBlocked:String(physical.blocked),reachMiss:diag.miss.toFixed(4),armClearance:diag.diagnostics.clearanceMin.toFixed(4),pinchError:diag.diagnostics.pinchError.toFixed(4),viewerMiss:viewerMiss.toFixed(4),inkCharacters:String(ink),inkPending:String(Math.max(0,handwriter.length-ink)),view:writing?'overhead':'seated'});
  renderer.render(scene,camera);
  if(active){if(active.name==='onboard'&&t>.6)cue(active,'touch');if(active.name==='submit'&&t>6.7)cue(active,'scan');if(t>=TIMES[active.name]&&paper.position.distanceTo(task.point)<.05){seq=null;state=active.name==='submit'?'ready':active.name==='result'?'holding-report':'writing';active.resolve();}}
 }
 raf=requestAnimationFrame(render);
 return {setClaim,setDraft:draft,whenWritten,setReport,setProgress:e=>display.update(e),beginInvestigation:demo=>display.begin(demo),playSequence,
  playResult(value,onCue){setReport(value);return playSequence('result',onCue);},skipSequence(){if(seq)seq.speed=5;},setState(next){if(seq)return;state=next==='idle'?'writing':['supported','refuted','mixed','unknown'].includes(next)?'holding-report':next;},toggleLamp(){practical.visible=!practical.visible;return practical.visible;},
  dispose(){disposed=true;cancelAnimationFrame(raf);seq?.resolve();readyResolvers.forEach(r=>r());window.removeEventListener('resize',resize);physics.dispose();display.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});renderer.dispose();}
 };
}
