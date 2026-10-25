import {createOffice} from './scene.js';
import {setupSharing} from './share.js';
import {demoReport} from './demos.js';
import {renderEvidenceTheater,addHeroMetadata} from './evidence-theater.js';
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const state={phase:'welcome',report:null,controller:null,images:[],providers:{},elapsedTimer:null,archive:[],audio:null,sound:false};
// Keep phone controls touch-sized while the editable ink remains on the projected sheet.
const mobileControls=document.createElement('div');mobileControls.id='mobileCaseControls';document.body.append(mobileControls);
const paperTools=$('.paper-tools'),paperBottom=$('.paper-bottom');$('#submitBtn').setAttribute('form','caseForm');
function arrangePaperControls(){const target=innerWidth<600?mobileControls:$('#caseForm');target.append(paperTools,paperBottom);}
arrangePaperControls();window.addEventListener('resize',arrangePaperControls);
let toastTimer;
const labels={supported:'得到支持',refuted:'被反驳',mixed:'条件或冲突',unknown:'无法判断'};
const relations={supports:'支持命题',refutes:'反驳命题',context:'背景与条件'};
const checks={verified:'原文已核对',['not-found']:'原页面未找到该句',['fetch-failed']:'页面无法抓取 · 仅摘要','summary-only':'仅摘要'};
// Agent badge: a random token kept in this browser. The server stores only its hash.
const TOKEN_KEY='evidence-bureau-agent';
const agentToken=()=>{try{return localStorage.getItem(TOKEN_KEY)||'';}catch{return '';}};
async function apiFetch(path,init={}){return fetch(path,{...init,headers:{...(init.headers||{}),'x-agent-token':agentToken()}});}
async function ensureAgent(){
 try{
  const r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json','x-agent-token':agentToken()},body:'{}'});
  if(!r.ok)throw Error();const d=await r.json();
  if(d.token){try{localStorage.setItem(TOKEN_KEY,d.token);}catch(error){console.error(error);}}
  state.agent=d.profile;return d.profile;
 }catch{state.agent=null;return null;}
}
const sleep=ms=>new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?Math.min(ms,80):ms));
function speech(text){$('#speechText').textContent=`“${text}”`;}
function showToast(text,ms=3200){const el=$('#toast');if(!el)return;clearTimeout(toastTimer);el.textContent=text;el.hidden=false;el.classList.remove('toast-in');void el.offsetWidth;el.classList.add('toast-in');toastTimer=setTimeout(()=>{el.classList.remove('toast-in');setTimeout(()=>{el.hidden=true;},220);},ms);}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function showDialog(selector){const d=$(selector);$$('dialog[open]').forEach(x=>x.close());if(!d.open)d.showModal();}
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function loadArchive(){try{const saved=JSON.parse(localStorage.getItem('evidence-bureau-cases')||'[]');state.archive=Array.isArray(saved)?saved.filter(r=>r&&typeof r.claim==='string'&&Array.isArray(r.sources)).slice(0,30):[];}catch{state.archive=[];}$('#archiveCount').textContent=String(state.archive.length).padStart(2,'0');$('#caseNumber').textContent=String(state.archive.filter(x=>x.mode==='live').length+1).padStart(3,'0');}
function saveReport(report){state.archive=state.archive.filter(r=>r.id!==report.id);state.archive.unshift(report);state.archive=state.archive.slice(0,30);localStorage.setItem('evidence-bureau-cases',JSON.stringify(state.archive));loadArchive();}
async function openServerCase(id){try{const r=await apiFetch('/api/cases?id='+encodeURIComponent(id));if(!r.ok)throw Error();openReport((await r.json()).report);}catch(error){console.error(error);}}
const statusText={supported:'得到支持',refuted:'被反驳',mixed:'条件或冲突',cold:'悬案 · 如实不知道'};
function renderServerArchive(list){
 for(const c of state.serverCases){const b=node('button','archive-card');b.append(node('small','',`${c.id} / ${formatDate(c.completedAt)}${c.depth==='deep'?' / 深度':''}`),node('p','',c.claim),node('span','',`${statusText[c.status]||'已结案'}   ↗`));b.onclick=()=>openServerCase(c.id);list.append(b);}
}
function renderArchive(){const list=$('#archiveList');list.replaceChildren();
 if(Array.isArray(state.serverCases)){renderServerArchive(list);$('#clearArchiveBtn').hidden=true;return;}for(const report of state.archive){const b=node('button','archive-card');b.append(node('small','',`${report.id} / ${formatDate(report.completedAt)}`),node('p','',report.claim),node('span','',`${report.mode==='demo'?'示例 · ':''}${labels[report.verdict]||'无法判断'}   ↗`));b.onclick=()=>openReport(report);list.append(b);}$('#clearArchiveBtn').hidden=!state.archive.length;}
