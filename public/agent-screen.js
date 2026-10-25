import * as THREE from 'three';
// Both the physical display and projected UI consume the same server events.
export function createAgentDisplay(monitor,swivel){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=736;
 const c=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;
 const mesh=monitor;mesh.material.map=texture;
 let event={stage:'idle',message:''},history=[],started=0,demo=false,last=0;
 const stages=['plan','search','compare','review','complete'];const labels=['拆解问题','全网检索','证据比对','交叉复核','报告归档'];
 let index=-1;
 function update(e){event=e;const i=stages.indexOf(e.stage==='sources'?'search':e.stage);if(i>=0)index=Math.max(index,i);history.push(e.message||'');history=history.slice(-3);}
 function begin(isDemo){demo=isDemo;index=0;history=[];started=performance.now();update({stage:'plan',message:'拆解'});}
 function draw(now,active){if(now-last<(active?80:1000))return;last=now;
 c.fillStyle='#061b1a';c.fillRect(0,0,1024,736);
 c.strokeStyle='#163936';c.lineWidth=1;for(let x=0;x<1024;x+=40){c.beginPath();c.moveTo(x,0);c.lineTo(x,736);c.stroke();}for(let y=0;y<736;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(1024,y);c.stroke();}
 c.fillStyle='#12342e';c.fillRect(24,24,976,64);c.fillStyle='#84efd0';c.font='bold 27px monospace';c.fillText('EVIDENCE / AGENT OS',46,66);c.font='18px monospace';c.fillStyle='#c0a778';c.fillText(active?(demo?'OFFLINE DEMO':'YUANBAO • LIVE'):'SYSTEM READY',705,65);
 c.strokeStyle='#255f50';c.lineWidth=12;c.beginPath();c.arc(100,174,42,0,Math.PI*2);c.stroke();c.strokeStyle='#93f9d5';c.beginPath();const angle=active&&index<4?now/400:-Math.PI/2;c.arc(100,174,42,angle,angle+4.4);c.stroke();
 c.fillStyle='#e0f9e9';c.font='bold 36px sans-serif';c.fillText(active?(labels[index]||'调查进行中'):'有据 · 调查工作台',175,164);c.font='21px monospace';c.fillStyle='#65bda1';c.fillText(active?(index===4?'CHAIN COMPLETE  /  ':'AGENT RUNNING  /  ')+String(Math.floor((now-started)/1000)).padStart(2,'0')+'s':'AWAITING YOUR NEXT CASE',175,204);
 for(let i=0;i<5;i++){let x=78+i*196;c.fillStyle=i<=index&&active?'#93efd0':'#33584b';c.beginPath();c.arc(x,294,12,0,Math.PI*2);c.fill();if(i<4){c.fillStyle=i<index&&active?'#93efd0':'#244d40';c.fillRect(x+21,292,152,3);}c.font='20px sans-serif';c.fillStyle=i===index&&active?'#d2ffe7':'#6b9c85';c.fillText(labels[i],x-35,340);}
 c.fillStyle='#102d27';c.fillRect(30,379,964,285);c.font='22px sans-serif';c.fillStyle='#b4dac3';let messages=active?history:[];messages.forEach((line,i)=>{c.fillStyle=i===messages.length-1?'#bdeed7':'#6e9e88';c.fillText('› '+line.slice(0,37),55,424+i*69);});
 c.fillStyle='#8cba9d';c.font='17px monospace';c.fillText('SEARCH → VERIFY → REVIEW → REPORT',40,704);c.fillStyle='#c8aa72';c.fillText(active?(index===4?'● REPORT READY':'● CHAIN ACTIVE'):'○ STANDBY',795,704);
 // Phosphor scanlines are part of the display texture, not the readable HTML projection.
 c.fillStyle='#00170b22';for(let y=0;y<736;y+=5)c.fillRect(0,y,1024,1);texture.needsUpdate=true;
 }
 return {mesh,texture,update,begin,draw,dispose(){texture.dispose();}};
}
