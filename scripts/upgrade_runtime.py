p='public/scene.js';s=open(p).read().replace("import {GLTFLoader}","import {createAgentDisplay} from './agent-screen.js';\nimport {GLTFLoader}")
s=s.replace("'/assets/bureau.glb'", "'/assets/bureau.glb?v=2'")
s=s.replace("const headRest=head?.rotation.clone();", "const portraitPivot=new THREE.Group();portraitPivot.position.set(0,3.25,-1);detective.add(portraitPivot);if(head)portraitPivot.attach(head);const headRest=portraitPivot.rotation.clone();")
s=s.replace("if(head&&headRest){head.rotation.copy(headRest);", "if(head&&headRest){const head=portraitPivot;head.rotation.copy(headRest);")
a=s.index('  const headRest=') if '  const headRest=' in s else -1
insert="""
  const display=createAgentDisplay(monitor,swivel);const anchor=new THREE.Vector3();const projection=document.querySelector('#projectionLink'),panel=document.querySelector('#investigationPanel');
  const visitorHands=[office.getObjectByName('VisitorHandL'),office.getObjectByName('VisitorHandR')];
  const paperElement=document.querySelector('#paperStage');const handPoint=new THREE.Vector3(),handDirection=new THREE.Vector3();
  visitorHands.forEach(h=>{if(h){scene.attach(h);h.traverse(o=>{if(o.isMesh)o.castShadow=false;});}});
  function placeHands(){const r=paperElement.getBoundingClientRect();visitorHands.forEach((h,i)=>{if(!h)return;h.visible=!paperElement.hidden&&state!=='replay';if(!h.visible)return;const x=i?r.right+12:r.left-12,y=r.bottom-43;handPoint.set(x/innerWidth*2-1,-y/innerHeight*2+1,.5).unproject(camera);handDirection.copy(handPoint).sub(camera.position).normalize();h.position.copy(camera.position).addScaledVector(handDirection,3.6);h.quaternion.copy(camera.quaternion);h.rotateX(Math.PI/2);h.rotateY(Math.PI);h.rotateZ(i?-.12:.12);h.scale.setScalar(innerWidth<800?.85:1.1);});}
  const impactRing=new THREE.Mesh(new THREE.RingGeometry(.16,.19,48),new THREE.MeshBasicMaterial({color:'#f3d299',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));impactRing.rotation.x=-Math.PI/2;impactRing.position.set(.3,1.635,.3);scene.add(impactRing);
  function projectTerminal(){display.mesh.getWorldPosition(anchor);anchor.project(camera);const x=(anchor.x*.5+.5)*innerWidth,y=(-anchor.y*.5+.5)*innerHeight;
   if(state==='search'){const mobile=innerWidth<800,w=mobile?innerWidth*.9:Math.min(510,innerWidth*.40);const left=mobile?innerWidth*.05:Math.max(innerWidth*.51,Math.min(x-w*.22,innerWidth-w-36));const top=mobile?Math.max(235,innerHeight*.32):Math.max(132,y-415);panel.style.left=left+'px';panel.style.top=top+'px';panel.style.width=w+'px';panel.style.setProperty('--origin-x',(x-left)+'px');panel.style.setProperty('--origin-y',(y-top)+'px');const r=panel.getBoundingClientRect();const a=r.left+35,b=r.right-35,yy=r.bottom;projection.querySelector('.projection-beam').setAttribute('d',`M${x-28} ${y} L${a} ${yy} L${b} ${yy} L${x+28} ${y} Z`);projection.querySelector('.projection-wire').setAttribute('d',`M${x} ${y} L${r.left+35} ${yy}`);const dot=projection.querySelector('circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);}
  }
"""
pos=s.index('  const noteCanvas=');s=s[:pos]+insert+s[pos:]
s=s.replace("let focus=state==='search'?Math.min(t/1.4,1):0;", "let focus=state==='search'?Math.min(t/1.4,1):0;const impact=state==='print'&&t>1.54&&t<1.95&&!reduced?Math.sin((t-1.54)*85)*Math.exp(-(t-1.54)*13)*.045:0;")
s=s.replace("camera.position.z-=focus*.38;", "camera.position.z-=focus*.38;camera.position.y+=impact;")
s=s.replace("note.position.y=state==='receive'&&!reduced?1.59+Math.max(0,.35-t*.3):1.59;note.position.z=returning?Math.min(t*.4,1):.3;", "note.position.y=state==='receive'&&!reduced?1.59+Math.sin(Math.min(t/1.4,1)*Math.PI)*.26:1.59;note.position.z=returning?Math.min(t*.65,1.4):state==='receive'?2.0-1.7*(1-Math.pow(1-Math.min(t/1.4,1),3)):.3;note.rotation.z=state==='receive'?Math.sin(t*4)*.025:0;")
s=s.replace("swivel.rotation.y+=( (state==='search'?.32:0)-swivel.rotation.y)*.045;", "swivel.rotation.y+=((state==='search'?-.38:.10)-swivel.rotation.y)*.055;display.draw(now,state==='search');projectTerminal();placeHands();")
a=s.index('    if(printedSheet.visible){');b=s.index('    drawingPen.visible=false;',a)
s=s[:a]+"""    if(printedSheet.visible){const p=reduced?1:Math.min(t/.9,1);const ease=p*p*(3-2*p);const deliver=reduced?0:Math.max(0,Math.min((t-2.25)/.95,1));printedSheet.position.set(-1.52+1.82*ease,1.89-.27*ease+Math.sin(p*Math.PI)*.12+Math.sin(deliver*Math.PI)*.18,.1+ease*.2+deliver*1.35);printedSheet.rotation.z=impact*.4;printedSheet.scale.setScalar(1+deliver*.14);if(reportData.verdict==='refuted'){const amount=Math.max(0,Math.min((t-1.15)/.75,1));const step=Math.floor(amount*28);if(step!==drawingStep){drawingStep=step;drawReceipt(amount);}if(amount===1&&!marked){marked=true;container.setAttribute('aria-label','侦探已在报告上画叉');}}else if(t>1.55&&!marked){marked=true;drawReceipt(true);container.setAttribute('aria-label','侦探已在报告上盖章');}}
    const pulse=state==='print'&&reportData?.verdict==='supported'?Math.max(0,(t-1.55)/.6):2;impactRing.visible=pulse>0&&pulse<1&&!reduced;impactRing.scale.setScalar(1+pulse*5);impactRing.material.opacity=(1-pulse)*.5;
"""+s[b:]
s=s.replace("t>.55&&t<1.65", "t>1.15&&t<2.05").replace("(t-.55)/.8", "(t-1.15)/.75")
a=s.index("    if(state==='print'&&reportData?.verdict==='supported'&&!reduced)");b=s.index('    if(receipt&&receiptRest)',a)
s=s[:a]+"""    if(state==='print'&&reportData?.verdict==='supported'&&!reduced){const reach=Math.max(0,Math.min((t-.65)/.45,1));let lift=t<1.15?Math.max(0,(t-.65)/.5)*.52:t<1.55?.52*(1-Math.pow((t-1.15)/.4,3)):t<1.72?.025*Math.sin((t-1.55)*22):Math.min((t-1.72)/.4,1)*.34;stamp.position.set(stampRest.x-.5*reach,stampRest.y+lift,stampRest.z+.05*reach);stamp.rotation.z=t>1.15&&t<1.55?-.08*(1-(t-1.15)/.4):0;gripDirection.set(stamp.position.x-.56,stamp.position.y+.17-2.28,stamp.position.z+1).normalize();shoulderR.quaternion.setFromUnitVectors(restHandDirection,gripDirection);}
"""+s[b:]
s=s.replace("return {setClaim:writeNote,", "return {setClaim:writeNote,setProgress(e){display.update(e);},beginInvestigation(demo){display.begin(demo);},")
s=s.replace("noteTexture.dispose();receiptTexture.dispose();", "display.dispose();noteTexture.dispose();receiptTexture.dispose();")
open(p,'w').write(s)
