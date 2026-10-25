import {createOffice} from './scene.js';
import {setupSharing} from './share.js';
import {demoReport} from './demos.js';
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const state={phase:'welcome',report:null,controller:null,images:[],providers:{},elapsedTimer:null,archive:[],audio:null,sound:false};
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
  if(d.token){try{localStorage.setItem(TOKEN_KEY,d.token);}catch{}}
  state.agent=d.profile;return d.profile;
 }catch{state.agent=null;return null;}
}
const sleep=ms=>new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?Math.min(ms,80):ms));
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6500);}
function speech(text){$('#speechText').textContent=`“${text}”`;}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function showDialog(selector){const d=$(selector);$$('dialog[open]').forEach(x=>x.close());if(!d.open)d.showModal();}
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function loadArchive(){try{const saved=JSON.parse(localStorage.getItem('evidence-bureau-cases')||'[]');state.archive=Array.isArray(saved)?saved.filter(r=>r&&typeof r.claim==='string'&&Array.isArray(r.sources)).slice(0,30):[];}catch{state.archive=[];}$('#archiveCount').textContent=String(state.archive.length).padStart(2,'0');$('#caseNumber').textContent=String(state.archive.filter(x=>x.mode==='live').length+1).padStart(3,'0');}
function saveReport(report){state.archive=state.archive.filter(r=>r.id!==report.id);state.archive.unshift(report);state.archive=state.archive.slice(0,30);try{localStorage.setItem('evidence-bureau-cases',JSON.stringify(state.archive));}catch{toast('浏览器存储不可用。你仍然可以下载当前报告。');}loadArchive();}
async function openServerCase(id){try{const r=await apiFetch('/api/cases?id='+encodeURIComponent(id));if(!r.ok)throw Error();openReport((await r.json()).report);}catch{toast('这份案卷暂时无法调阅。');}}
const statusText={supported:'得到支持',refuted:'被反驳',mixed:'条件或冲突',cold:'悬案 · 如实不知道'};
function renderServerArchive(list){
 for(const c of state.serverCases){const b=node('button','archive-card');b.append(node('small','',`${c.id} / ${formatDate(c.completedAt)}${c.depth==='deep'?' / 深度':''}`),node('p','',c.claim),node('span','',`${statusText[c.status]||'已结案'}   ↗`));b.onclick=()=>openServerCase(c.id);list.append(b);}
}
function renderArchive(){const list=$('#archiveList');list.replaceChildren();
 if(Array.isArray(state.serverCases)){if(!state.serverCases.length)list.append(node('p','empty-archive','档案柜还是空的。第一份委托，等你来写。'));else renderServerArchive(list);$('#clearArchiveBtn').hidden=true;return;}if(!state.archive.length)list.append(node('p','empty-archive','档案柜还是空的。第一份委托，等你来写。'));for(const report of state.archive){const b=node('button','archive-card');b.append(node('small','',`${report.id} / ${formatDate(report.completedAt)}`),node('p','',report.claim),node('span','',`${report.mode==='demo'?'示例 · ':''}${labels[report.verdict]||'无法判断'}   ↗`));b.onclick=()=>openReport(report);list.append(b);}$('#clearArchiveBtn').hidden=!state.archive.length;}
