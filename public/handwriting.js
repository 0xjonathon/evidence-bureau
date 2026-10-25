// Arphic / Make Me a Hanzi median paths. Pen motion and revealed ink share one stroke sample.
const cache=new Map();
async function glyph(char){if(!/[\u3400-\u9fff]/u.test(char))return null;if(!cache.has(char))cache.set(char,fetch('/vendor/hanzi/'+encodeURIComponent(char)+'.json').then(r=>r.ok?r.json():null).catch(()=>null));return cache.get(char);}
const lerp=(a,b,t)=>a+(b-a)*t;
function pointAlong(points,t){const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])),sum=lengths.reduce((a,b)=>a+b,0);let d=t*sum;for(let i=0;i<lengths.length;i++){if(d<=lengths[i])return [lerp(points[i][0],points[i+1][0],d/lengths[i]),lerp(points[i][1],points[i+1][1],d/lengths[i])];d-=lengths[i];}return points.at(-1);}
export class Handwriting{
 constructor(){this.text='';this.characters=[];this.data=[];this.progress=0;this.generation=0;this.ready=true;}
 async setText(text){
  const characters=[...text];let common=0;while(common<Math.min(characters.length,this.characters.length)&&characters[common]===this.characters[common])common++;
  const version=++this.generation;this.text=text;this.characters=characters;this.progress=Math.min(this.progress,common);this.ready=false;
  const data=await Promise.all(characters.map(glyph));if(version!==this.generation)return;this.data=data;this.ready=true;
 }
 get length(){return this.characters.length;}
 finish(){this.progress=this.length;}
 update(dt){if(!this.ready)return;const i=Math.floor(this.progress),g=this.data[i];const duration=g?Math.max(.26,g.strokes.length*.045):.12;this.progress=Math.min(this.length,this.progress+dt/duration*Math.min(10,Math.max(1,(this.length-this.progress)/6)));}
 render(ctx){
  const count=this.length,current=Math.min(count-1,Math.floor(this.progress)),column=25,size=30,line=43,locations=[];let col=0,row=0;for(const char of this.characters){locations.push([col,row]);if(char==='\n'){col=0;row++;}else if(++col>=column){col=0;row++;}};
  const activeRow=(locations[Math.max(0,current)]?.[1]||0),offset=Math.max(0,activeRow-4)*line;let tip=null;
  ctx.save();ctx.beginPath();ctx.rect(64,198,900,224);ctx.clip();ctx.fillStyle='#243b33';ctx.strokeStyle='#243b33';ctx.lineCap='round';ctx.lineJoin='round';
  for(let i=0;i<count;i++){
   if(i>this.progress)break;const x=72+locations[i][0]*35,y=211+locations[i][1]*line-offset;if(y<170)continue;
   const g=this.data[i],p=Math.min(1,Math.max(0,this.progress-i));
   if(this.characters[i]==='\n')continue;if(!g){if(p>=1){ctx.font='30px "Songti SC",serif';ctx.fillText(this.characters[i],x,y+30);}else tip={x:x+30*p,y:y+24,lift:Math.sin(p*Math.PI)*.005};continue;}
   const index=Math.min(g.strokes.length-1,Math.floor(p*g.strokes.length)),part=p*g.strokes.length-index;
   ctx.save();ctx.translate(x,y+size*.88);ctx.scale(size/1024,-size/1024);
   for(let j=0;j<g.strokes.length;j++){
    if(j>index)break;const path=new Path2D(g.strokes[j]);
    if(j<index||p>=1){ctx.fill(path);continue;}
    const points=g.medians[j],end=pointAlong(points,part);ctx.save();ctx.clip(path);ctx.lineWidth=170;ctx.beginPath();ctx.moveTo(...points[0]);let total=points.slice(1).reduce((n,a,k)=>n+Math.hypot(a[0]-points[k][0],a[1]-points[k][1]),0),d=0;
    for(let k=1;k<points.length;k++){d+=Math.hypot(points[k][0]-points[k-1][0],points[k][1]-points[k-1][1]);if(d/total>part)break;ctx.lineTo(...points[k]);}ctx.lineTo(...end);ctx.stroke();ctx.restore();
    tip={x:x+end[0]*size/1024,y:y+size*.88-end[1]*size/1024,lift:part<.08||part>.94?.008:0};
   }ctx.restore();
  }ctx.restore();return {tip,writing:this.progress<count&&this.ready,completed:Math.floor(this.progress),total:count};
 }
}
