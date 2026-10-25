// Local-only sharing. Never publishes an archive, agent token, upload or localhost URL.
export const verdictNames={supported:'得到支持',refuted:'被反驳',mixed:'条件或冲突',unknown:'无法判断'};
export function publicSources(report){const cited=new Set((report.evidence||[]).map(e=>e.sourceId));return [...(report.sources||[])].sort((a,b)=>Number(cited.has(b.id))-Number(cited.has(a.id))).flatMap(s=>{try{const u=new URL(s.url);return ['https:','http:'].includes(u.protocol)?[{id:s.id,title:s.title||u.hostname,url:u.href}]:[];}catch{return [];}});}
export function shareText(report){return [`有据调查报告${report.mode==='demo'?' · 离线示例，非实时调查':''}`,report.claim,`结论：${verdictNames[report.verdict]||'无法判断'}`,report.summary,'',...publicSources(report).map((s,i)=>`[${i+1}] ${s.title}\n${s.url}`),'',...(report.limitations||[]).map(s=>'边界：'+s),`报告编号：${report.id}`].join('\n');}
function lines(ctx,text,x,y,width,lineHeight,maxLines=Infinity){let line='',count=0;for(const ch of String(text||'')){if(ch==='\n'||ctx.measureText(line+ch).width>width){ctx.fillText(line,x,y);y+=lineHeight;count++;line='';if(count>=maxLines){ctx.fillText('…',x+width-20,y-lineHeight);return y;}if(ch==='\n')continue;}line+=ch;}if(line){ctx.fillText(line,x,y);y+=lineHeight;}return y;}
export async function createSharePoster(report,moments=false){
 await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=moments?1350:1740;const c=canvas.getContext('2d'),H=canvas.height;
 c.fillStyle='#173b32';c.fillRect(0,0,1080,H);c.strokeStyle='#a9b99a';c.lineWidth=2;c.strokeRect(28,28,1024,H-56);
 c.fillStyle='#c7ac77';c.font='22px monospace';c.fillText('THE EVIDENCE BUREAU / 有据事务所',65,95);c.fillStyle='#f0e8d1';c.font='bold 66px "Songti SC",serif';c.fillText('有据调查报告',65,210);
 c.fillStyle='#eee6cf';c.fillRect(55,275,970,H-355);c.fillStyle='#263f33';c.font='18px monospace';c.fillText(report.id||'CASE REPORT',92,328);
 if(report.mode==='demo'){c.fillStyle='#a14b32';c.font='bold 24px sans-serif';c.fillText('离线示例 · 非实时调查',92,377);}
 const color={supported:'#37644d',refuted:'#a33e31',mixed:'#94702b',unknown:'#6e7569'}[report.verdict]||'#6e7569';
 c.strokeStyle=color;c.lineWidth=6;c.beginPath();c.arc(883,382,62,0,Math.PI*2);c.stroke();c.fillStyle=color;c.font='bold 59px serif';c.textAlign='center';c.fillText({supported:'✓',refuted:'×',mixed:'!',unknown:'?'}[report.verdict]||'?',883,403);c.textAlign='left';
 c.fillStyle=color;c.font='bold 38px sans-serif';c.fillText(verdictNames[report.verdict]||'无法判断',92,448);
 c.fillStyle='#253d31';c.font='bold 42px "Songti SC",serif';let y=lines(c,report.claim,92,535,860,64,3)+35;
 c.font='29px sans-serif';y=lines(c,report.summary,92,y,860,46,moments?5:7)+30;
 c.fillStyle='#77816e';c.fillRect(92,y,860,1);y+=46;c.font='20px monospace';c.fillText('来源',92,y);y+=43;
 const sources=publicSources(report),limit=moments?2:4;c.font='22px sans-serif';
 for(const [i,s]of sources.slice(0,limit).entries()){
  if(y>H-190)break;c.fillStyle='#304f3d';y=lines(c,`[${i+1}] ${s.title}`,92,y,850,32,1);c.fillStyle='#6f7e68';c.font='17px monospace';y=lines(c,s.url,92,y,850,25,2)+18;c.font='22px sans-serif';
 }
 c.fillStyle='#71816c';c.font='18px sans-serif';
 c.fillStyle='#cdbb8d';c.font='18px monospace';c.fillText('少一点幻觉，多一点搜索。',65,H-36);c.textAlign='right';c.fillText(report.mode==='demo'?'OFFLINE DEMO':'EVIDENCE / VERIFIED SOURCES',1013,H-36);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('海报生成失败')),'image/png'));return {blob,canvas};
}
export function setupSharing({getReport,showDialog}){
 const $=s=>document.querySelector(s);let file,url,text,version=0;
 async function open(moments){
  const report=getReport(),run=++version;text=shareText(report);
  $('#shareTitle').textContent=moments?'朋友圈':'微信好友';
  $('#sharePoster').hidden=true;$('#savePosterBtn').hidden=true;$('#nativeShareBtn').hidden=true;showDialog('#shareDialog');
  const {blob}=await createSharePoster(report,moments);if(run!==version)return;
  file=new File([blob],`${report.id}-${moments?'moments':'wechat'}.png`,{type:'image/png'});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);
  $('#sharePoster').src=url;$('#sharePoster').hidden=false;$('#savePosterBtn').href=url;$('#savePosterBtn').download=file.name;$('#savePosterBtn').hidden=false;
  $('#shareText').value=text;$('#nativeShareBtn').hidden=!(navigator.share&&navigator.canShare({files:[file]}));
 }
 $('#wechatShareBtn').onclick=()=>open(false);$('#momentsShareBtn').onclick=()=>open(true);
 $('#nativeShareBtn').onclick=()=>navigator.share({files:[file],title:'有据调查报告',text});
 $('#copyShareBtn').onclick=()=>navigator.clipboard.writeText(text);
 $('#shareBackBtn').onclick=()=>showDialog('#reportDialog');window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
}