function formatDate(value){if(!value)return '未记录';const d=new Date(value);return isNaN(d)?String(value):d.toLocaleString('zh-CN',{hour12:false});}
function timeTick(){$('#clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}timeTick();setInterval(timeTick,30000);
loadArchive();
const office=await createOffice($('#scene'),ready=>{if(!ready)toast('三维场景暂不可用，委托和查证功能仍可使用。');},kind=>{if(kind==='lamp')toggleLamp();if(kind==='monitor'){if(state.phase==='idle')toast('这台终端只认来源，不认传闻。写一份委托试试。');else $('#investigationLog').scrollTop=1e6;}if(kind==='detective'&&state.phase==='welcome')speech('需要调查真相吗？');else if(kind==='detective')speech(['查不到，也是一个诚实的答案。','来源要点得开，结论要站得住。','截图只是线索，原始出处才是证据。'][Math.floor(Math.random()*3)]);});
async function refreshStatus(){try{const r=await fetch('/api/status');if(!r.ok)throw Error();state.providers=await r.json();$('#connectionLabel').textContent=state.providers.search?'元宝搜索已接入':'演示模式 · 待接入';$('#connectionDot').style.background=state.providers.search?'#b7ce91':'#b89967';}catch{$('#connectionLabel').textContent='服务暂不可用';state.providers={};}}
await refreshStatus();
await ensureAgent();renderBadge();
async function showStatus(){await refreshStatus();const list=$('#providerStatus');list.replaceChildren();for(const [label,ready,detail]of [['元宝搜索',state.providers.search,'待配置'],['分析与复核模型',state.providers.model,'待配置'],['截图文字识别',state.providers.vision,'可选，未配置']]){const row=node('div','provider-row');row.append(node('b','',label),node('span',ready?'ready':'',ready?'已接入':detail));list.append(row);}showDialog('#statusDialog');}
$('#statusBtn').onclick=showStatus;$('#helpStatusBtn').onclick=showStatus;
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
 box.title=`${a.codename} · ${a.rank} · 结案 ${a.cases} 件，其中如实“不知道” ${a.honest} 件`;
 $('#archiveCount').textContent=String(a.cases).padStart(2,'0');
}
$('#archiveBtn').onclick=async()=>{await syncArchive();renderArchive();showDialog('#archiveDialog');};$('#helpBtn').onclick=()=>showDialog('#helpDialog');
$('#clearArchiveBtn').onclick=()=>{if(!confirm('清空当前浏览器中的全部案件档案？已下载的报告不会受影响。'))return;localStorage.removeItem('evidence-bureau-cases');loadArchive();renderArchive();};
$('#claim').addEventListener('input',()=>{$('#charCount').textContent=`${$('#claim').value.length} / 800`;});
function chime(kind='paper'){
 if(!state.sound||!state.audio)return;const ctx=state.audio;ctx.resume();const now=ctx.currentTime;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=kind==='stamp'?'triangle':'sine';osc.frequency.setValueAtTime(kind==='stamp'?145:620,now);osc.frequency.exponentialRampToValueAtTime(kind==='stamp'?38:140,now+.18);gain.gain.setValueAtTime(kind==='stamp'?.23:.045,now);gain.gain.exponentialRampToValueAtTime(.001,now+.25);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(now+.26);
 if(kind==='stamp'){const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.12),ctx.sampleRate);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.018));const hit=ctx.createBufferSource();hit.buffer=buffer;const hitGain=ctx.createGain();hitGain.gain.value=.12;hit.connect(hitGain);hitGain.connect(ctx.destination);hit.start();}

}
let ambience;
$('#soundBtn').onclick=()=>{state.sound=!state.sound;$('#soundBtn').setAttribute('aria-pressed',state.sound);$('#soundBtn').setAttribute('aria-label',state.sound?'关闭环境音':'开启环境音');if(state.sound){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext){toast('当前浏览器不支持环境音。');return;}if(!state.audio){state.audio=new AudioContext();const ctx=state.audio;const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last;}const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;ambience=ctx.createGain();ambience.gain.value=0;source.connect(filter);filter.connect(ambience);ambience.connect(ctx.destination);source.start();}state.audio.resume();ambience.gain.setTargetAtTime(.12,state.audio.currentTime,.3);chime();}else if(ambience)ambience.gain.setTargetAtTime(0,state.audio.currentTime,.2);};
function toggleLamp(){const on=office.toggleLamp();$('#lampBtn').textContent=on?'◉ 桌灯已开':'○ 桌灯已关';$('#lampBtn').setAttribute('aria-pressed',on);}$('#lampBtn').onclick=toggleLamp;
function renderAttachments(){const list=$('#attachmentList');list.replaceChildren();state.images.forEach((item,i)=>{const figure=node('figure','attachment-photo');const img=node('img');img.src=item.url;img.alt='附件截图 '+(i+1);const remove=node('button','remove-photo','×');remove.type='button';remove.setAttribute('aria-label','移除第 '+(i+1)+' 张截图');remove.onclick=()=>{URL.revokeObjectURL(item.url);state.images=state.images.filter(x=>x!==item);renderAttachments();};figure.append(img,node('figcaption','',(i+1)+' / '+item.file.name),remove);list.append(figure);});$('#attachmentCount').textContent=state.images.length;$('#attachment').hidden=!state.images.length;$('#extractBtn').hidden=!state.images.length;$('#paperFootnote').textContent=state.images.length?'每张 ≤ 3 MB · 合计 ≤ 12 MB · 原图不传搜索、不归档':'公开知识与科学传闻 · 不受理时政和个人消息';}
async function attach(files){let count=0;const errors=[];for(const file of files){if(state.images.length>=6){errors.push('最多夹入 6 张截图。');break;}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){errors.push('仅支持 PNG、JPG 或 WebP。');continue;}if(file.size>3*1024*1024){errors.push(file.name+' 超过 3 MB。');continue;}if(state.images.reduce((n,x)=>n+x.file.size,0)+file.size>12*1024*1024){errors.push('截图合计不能超过 12 MB。');continue;}if(state.images.some(x=>x.file.name===file.name&&x.file.size===file.size&&x.file.lastModified===file.lastModified))continue;state.images.push({file,url:URL.createObjectURL(file),data:null});count++;}renderAttachments();$('#imageInput').value='';if(count)chime();if(errors.length)toast([...new Set(errors)].join(' '));}
$('.upload-label').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#imageInput').click();}};
$('#imageInput').onchange=e=>attach([...e.target.files]);
$('#removeAttachment').onclick=()=>{state.images.forEach(x=>URL.revokeObjectURL(x.url));state.images=[];renderAttachments();};
$('#caseForm').addEventListener('dragover',e=>e.preventDefault());$('#caseForm').addEventListener('drop',e=>{e.preventDefault();attach([...e.dataTransfer.files]);});
async function imageData(item){if(item.data)return item.data;return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(item.data=r.result);r.onerror=()=>reject(Error('图片读取失败'));r.readAsDataURL(item.file);});}
$('#extractBtn').onclick=async()=>{if(!state.images.length||state.phase!=='idle')return;const b=$('#extractBtn'),snapshot=[...state.images];b.disabled=true;try{const r=await apiFetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images:await Promise.all(snapshot.map(imageData))})});const result=await r.json();if(!r.ok)throw Error(result.error||'图片识别失败');if(snapshot.length!==state.images.length||snapshot.some((x,i)=>x!==state.images[i]))return toast('截图已发生变化，请重新识别当前附件。');if(!result.claim)throw Error('没有识别到清晰的待核验说法，请手动填写。');$('#claim').value=result.claim;$('#claim').dispatchEvent(new Event('input'));toast('已综合全部截图写入文字，请核对后递交。'+(result.notes?' '+result.notes:''));$('#claim').focus();}catch(e){toast(e.message);}finally{b.disabled=false;}};
function log(event){const list=$('#investigationLog');const line=node('div','log-line');const at=new Date(event.at||Date.now()).toLocaleTimeString('zh-CN',{hour12:false});line.append(node('small','',at),node('span','',event.message));if(event.query)line.append(node('div','log-query','↳ '+event.query));list.append(line);list.scrollTop=list.scrollHeight;const stages=['plan','search','compare','review','complete'];const i=stages.indexOf(event.stage==='sources'?'search':event.stage);state.step=Math.max(state.step||0,i);$('#progressBar').style.width=((state.step+1)/5*100)+'%';$$('.agent-steps li').forEach((el,n)=>{el.classList.toggle('done',n<state.step);el.classList.toggle('active',n===state.step);if(n===state.step)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});office.setProgress?.(event);const headings={plan:'拆解问题，寻找原始线索。',search:'去全网，找一手证据。',compare:'把不同来源，放在一起核对。',review:'再问一次：有没有反例？',complete:'调查结束，给结论留下依据。'};if(headings[event.stage])$('#investigationHeading').textContent=headings[event.stage];}
async function begin(demo=false){state.phase='working';state.step=0;sequenceLock(true);office.beginInvestigation?.(demo);$$('.agent-steps li').forEach((el,i)=>{el.classList.remove('done');el.classList.toggle('active',i===0);});$('#submitBtn').disabled=true;$('#sampleCases').hidden=true;$('#paperStage').inert=true;document.body.dataset.phase='submitting';speech(demo?'先用一份示例，带你走一遍调查流程。':'线索收到了。没有证据，我不会盖章。');office.setClaim?.($('#claim').value,state.images.map(x=>x.url));chime();$('#skipSequenceBtn').hidden=false;$('#cinematicCaption').hidden=false;await office.playSequence?.('submit',sequenceCue);$('#skipSequenceBtn').hidden=true;$('#cinematicCaption').hidden=true;$('#paperStage').hidden=true;document.body.classList.add('is-investigating');document.body.dataset.phase='investigating';sequenceLock(false);$('#investigationPanel').hidden=false;$('#terminalMode').textContent=demo?'OFFLINE DEMO':'YUANBAO / LIVE';$('#investigationLog').replaceChildren();$('#progressBar').style.width='5%';const started=Date.now();$('#elapsed').textContent='00:00';state.elapsedTimer=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('#elapsed').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');},1000);office.setState('search');}
function sequenceLock(on){$('.topbar').inert=on;$('#lampBtn').disabled=on;}
function reset(){sequenceLock(false);state.phase='idle';$('#cinematicCaption').hidden=true;$('#skipSequenceBtn').hidden=true;document.body.classList.remove('is-investigating');clearInterval(state.elapsedTimer);state.controller=null;$('#investigationPanel').hidden=true;$('#paperStage').hidden=false;$('#paperStage').classList.remove('submitting');$('#paperStage').inert=false;document.body.dataset.phase='writing';$('#sampleCases').hidden=false;$('#submitBtn').disabled=false;office.setState('idle');speech('下一条线索，是什么？');}
function verdictIcon(verdict){const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 80 80');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(ns,'path');p.setAttribute('d',({supported:'M40 5 67 16v22c0 18-16 29-27 36C29 67 13 56 13 38V16Z M26 39l10 11 20-23',refuted:'M21 21l38 38M59 21 21 59',mixed:'M40 9v34M40 59v3M10 70h60L40 10Z',unknown:'M27 26c0-18 30-19 30 0 0 11-17 12-17 25M40 64v2'}[verdict]||'M40 15v35M40 62v2'));svg.append(p);return svg;}
function openReport(report){state.report=report;const c=$('#reportContent');c.replaceChildren();c.append(node('p','report-kicker','THE EVIDENCE BUREAU / CASE REPORT'));const header=node('div','report-header');header.append(node('h2','','有据调查报告'));const id=node('div','report-id');id.append(node('div','',report.id),node('div','',formatDate(report.completedAt)));header.append(id);c.append(header);
 if(report.mode==='demo')c.append(node('div','demo-banner','离线示例 · 本报告为体验流程预先编排，未调用元宝搜索或模型，不是实时调查记录。'));
 const row=node('div','verdict-row');const seal=node('div','verdict-stamp '+report.verdict);seal.append(verdictIcon(report.verdict),node('strong','',labels[report.verdict]||'无法判断'),node('small','',({supported:'EVIDENCE SUPPORTED',refuted:'CLAIM REFUTED',mixed:'CONTEXT MATTERS',unknown:'INSUFFICIENT EVIDENCE'}[report.verdict]||'UNDER REVIEW')));row.append(seal,node('h3','report-claim',report.claim));c.append(row,node('p','report-summary',report.summary));
 if(report.cached)c.append(node('div','demo-banner','此为案卷调阅：复用了近期对同一说法的调查结果，未重新搜索。'));
 if(report.verdict==='unknown'){const cold=node('div','cold-case');cold.append(node('b','','悬案 · 如实说不知道'),node('p','',report.whatWouldSettle||'目前的证据不足以定论。出现来自两个独立来源的直接证据后，可以再查一次。'));c.append(cold);}
 if(report.captainNotes?.length){const pen=node('div','captain-notes');pen.append(node('b','','探长批示'));const list=node('ul');for(const note of report.captainNotes)list.append(node('li','',note));pen.append(list);c.append(pen);}
 c.append(node('h4','report-section-title',`THE EVIDENCE / ${report.sources.length} 条${report.mode==='demo'?'参考资料':'搜索来源'}`));
 const citedIds=new Set((report.evidence||[]).map(e=>e.sourceId));const extraSources=node('details','trace-details more-sources');extraSources.append(node('summary','',`其余检索资料（${report.sources.filter(s=>!citedIds.has(s.id)).length} 条，未作为直接结论依据）`));
 for(const source of [...report.sources].sort((a,b)=>Number(citedIds.has(b.id))-Number(citedIds.has(a.id)))){const card=node('section','evidence-card');const a=node('a','',`[${source.id}] ${source.title||source.host} ↗`);try{const u=new URL(source.url);if(!['http:','https:'].includes(u.protocol))continue;a.href=u.href;}catch{continue;}a.target='_blank';a.rel='noopener noreferrer';if(source.tierLabel){card.append(node('span','tier-tag tier-'+(source.tier||'unknown'),source.tierLabel));}card.append(a,node('div','source-meta',`${source.host}  ·  ${source.kind||'搜索摘要'}${source.publishedAt?'  ·  发布 '+source.publishedAt:''}${source.retrievedAt?'  ·  检索 '+formatDate(source.retrievedAt):''}`));
 const evidence=(report.evidence||[]).filter(e=>e.sourceId===source.id);for(const e of evidence){card.append(node('span','relation-tag '+e.relation,relations[e.relation]||'背景'));if(e.check&&checks[e.check])card.append(node('span','check-tag check-'+e.check,checks[e.check]));if(e.quote)card.append(node('blockquote','',e.quote));card.append(node('p','',e.explanation));}if(!evidence.length)card.append(node('p','',(source.excerpt||'暂无摘要').slice(0,650)));(citedIds.has(source.id)?c:extraSources).append(card);}
 if(report.sources.some(s=>!citedIds.has(s.id)))c.append(extraSources);
 c.append(node('h4','report-section-title','BOUNDARIES / 证据边界'));const ul=node('ul','limits');for(const line of report.limitations||[])ul.append(node('li','',line));c.append(ul);
 const details=node('details','trace-details');details.append(node('summary','',`调查过程与查询记录 · ${report.queries?.length||0} 轮搜索`));for(const t of report.trace||[])details.append(node('p','',`${formatDate(t.at)}  ${t.message}${t.query?'\n查询：'+t.query:''}${t.requestId?'\nRequestId：'+t.requestId:''}`));details.append(node('p','',`复核方式：${({'not-run':'未运行','same-model-second-pass':'同一模型第二轮复核','second-model':'第二模型复核','failed':'复核失败'}[report.reviewStatus])||'未记录'}。`));c.append(details,node('p','archive-saved','档案保存在当前浏览器 · 原始图片不归档 · 可下载完整报告'));showDialog('#reportDialog');$('#reportDialog').scrollTop=0;}
async function finish(report){clearInterval(state.elapsedTimer);state.report=report;$('#progressBar').style.width='100%';$('#investigationPanel').hidden=true;office.setReport?.(report);const conclusive=['supported','refuted'].includes(report.verdict);office.setState(conclusive?'print':report.verdict);speech(conclusive?'证据已整理好。结论和边界，都在这里。':report.verdict==='unknown'?'证据还不够。我会把已查到的线索和缺口一起交给你。':'条件还需要说清，结论和来源都在报告里。');chime('paper');document.body.dataset.phase='result';sequenceLock(true);document.body.classList.remove('is-investigating');$('#skipSequenceBtn').hidden=false;await office.playResult?.(report,sequenceCue);$('#skipSequenceBtn').hidden=true;saveReport(report);renderBadge();reset();office.setState(report.verdict);speech({supported:'现有证据支持这个说法。来源都在报告里。',refuted:'这个说法站不住脚。看看证据。',mixed:'答案有条件，不能只盖一个真假章。',unknown:'证据还不够。我现在不知道。'}[report.verdict]);openReport(report);}
$('#caseForm').onsubmit=async e=>{e.preventDefault();if(state.phase!=='idle')return;const claim=$('#claim').value.trim();if(claim.length<4)return toast('请写下至少 4 个字的线索。');if(!state.providers.search){await showStatus();return;}const controller=new AbortController();state.controller=controller;await begin(false);if(controller.signal.aborted)return;try{if(!state.agent)await ensureAgent();const r=await apiFetch('/api/investigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({claim,depth:$('#deep').checked?'deep':'standard'}),signal:controller.signal});if(!r.ok){const j=await r.json();throw Error(j.error||'调查请求失败');}const reader=r.body.getReader();const decoder=new TextDecoder();let buffer='',report=null;
 const receive=line=>{if(!line.trim())return;const message=JSON.parse(line);if(message.type==='progress')log(message);if(message.type==='result'){report=message.report;if(message.profile)state.agent=message.profile;}if(message.type==='error')throw Error(message.message);};
 while(true){const {done,value}=await reader.read();if(done){buffer+=decoder.decode();if(buffer.trim())receive(buffer);break;}buffer+=decoder.decode(value,{stream:true});let newline;while((newline=buffer.indexOf('\n'))>=0){receive(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}}
 if(!report)throw Error('连接中断，未收到完整报告。请重试。');if(!controller.signal.aborted)await finish(report);
 }catch(error){if(error.name==='AbortError'||controller.signal.aborted)return;toast(error.message);await returnDraft();}};
let demoCancelled=false;
$$('[data-demo]').forEach(b=>b.onclick=async()=>{if(state.phase!=='idle')return;demoCancelled=false;const report=demoReport(b.dataset.demo);$('#claim').value=report.claim;$('#claim').dispatchEvent(new Event('input'));await begin(true);const events=[['plan','演示：接收委托，区分命题与适用条件。'],['search','演示：展示多轮检索的步骤（未发起真实搜索）。'],['compare','演示：对照参考资料，检查说法中的概念。'],['review','演示：展示结论边界和来源入口。'],['complete','离线示例报告已备妥。']];for(const [stage,message]of events){if(demoCancelled)return;log({stage,message,at:new Date().toISOString()});await sleep(stage==='search'?1100:700);}if(!demoCancelled)await finish(report);});
async function returnDraft(){clearInterval(state.elapsedTimer);sequenceLock(true);document.body.dataset.phase='returning';$('#paperStage').hidden=false;$('#paperStage').inert=true;state.phase='returning';$('#investigationPanel').hidden=true;document.body.classList.remove('is-investigating');$('#skipSequenceBtn').hidden=false;await office.playSequence?.('return',sequenceCue);$('#skipSequenceBtn').hidden=true;reset();}$('#cancelBtn').onclick=async()=>{if(state.phase!=='working')return;state.controller?.abort();demoCancelled=true;await returnDraft();toast('委托已收回。已发起的上游请求可能仍计入额度。');};
$('#newCaseBtn').onclick=()=>{$('#reportDialog').close();showWelcome();$('#claim').value='';$('#claim').dispatchEvent(new Event('input'));$('#removeAttachment').click();};
function markdownReport(r){const lines=[`# 有据调查报告`,r.mode==='demo'?'\n> 离线示例：非实时搜索，不作为真实查证证明。':'',`\n编号：${r.id}`,`\n问题：${r.claim}`,`\n结论：${labels[r.verdict]}`,`\n${r.summary}`,`\n完成时间：${r.completedAt}`,`\n服务：${r.provider}`,`\n## 来源与证据`];for(const s of r.sources){lines.push(`\n### [${s.id}] ${s.title}`,`\n${s.url}`,`\n类型：${s.kind}；发布时间：${s.publishedAt||'未提供'}；检索时间：${s.retrievedAt||'离线示例'}`);for(const e of (r.evidence||[]).filter(e=>e.sourceId===s.id))lines.push(`\n${relations[e.relation]}：${e.explanation}`,e.quote?`\n> ${e.quote}`:'');}lines.push('\n## 限制',...(r.limitations||[]).map(x=>'- '+x),'\n## 检索过程',...(r.trace||[]).map(t=>`- ${t.at} ${t.message}${t.query?' | '+t.query:''}${t.requestId?' | RequestId: '+t.requestId:''}`));return lines.join('\n');}
$('#exportBtn').onclick=()=>{if(!state.report)return;const blob=new Blob([markdownReport(state.report)],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.report.id+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('报告已下载，包含结论、来源和查询过程。');};$('#printBtn').onclick=()=>window.print();
window.addEventListener('pagehide',()=>{state.controller?.abort();office.dispose();state.images.forEach(x=>URL.revokeObjectURL(x.url));state.audio?.close();});

$('#loading').style.opacity='0';setTimeout(()=>$('#loading').hidden=true,850);

$('#replayBtn').onclick=async()=>{if(!state.report||!['idle','welcome'].includes(state.phase))return;const report=state.report;$('#reportDialog').close();$('#welcome').hidden=true;state.phase='replay';speech('这份调查已经完成。把报告交给你。');sequenceLock(true);$('#paperStage').hidden=true;$('#sampleCases').hidden=true;document.body.dataset.phase='result';office.setClaim?.(report.claim);$('#skipSequenceBtn').hidden=false;await office.playResult?.(report,sequenceCue);$('#skipSequenceBtn').hidden=true;reset();openReport(report);};
function sequenceCue(cue){const messages={touch:'触碰入口 · 接受委托','scanner-open':'重新打开扫描仪',retrieve:'侦探正在取回委托单',prepare:'侦探正在取出委托单',offer:'侦探递出委托单',contact:'接住文件',release:'文件已交到你手中',submit:'把委托单递给侦探',grasp:'侦探已接住文件',place:'放入扫描仪 · 对齐原始线索',scan:'扫描委托 · 读取文字与附件',scanned:'扫描完成 · 侦探开始调查',print:'打印调查报告',stamp:'核验完成 · 落章',cross:'核对完成 · 标注反证',return:'接过调查结果'};if(messages[cue]){$('#cinematicCaption').textContent=messages[cue];$('#cinematicCaption').hidden=false;}if(cue==='touch'){$('#welcome').classList.add('touched');chime();}if(cue==='stamp')chime('stamp');}
function showWelcome(){office.setClaim?.('');state.phase='welcome';document.body.dataset.phase='welcome';$('#welcome').hidden=false;$('#welcome').classList.remove('touched','inviting');void $('#welcome').offsetWidth;$('#welcome').classList.add('inviting');$('#startCaseBtn').disabled=false;$('#paperStage').hidden=true;$('#sampleCases').hidden=true;$('#investigationPanel').hidden=true;$('#cinematicCaption').hidden=true;office.setState('greet');speech('需要调查真相吗？');}
$('#startCaseBtn').onclick=async e=>{if(state.phase!=='welcome')return;state.phase='onboarding';sequenceLock(true);document.body.dataset.phase='onboarding';$('#startCaseBtn').disabled=true;$('#paperStage').hidden=false;$('#paperStage').inert=true;$('#skipSequenceBtn').hidden=false;$('#cinematicCaption').textContent='';await office.playSequence?.('onboard',sequenceCue,{touch:e.clientX&&e.clientY?{x:e.clientX,y:e.clientY}:null});if(state.phase!=='onboarding')return;$('#welcome').hidden=true;$('#skipSequenceBtn').hidden=true;$('#cinematicCaption').hidden=true;reset();speech('把线索写下来。截图也可以，多给我几张。');if(innerWidth>800)$('#claim').focus({preventScroll:true});};
$('#skipSequenceBtn').onclick=()=>office.skipSequence?.();
showWelcome();

// ---- 盯梢 (continuous watch) ----
const watchWords={pending:'等待邮箱确认',active:'盯梢中'};
const kindWords={unchanged:'无变化','became-conclusive':'有了结论','verdict-changed':'结论改变','became-unknown':'暂时查不到','check-failed':'本次检查失败'};
async function renderWatches(){
 const list=$('#watchList');list.replaceChildren();
 try{
  const r=await apiFetch('/api/watch');if(!r.ok)throw Error();const d=await r.json();
  if(!d.mail){$('#watchNote').textContent='邮件服务尚未配置，暂时不能开启新的盯梢。';$('#watchSubmit').disabled=true;}else{$('#watchSubmit').disabled=false;}
  for(const w of d.watches){
   const row=node('div','watch-row');const last=w.history[0];
   row.append(node('p','',w.claim),node('small','',`${watchWords[w.status]||w.status} · ${w.email}${last?' · 最近：'+(kindWords[last.kind.split('+')[0]]||last.kind)+' '+formatDate(last.at):''}`));
   const rm=node('button','text-btn danger','取消盯梢');rm.type='button';
   rm.onclick=async()=>{rm.disabled=true;const x=await apiFetch('/api/watch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({remove:w.id})});if(x.ok)renderWatches();else rm.disabled=false;};
   row.append(rm);list.append(row);
  }
 }catch{$('#watchNote').textContent='盯梢列表暂时无法读取。';}
}
$('#watchBtn').onclick=async()=>{
 if(!state.report||state.report.mode==='demo')return toast('只有真实调查的案卷才能盯梢。');
 if(state.report.archiveFailed)return toast('这份案卷没有保存成功，无法盯梢。请重新调查一次。');
 $('#watchNote').textContent='';$('#reportDialog').close();showDialog('#watchDialog');await renderWatches();$('#watchEmail').focus();
};
$('#watchForm').onsubmit=async e=>{
 e.preventDefault();if(!state.report?.id){$('#watchNote').textContent='请先从一份调查报告里点“帮我盯着”。';return;}const b=$('#watchSubmit');b.disabled=true;$('#watchNote').textContent='正在发送确认邮件…';
 try{
  const r=await apiFetch('/api/watch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({caseId:state.report.id,email:$('#watchEmail').value.trim()})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'开启失败');
  $('#watchNote').textContent=d.note;$('#watchEmail').value='';await renderWatches();
 }catch(err){$('#watchNote').textContent=err.message;}finally{b.disabled=false;}
};

setupSharing({getReport:()=>state.report,showDialog,toast});
