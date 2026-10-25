const VERDICT_LABEL={supported:'得到支持',refuted:'被反驳',mixed:'条件成立',unknown:'证据不足'};
const VERDICT_CLASS={supported:'positive',refuted:'negative',mixed:'conditional',unknown:'uncertain'};
const RELATION_LABEL={supports:'支持',refutes:'反驳',context:'背景'};

const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return ''}};

function splitClaim(claim){
  const parts=String(claim||'').split(/[。！？!?；;]+/).map(x=>x.trim()).filter(Boolean);
  if(parts.length<=1)return [String(claim||'').trim()].filter(Boolean);
  return parts.slice(0,4);
}

function makeAtoms(report){
  if(Array.isArray(report.atoms)&&report.atoms.length)return report.atoms.map((a,i)=>({...a,id:a.id||`A${i+1}`,text:String(a.text||''),verdict:a.verdict||report.verdict||'unknown',evidenceIds:Array.isArray(a.evidenceIds)?a.evidenceIds:[]}));
  const texts=splitClaim(report.claim);const evidence=Array.isArray(report.evidence)?report.evidence:[];
  return texts.map((text,i)=>{
    const relevant=evidence.filter(x=>i===0||x.relation==='context');
    let verdict=report.verdict||'unknown';
    if(i>0&&report.verdict==='supported'&&!relevant.length)verdict='unknown';
    return {id:`A${i+1}`,text,verdict,evidenceIds:relevant.map(x=>x.sourceId)};
  });
}

function makeGraph(report){
  const sources=Array.isArray(report.sources)?report.sources:[];const evidence=Array.isArray(report.evidence)?report.evidence:[];
  const groups=new Map();
  for(const source of sources){const key=String(source.originId||source.origin||source.host||source.id);if(!groups.has(key))groups.set(key,{id:key,label:source.host||source.title||key,sources:[],relations:[]});const group=groups.get(key);group.sources.push(source);for(const item of evidence.filter(x=>x.sourceId===source.id)){if(!group.relations.includes(item.relation))group.relations.push(item.relation);}}
  return [...groups.values()];
}

function quality(report,groups){
  const evidence=Array.isArray(report.evidence)?report.evidence:[];const verified=evidence.filter(e=>e.check==='verified').length;
  const direct=evidence.filter(e=>e.relation==='supports'||e.relation==='refutes').length;
  return {origins:groups.length,direct,verified,coverage:direct?Math.round((verified/direct)*100):0};
}

function replayBeats(report){
  if(Array.isArray(report.replay?.beats)&&report.replay.beats.length)return report.replay.beats;
  const groups=makeGraph(report);return [
    {label:'主张进入',detail:'一句话被收录为待核验案件。'},
    {label:'命题裂解',detail:`拆成 ${makeAtoms(report).length} 个可验证断言。`},
    {label:'来源聚合',detail:`${groups.length} 组来源形成证据谱系。`},
    {label:'反证复核',detail:'检查限定条件、同源转载与原文片段。'},
    {label:'当前结论',detail:VERDICT_LABEL[report.verdict]||'无法判断。'}
  ];
}