function formatDate(value){if(!value)return '未记录';const d=new Date(value);return isNaN(d)?String(value):d.toLocaleString('zh-CN',{hour12:false});}
function timeTick(){$('#clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}timeTick();setInterval(timeTick,30000);
loadArchive();
let office;
try {
 office=await createOffice($('#scene'),kind=>{if(kind==='lamp')toggleLamp();if(kind==='monitor'&&state.phase==='working')$('#investigationLog').scrollTop=1e6;if(kind==='detective'&&state.phase==='welcome')speech('需要调查真相吗？');});
} catch (error) {
 console.error(error);
 const loading=$('#loading'); loading.querySelector('p').textContent='场景载入失败，请刷新后重试。'; loading.classList.add('loading-error');
 throw error;
}
async function refreshStatus(){try{const r=await fetch('/api/status');if(!r.ok)throw Error();state.providers=await r.json();$('#connectionLabel').textContent=state.providers.search?'元宝搜索已接入':'演示模式 · 待接入';$('#connectionDot').style.background=state.providers.search?'#b7ce91':'#b89967';}catch{$('#connectionLabel').textContent='服务暂不可用';state.providers={};}}
await refreshStatus();
await ensureAgent();renderBadge();
async function showStatus(){await refreshStatus();const list=$('#providerStatus');list.replaceChildren();for(const [label,ready,detail]of [['元宝搜索',state.providers.search,'待配置'],['分析与复核模型',state.providers.model,'待配置'],['截图文字识别',state.providers.vision,'可选，未配置']]){const row=node('div','provider-row');row.append(node('b','',label),node('span',ready?'ready':'',ready?'已接入':detail));list.append(row);}showDialog('#statusDialog');}
$('#statusBtn').onclick=showStatus;
async function syncArchive(){
 try{
  const r=await apiFetch('/api/cases');if(!r.ok)throw Error();const d=await r.json();
  if(d.profile)state.agent=d.profile;
  state.serverCases=Array.isArray(d.cases)?d.cases:[];
 }catch{state.serverCases=null;}
}
function renderBadge(){
 const a=state.agent,box=$('#agentBadge');if(!box)return;
 if(!a){box.hidden=true;return;}
 box.hidden=false;$('#badgeNo').textContent=a.badge;$('#badgeName').textContent=a.codename;$('#badgeRank').textContent=a.rank;

 $('#archiveCount').textContent=String(a.cases).padStart(2,'0');
}
$('#archiveBtn').onclick=async()=>{await syncArchive();renderArchive();showDialog('#archiveDialog');};
$('#clearArchiveBtn').onclick=()=>{if(!confirm('清空当前浏览器中的全部案件档案？已下载的报告不会受影响。'))return;localStorage.removeItem('evidence-bureau-cases');loadArchive();renderArchive();};
$('#claim').addEventListener('input',e=>{$('#charCount').textContent=`${$('#claim').value.length} / 800`;if(!e.isComposing)office.setDraft($('#claim').value);});
$('#claim').addEventListener('compositionend',()=>office.setDraft($('#claim').value));
$('#scene').addEventListener('handwriting',e=>{if(state.phase==='idle')$('#submitBtn').disabled=e.detail.pending>0;});
function chime(kind='paper'){
 if(!state.sound||!state.audio)return;const ctx=state.audio;ctx.resume();const now=ctx.currentTime;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=kind==='stamp'?'triangle':'sine';osc.frequency.setValueAtTime(kind==='stamp'?145:620,now);osc.frequency.exponentialRampToValueAtTime(kind==='stamp'?38:140,now+.18);gain.gain.setValueAtTime(kind==='stamp'?.23:.045,now);gain.gain.exponentialRampToValueAtTime(.001,now+.25);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(now+.26);
 if(kind==='stamp'){const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.12),ctx.sampleRate);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.018));const hit=ctx.createBufferSource();hit.buffer=buffer;const hitGain=ctx.createGain();hitGain.gain.value=.12;hit.connect(hitGain);hitGain.connect(ctx.destination);hit.start();}

}
let ambience;
$('#soundBtn').onclick=()=>{state.sound=!state.sound;$('#soundBtn').setAttribute('aria-pressed',state.sound);$('#soundBtn').setAttribute('aria-label',state.sound?'关闭环境音':'开启环境音');if(state.sound){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext){return;}if(!state.audio){state.audio=new AudioContext();const ctx=state.audio;const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last;}const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;ambience=ctx.createGain();ambience.gain.value=0;source.connect(filter);filter.connect(ambience);ambience.connect(ctx.destination);source.start();}state.audio.resume();ambience.gain.setTargetAtTime(.12,state.audio.currentTime,.3);chime();}else if(ambience)ambience.gain.setTargetAtTime(0,state.audio.currentTime,.2);};
function toggleLamp(){const on=office.toggleLamp();$('#lampBtn').textContent=on?'◉ 桌灯已开':'○ 桌灯已关';$('#lampBtn').setAttribute('aria-pressed',on);}$('#lampBtn').onclick=toggleLamp;
function renderAttachments(){const list=$('#attachmentList');list.replaceChildren();state.images.forEach((item,i)=>{const figure=node('figure','attachment-photo');const img=node('img');img.src=item.url;img.alt='附件截图 '+(i+1);const remove=node('button','remove-photo','×');remove.type='button';remove.setAttribute('aria-label','移除第 '+(i+1)+' 张截图');remove.onclick=()=>{URL.revokeObjectURL(item.url);state.images=state.images.filter(x=>x!==item);renderAttachments();office.setClaim($('#claim').value,state.images.map(x=>x.url));};figure.append(img,node('figcaption','',(i+1)+' / '+item.file.name),remove);list.append(figure);});$('#attachmentCount').textContent=state.images.length;$('#attachment').hidden=!state.images.length;$('#extractBtn').hidden=!state.images.length;}
async function attach(files){let count=0,skipped=0;for(const file of files){if(state.images.length>=6){skipped++;break;}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){skipped++;continue;}if(file.size>3*1024*1024){skipped++;continue;}if(state.images.reduce((n,x)=>n+x.file.size,0)+file.size>12*1024*1024){skipped++;continue;}if(state.images.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified)){skipped++;continue;}state.images.push({file,url:URL.createObjectURL(file),data:null});count++;}renderAttachments();office.setClaim($('#claim').value,state.images.map(x=>x.url));$('#imageInput').value='';if(count)chime();if(skipped)showToast(count?`已加入 ${count} 张截图，部分文件被跳过（最多 6 张、单张 3MB）。`:'截图格式或大小不符合要求。');}
$('.upload-label').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#imageInput').click();}};
$('#imageInput').onchange=e=>attach([...e.target.files]);
$('#removeAttachment').onclick=()=>{state.images.forEach(x=>URL.revokeObjectURL(x.url));state.images=[];renderAttachments();office.setClaim($('#claim').value,[]);};
$('#caseForm').addEventListener('dragover',e=>e.preventDefault());$('#caseForm').addEventListener('drop',e=>{e.preventDefault();attach([...e.dataTransfer.files]);});
async function imageData(item){if(item.data)return item.data;return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(item.data=r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(item.file);});}
$('#extractBtn').onclick=async()=>{if(!state.images.length||state.phase!=='idle')return;const b=$('#extractBtn'),snapshot=[...state.images];b.disabled=true;try{const r=await apiFetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images:await Promise.all(snapshot.map(imageData))})});const result=await r.json();if(!r.ok)throw Error(result.error||'图片识别失败');if(snapshot.length!==state.images.length||snapshot.some((x,i)=>x!==state.images[i]))return;if(!result.claim)throw Error('没有识别到清晰的待核验说法，请手动填写。');$('#claim').value=result.claim;$('#claim').dispatchEvent(new Event('input'));$('#claim').focus();showToast('已识别说法，可以直接递交委托。');}catch(error){console.error(error);showToast(error.message||'截图识别失败，请手动填写。');}finally{b.disabled=false;}};
function log(event){const list=$('#investigationLog');const line=node('div','log-line');const at=new Date(event.at||Date.now()).toLocaleTimeString('zh-CN',{hour12:false});line.append(node('small','',at),node('span','',event.message));if(event.query)line.append(node('div','log-query','↳ '+event.query));list.append(line);list.scrollTop=list.scrollHeight;const stages=['plan','search','compare','review','complete'];const i=stages.indexOf(event.stage==='sources'?'search':event.stage);state.step=Math.max(state.step||0,i);$('#progressBar').style.width=((state.step+1)/5*100)+'%';$$('.agent-steps li').forEach((el,n)=>{el.classList.toggle('done',n<state.step);el.classList.toggle('active',n===state.step);if(n===state.step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});office.setProgress(event);$('#investigationHeading').textContent=event.message;}
async function begin(demo=false){state.phase='working';state.step=0;sequenceLock(true);await office.whenWritten();office.beginInvestigation(demo);$$('.agent-steps li').forEach((el,i)=>{el.classList.remove('done');el.classList.toggle('active',i===0);});$('#submitBtn').disabled=true;$('#sampleCases').hidden=true;$('#paperStage').inert=true;document.body.dataset.phase='submitting';office.setClaim($('#claim').value,state.images.map(x=>x.url));chime();$('#skipSequenceBtn').hidden=false;await office.playSequence('submit',sequenceCue);$('#skipSequenceBtn').hidden=true;$('#paperStage').hidden=true;document.body.classList.add('is-investigating');document.body.dataset.phase='investigating';sequenceLock(false);$('#investigationPanel').hidden=false;$('#terminalMode').textContent=demo?'OFFLINE DEMO':'YUANBAO / LIVE';$('#investigationLog').replaceChildren();$('#progressBar').style.width='5%';const started=Date.now();$('#elapsed').textContent='00:00';state.elapsedTimer=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('#elapsed').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');},1000);office.setState('search');}
function sequenceLock(on){$('.topbar').inert=on;$('#lampBtn').disabled=on;}
function reset(){sequenceLock(false);state.phase='idle';$('#skipSequenceBtn').hidden=true;document.body.classList.remove('is-investigating');clearInterval(state.elapsedTimer);state.controller=null;$('#investigationPanel').hidden=true;$('#paperStage').hidden=false;$('#paperStage').classList.remove('submitting');$('#paperStage').inert=false;document.body.dataset.phase='writing';$('#sampleCases').hidden=false;$('#submitBtn').disabled=false;office.setState('idle');}
function verdictIcon(verdict){const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 80 80');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(ns,'path');p.setAttribute('d',({supported:'M40 5 67 16v22c0 18-16 29-27 36C29 67 13 56 13 38V16Z M26 39l10 11 20-23',refuted:'M21 21l38 38M59 21 21 59',mixed:'M40 9v34M40 59v3M10 70h60L40 10Z',unknown:'M27 26c0-18 30-19 30 0 0 11-17 12-17 25M40 64v2'}[verdict]||'M40 15v35M40 62v2'));svg.append(p);return svg;}
function openReport(report){report=addHeroMetadata(report);state.report=report;const c=$('#reportContent');c.replaceChildren();c.append(node('p','report-kicker','THE EVIDENCE BUREAU / CASE REPORT'));const header=node('div','report-header');header.append(node('h2','','有据调查报告'));const id=node('div','report-id');id.append(node('div','',report.id),node('div','',formatDate(report.completedAt)));header.append(id);c.append(header);
 if(report.mode==='demo')c.append(node('div','demo-banner','离线示例'));
 const row=node('div','verdict-row');const seal=node('div','verdict-stamp '+report.verdict);seal.append(verdictIcon(report.verdict),node('strong','',labels[report.verdict]||'无法判断'),node('small','',({supported:'EVIDENCE SUPPORTED',refuted:'CLAIM REFUTED',mixed:'CONTEXT MATTERS',unknown:'INSUFFICIENT EVIDENCE'}[report.verdict]||'UNDER REVIEW')));row.append(seal,node('h3','report-claim',report.claim));c.append(row,node('p','report-summary',report.summary));
 
 c.append(node('h4','report-section-title',`THE EVIDENCE / ${report.sources.length} 条${report.mode==='demo'?'参考资料':'搜索来源'}`));
 const citedIds=new Set((report.evidence||[]).map(e=>e.sourceId));const extraSources=node('details','trace-details more-sources');extraSources.append(node('summary','',`其余检索资料（${report.sources.filter(s=>!citedIds.has(s.id)).length} 条，未作为直接结论依据）`));
 for(const source of [...report.sources].sort((a,b)=>Number(citedIds.has(b.id))-Number(citedIds.has(a.id)))){const card=node('section','evidence-card');const a=node('a','',`[${source.id}] ${source.title||source.host} ↗`);try{const u=new URL(source.url);if(!['http:','https:'].includes(u.protocol))continue;a.href=u.href;}catch{continue;}a.target='_blank';a.rel='noopener noreferrer';if(source.tierLabel){card.append(node('span','tier-tag tier-'+(source.tier||'unknown'),source.tierLabel));}card.append(a,node('div','source-meta',`${source.host}  ·  ${source.kind||'搜索摘要'}${source.publishedAt?'  ·  发布 '+source.publishedAt:''}${source.retrievedAt?'  ·  检索 '+formatDate(source.retrievedAt):''}`));
 const evidence=(report.evidence||[]).filter(e=>e.sourceId===source.id);for(const e of evidence){card.append(node('span','relation-tag '+e.relation,relations[e.relation]||'背景'));if(e.check&&checks[e.check])card.append(node('span','check-tag check-'+e.check,checks[e.check]));if(e.quote)card.append(node('blockquote','',e.quote));card.append(node('p','',e.explanation));}if(!evidence.length)card.append(node('p','',(source.excerpt||'暂无摘要').slice(0,650)));(citedIds.has(source.id)?c:extraSources).append(card);}
 if(report.sources.some(s=>!citedIds.has(s.id)))c.append(extraSources);
 c.append(node('h4','report-section-title','BOUNDARIES / 证据边界'));const ul=node('ul','limits');for(const line of report.limitations||[])ul.append(node('li','',line));c.append(ul);renderEvidenceTheater(c,report);
 const details=node('details','trace-details');details.append(node('summary','',`调查过程与查询记录 · ${report.queries?.length||0} 轮搜索`));for(const t of report.trace||[])details.append(node('p','',`${formatDate(t.at)}  ${t.message}${t.query?'\n查询：'+t.query:''}${t.requestId?'\nRequestId：'+t.requestId:''}`));details.append(node('p','',`复核方式：${({'not-run':'未运行','same-model-second-pass':'同一模型第二轮复核','second-model':'第二模型复核','failed':'复核失败'}[report.reviewStatus])||'未记录'}。`));c.append(details);showDialog('#reportDialog');$('#reportDialog').scrollTop=0;}
async function finish(report){clearInterval(state.elapsedTimer);state.report=report;$('#progressBar').style.width='100%';$('#investigationPanel').hidden=true;office.setReport(report);const conclusive=['supported','refuted'].includes(report.verdict);office.setState(conclusive?'print':report.verdict);chime('paper');document.body.dataset.phase='result';sequenceLock(true);document.body.classList.remove('is-investigating');$('#skipSequenceBtn').hidden=false;await office.playResult(report,sequenceCue);$('#skipSequenceBtn').hidden=true;saveReport(report);renderBadge();reset();office.setState(report.verdict);state.phase='report';document.body.dataset.phase='report';$('#paperStage').hidden=true;$('#sampleCases').hidden=true;$('#welcome').hidden=false;$('#welcome').classList.remove('touched');$('#startCaseBtn').disabled=false;$('#startCaseBtn').querySelector('span:nth-child(2)').textContent='查看调查报告';openReport(report);}
$('#caseForm').onsubmit=async e=>{e.preventDefault();if(state.phase!=='idle')return;const claim=$('#claim').value.trim();if(claim.length<4)return;if(!state.providers.search){await showStatus();return;}const controller=new AbortController();state.controller=controller;await begin(false);if(controller.signal.aborted)return;try{if(!state.agent)await ensureAgent();const r=await apiFetch('/api/investigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({claim,depth:$('#deep').checked?'deep':'standard'}),signal:controller.signal});if(!r.ok){const j=await r.json();throw Error(j.error||'调查请求失败');}const reader=r.body.getReader();const decoder=new TextDecoder();let buffer='',report=null;
 const receive=line=>{if(!line.trim())return;const message=JSON.parse(line);if(message.type==='progress')log(message);if(message.type==='result'){report=message.report;if(message.profile)state.agent=message.profile;}if(message.type==='error')throw Error(message.message);};
 while(true){const {done,value}=await reader.read();if(done){buffer+=decoder.decode();if(buffer.trim())receive(buffer);break;}buffer+=decoder.decode(value,{stream:true});let newline;while((newline=buffer.indexOf('\n'))>=0){receive(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}}
 if(!report)throw Error('连接中断，未收到完整报告。请重试。');if(!controller.signal.aborted)await finish(report);
 }catch(error){if(error.name==='AbortError'||controller.signal.aborted)return;console.error(error);showToast(error.message||'调查暂时中断，请稍后重试。');await returnDraft();}};
let demoCancelled=false;
$$('[data-demo]').forEach(b=>b.onclick=async()=>{if(state.phase!=='idle')return;demoCancelled=false;const report=demoReport(b.dataset.demo);showToast('已载入离线示例，正在演示完整调查流程。',2200);$('#claim').value=report.claim;$('#claim').dispatchEvent(new Event('input'));await begin(true);const events=[['plan','拆解'],['search','检索'],['compare','比对'],['review','复核'],['complete','报告']];for(const [stage,message]of events){if(demoCancelled)return;log({stage,message,at:new Date().toISOString()});await sleep(stage==='search'?1100:700);}if(!demoCancelled)await finish(report);});
async function returnDraft(){clearInterval(state.elapsedTimer);sequenceLock(true);document.body.dataset.phase='returning';$('#paperStage').hidden=false;$('#paperStage').inert=true;state.phase='returning';$('#investigationPanel').hidden=true;document.body.classList.remove('is-investigating');$('#skipSequenceBtn').hidden=false;await office.playSequence('return',sequenceCue);$('#skipSequenceBtn').hidden=true;reset();}$('#cancelBtn').onclick=async()=>{if(state.phase!=='working')return;showToast('委托已撤回，正在把案卷送回桌面。',2200);state.controller?.abort();demoCancelled=true;await returnDraft();};
$('#newCaseBtn').onclick=()=>{$('#reportDialog').close();showWelcome();$('#claim').value='';$('#claim').dispatchEvent(new Event('input'));$('#removeAttachment').click();};
function markdownReport(r){const lines=[`# 有据调查报告`,r.mode==='demo'?'\n> 离线示例：非实时搜索，不作为真实查证证明。':'',`\n编号：${r.id}`,`\n问题：${r.claim}`,`\n结论：${labels[r.verdict]}`,`\n${r.summary}`,`\n完成时间：${r.completedAt}`,`\n服务：${r.provider}`,`\n## 来源与证据`];for(const s of r.sources){lines.push(`\n### [${s.id}] ${s.title}`,`\n${s.url}`,`\n类型：${s.kind}；发布时间：${s.publishedAt||'未提供'}；检索时间：${s.retrievedAt||'离线示例'}`);for(const e of (r.evidence||[]).filter(e=>e.sourceId===s.id))lines.push(`\n${relations[e.relation]}：${e.explanation}`,e.quote?`\n> ${e.quote}`:'');}lines.push('\n## 限制',...(r.limitations||[]).map(x=>'- '+x),'\n## 检索过程',...(r.trace||[]).map(t=>`- ${t.at} ${t.message}${t.query?' | '+t.query:''}${t.requestId?' | RequestId: '+t.requestId:''}`));return lines.join('\n');}
$('#exportBtn').onclick=()=>{if(!state.report)return;const blob=new Blob([markdownReport(state.report)],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.report.id+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('#printBtn').onclick=()=>window.print();
window.addEventListener('pagehide',()=>{state.controller?.abort();office.dispose();state.images.forEach(x=>URL.revokeObjectURL(x.url));state.audio?.close();});

$('#loading').style.opacity='0';setTimeout(()=>$('#loading').hidden=true,850);

$('#replayBtn').onclick=async()=>{if(!state.report||!['idle','welcome','report'].includes(state.phase))return;const report=state.report;$('#reportDialog').close();$('#welcome').hidden=true;state.phase='replay';sequenceLock(true);$('#paperStage').hidden=true;$('#sampleCases').hidden=true;document.body.dataset.phase='result';office.setClaim(report.claim);$('#skipSequenceBtn').hidden=false;await office.playResult(report,sequenceCue);$('#skipSequenceBtn').hidden=true;reset();office.setState(report.verdict);state.phase='report';document.body.dataset.phase='report';$('#paperStage').hidden=true;$('#sampleCases').hidden=true;$('#welcome').hidden=false;$('#welcome').classList.remove('touched');$('#startCaseBtn').disabled=false;$('#startCaseBtn').querySelector('span:nth-child(2)').textContent='查看调查报告';openReport(report);};
function sequenceCue(cue){if(cue==='touch'){$('#welcome').classList.add('touched');chime();}if(cue==='stamp')chime('stamp');}
function showWelcome(){office.setClaim('');$('#startCaseBtn').querySelector('span:nth-child(2)').textContent='递交委托';state.phase='welcome';document.body.dataset.phase='welcome';$('#welcome').hidden=false;$('#welcome').classList.remove('touched','inviting');void $('#welcome').offsetWidth;$('#welcome').classList.add('inviting');$('#startCaseBtn').disabled=false;$('#paperStage').hidden=true;$('#sampleCases').hidden=true;$('#investigationPanel').hidden=true;office.setState('greet');speech('需要调查真相吗？');}
$('#startCaseBtn').onclick=async e=>{if(state.phase==='report'&&state.report){openReport(state.report);return;}if(state.phase!=='welcome')return;state.phase='onboarding';sequenceLock(true);document.body.dataset.phase='onboarding';$('#startCaseBtn').disabled=true;$('#paperStage').hidden=false;$('#paperStage').inert=true;$('#skipSequenceBtn').hidden=false;await office.playSequence('onboard',sequenceCue,{touch:e.clientX&&e.clientY?{x:e.clientX,y:e.clientY}:null});if(state.phase!=='onboarding')return;$('#welcome').hidden=true;$('#skipSequenceBtn').hidden=true;reset();if(innerWidth>800)$('#claim').focus({preventScroll:true});};
$('#skipSequenceBtn').onclick=()=>office.skipSequence();
showWelcome();

// ---- 盯梢 (continuous watch) ----
const watchWords={pending:'等待邮箱确认',active:'盯梢中'};
const kindWords={unchanged:'无变化','became-conclusive':'有了结论','verdict-changed':'结论改变','became-unknown':'暂时查不到','check-failed':'本次检查失败'};
async function renderWatches(){
 const list=$('#watchList');list.replaceChildren();
 try{
  const r=await apiFetch('/api/watch');if(!r.ok)throw Error();const d=await r.json();
  if(!d.mail){$('#watchSubmit').disabled=true;}else{$('#watchSubmit').disabled=false;}
  for(const w of d.watches){
   const row=node('div','watch-row');const last=w.history[0];
   row.append(node('p','',w.claim),node('small','',`${watchWords[w.status]||w.status} · ${w.email}${last?' · 最近：'+(kindWords[last.kind.split('+')[0]]||last.kind)+' '+formatDate(last.at):''}`));
   const rm=node('button','text-btn danger','取消盯梢');rm.type='button';
   rm.onclick=async()=>{rm.disabled=true;const x=await apiFetch('/api/watch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({remove:w.id})});if(x.ok)renderWatches();else rm.disabled=false;};
   row.append(rm);list.append(row);
  }
 }catch(error){console.error(error);}
}
$('#watchBtn').onclick=async()=>{
 if(!state.report||state.report.mode==='demo')return;
 if(state.report.archiveFailed)return;
 $('#reportDialog').close();showDialog('#watchDialog');await renderWatches();$('#watchEmail').focus();
};
$('#watchForm').onsubmit=async e=>{
 e.preventDefault();if(!state.report?.id){return;}const b=$('#watchSubmit');b.disabled=true;
 try{
  const r=await apiFetch('/api/watch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:state.report.id,email:$('#watchEmail').value.trim()})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'开启失败');
  $('#watchEmail').value='';await renderWatches();
 }catch(err){console.error(err);showToast(err.message||'暂时无法开启盯梢，请稍后再试。');}finally{b.disabled=false;}
};

setupSharing({getReport:()=>state.report,showDialog});