function renderCard(report,atoms,groups,qualityData){
  const card=el('div','theater-card-preview');
  card.append(el('p','theater-card-kicker','EVIDENCE CARD / 证据卡'));
  const title=el('h3','',report.claim);card.append(title);
  const verdict=el('div',`theater-card-verdict ${VERDICT_CLASS[report.verdict]||'uncertain'}`);verdict.append(el('strong','',VERDICT_LABEL[report.verdict]||'无法判断'),el('span','',`证据 ${qualityData.direct} 条 · 独立来源 ${qualityData.origins} 组`));card.append(verdict);
  const list=el('ul','theater-card-points');for(const atom of atoms.slice(0,3))list.append(el('li',VERDICT_CLASS[atom.verdict]||'uncertain',atom.text));card.append(list);
  const limit=report.whatWouldSettle||((report.limitations||[])[0]||'结论会随新的原文证据变化。');card.append(el('p','theater-card-boundary','改变结论所需：'+limit));
  const links=el('div','theater-card-links');for(const group of groups.slice(0,3)){const url=safeUrl(group.sources[0]?.url);if(!url)continue;const a=el('a','',group.label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}card.append(links);return card;
}

export function renderEvidenceTheater(container,report){
  const atoms=makeAtoms(report),groups=makeGraph(report),q=quality(report,groups),beats=replayBeats(report);
  const root=el('section','evidence-theater');root.setAttribute('aria-label','证据剧场');
  const head=el('div','theater-header');head.append(el('p','theater-kicker','EVIDENCE THEATER / 证据剧场'),el('h3','',`这句话，凭什么成立？`),el('p','theater-lede','我们不替你相信，把判断形成的现场交给你复核。'));root.append(head);
  const stats=el('div','theater-stats');for(const [label,value] of [['命题',atoms.length],['独立来源',q.origins],['直接证据',q.direct],['原文核对',`${q.coverage}%`]]){const item=el('div','theater-stat');item.append(el('b','',String(value)),el('span','',label));stats.append(item);}root.append(stats);
  const claimRoom=el('section','theater-room claim-room');claimRoom.append(el('h4','',`01 / CLAIM ROOM · 命题裂解`),el('p','room-note','一条传播语句不一定只有一个答案。'));const atomGrid=el('div','atom-grid');for(const atom of atoms){const card=el('article',`atom-card ${VERDICT_CLASS[atom.verdict]||'uncertain'}`);card.append(el('span','atom-id',atom.id),el('p','',atom.text),el('strong','',VERDICT_LABEL[atom.verdict]||'无法判断'));if(atom.whatWouldSettle)card.append(el('small','',atom.whatWouldSettle));atomGrid.append(card);}claimRoom.append(atomGrid);root.append(claimRoom);
  const sourceRoom=el('section','theater-room source-room');sourceRoom.append(el('h4','',`02 / SOURCE OBSERVATORY · 证据谱系`),el('p','room-note','重复转载折叠为来源簇，原文核对决定边框是否清晰。'));const graph=el('div','evidence-graph');for(const group of groups){const node=el('article',`evidence-node ${group.relations.includes('refutes')?'has-counter':''}`);const title=el('div','node-title');title.append(el('b','',group.label),el('span','',`${group.sources.length} 条`));node.append(title);const rels=el('div','node-relations');for(const r of group.relations)rels.append(el('span',`relation-chip ${r}`,RELATION_LABEL[r]||r));if(!group.relations.length)rels.append(el('span','relation-chip context','背景'));node.append(rels);const source=group.sources[0];if(source?.check==='verified'||source?.fullTextChecked)node.append(el('small','node-verified','原文已核对'));else node.append(el('small','node-unverified','摘要 / 待核对'));graph.append(node);}if(!groups.length)graph.append(el('p','empty-room','尚未形成独立来源链。'));sourceRoom.append(graph);root.append(sourceRoom);
  const archive=el('section','theater-room verdict-archive');archive.append(el('h4','',`03 / VERDICT ARCHIVE · 结论账本`));const ledger=el('ol','verdict-ledger');const items=Array.isArray(report.ledger)&&report.ledger.length?report.ledger:[{verdict:report.verdict,reason:report.summary||'基于当前证据形成暂时结论。',trigger:'当前调查完成'}];for(const item of items){const row=el('li',`ledger-item ${VERDICT_CLASS[item.verdict]||'uncertain'}`);row.append(el('span','ledger-dot'),el('div','',`${VERDICT_LABEL[item.verdict]||'无法判断'} · ${item.trigger||'证据更新'}`),el('p','',item.reason||''));ledger.append(row);}archive.append(ledger);const boundary=el('div','theater-boundary');boundary.append(el('b','','什么会改变结论？'),el('p','',report.whatWouldSettle||((report.limitations||[])[0]||'新的独立原文证据，或更清晰的定义。')));archive.append(boundary);root.append(archive);
  const actions=el('div','theater-actions');const cardButton=el('button','secondary-btn','展开证据卡');const replayButton=el('button','secondary-btn','播放案件回放');actions.append(cardButton,replayButton);root.append(actions);
  const card=renderCard(report,atoms,groups,q);card.hidden=true;root.append(card);const replay=el('div','theater-replay');replay.hidden=true;const replayList=el('ol','replay-beats');for(const beat of beats){const row=el('li','replay-beat');row.append(el('b','',beat.label),el('span','',beat.detail));replayList.append(row);}replay.append(replayList,el('p','replay-status','案件回放准备就绪。'));root.append(replay);
  cardButton.onclick=()=>{card.hidden=!card.hidden;cardButton.textContent=card.hidden?'展开证据卡':'收起证据卡';};replayButton.onclick=()=>{replay.hidden=false;replay.classList.remove('playing');void replay.offsetWidth;replay.classList.add('playing');const rows=[...replay.querySelectorAll('.replay-beat')];rows.forEach((row,i)=>{row.classList.remove('active');setTimeout(()=>row.classList.add('active'),i*720);});replay.querySelector('.replay-status').textContent='证据正在改变结论……';setTimeout(()=>{replay.querySelector('.replay-status').textContent='回放完成：'+(VERDICT_LABEL[report.verdict]||'无法判断')+'。';},rows.length*720+450);};
  container.append(root);return root;
}

export function addHeroMetadata(report){
  if(!report)return report;
  if(report.atoms)return report;
  const atoms=makeAtoms(report);return {...report,atoms,ledger:[{verdict:'supported',reason:'初始传播内容只呈现了单一方向的证据。',trigger:'案件建立'},{verdict:report.verdict,reason:report.summary,trigger:'限定条件与反证进入'}],replay:{beats:replayBeats(report)}};
}
