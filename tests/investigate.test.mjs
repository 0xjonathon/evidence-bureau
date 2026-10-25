import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePages,parseModelJSON,safeUrl,boundedQuery,modelJSON} from '../lib/providers.mjs';
import {validateInput,validateAssessment,investigate,selectSources,sourceQuote,evidenceFragments} from '../lib/investigate.mjs';
import {betOutcome,normalizeBet,evidenceStrength} from '../lib/bet.mjs';
const sources=[{id:'S1',url:'https://a.test/a',host:'a.test',excerpt:'研究原始数据表明该命题并不成立，尚需核验适用条件。',title:'source one'},{id:'S2',url:'https://b.test/a',host:'b.test',excerpt:'独立观测数据显示该命题不成立，不应相信截图传闻。',title:'source two'}];
const evidence=[{sourceId:'S1',quote:'研究原始数据表明该命题并不成立',relation:'refutes'},{sourceId:'S2',quote:'独立观测数据显示该命题不成立',relation:'refutes'}];
test('provider parses string pages, strips markup, deduplicates, rejects unsafe URLs',()=>{const pages=normalizePages([JSON.stringify({url:'https://a.test/',title:'<b>A</b>',passage:'<strong>quote</strong>'}),{url:'https://a.test/'},{url:'javascript:alert(1)'},'invalid',null]);assert.equal(pages.length,1);assert.equal(pages[0].excerpt,'quote');assert.equal(pages[0].title,'A');assert.equal(safeUrl('file:///etc/passwd'),null);});
test('model JSON handles fenced responses but rejects text',()=>{assert.deepEqual(parseModelJSON('```json\n{"verdict":"unknown"}\n```'),{verdict:'unknown'});assert.throws(()=>parseModelJSON('I think so.'));});
test('rejects unsupported topics and invalid lengths',()=>{assert.throws(()=>validateInput({claim:'hi'}));assert.throws(()=>validateInput({claim:'帮我查他的家庭住址在哪里'}));assert.deepEqual(validateInput({claim:'月球背面永远是黑夜？',depth:'deep'}),{claim:'月球背面永远是黑夜？',depth:'deep',userBet:null});assert.equal(validateInput({claim:'月球背面永远是黑夜？',userBet:'false'}).userBet,'false');assert.equal(validateInput({claim:'月球背面永远是黑夜？',userBet:'depends'}).userBet,null);});
test('two-domain exact cited evidence can support a refutation',()=>{const a=validateAssessment({verdict:'refuted',summary:'不成立',evidence},sources);assert.equal(a.verdict,'refuted');assert.equal(a.evidence.length,2);});
test('fabricated citations, nonmatching quotations, same-host evidence cannot yield a verdict',()=>{let a=validateAssessment({verdict:'supported',evidence:[{sourceId:'S9',quote:'伪造的引用内容不匹配任何来源',relation:'supports'}]},sources);assert.equal(a.verdict,'unknown');assert.equal(a.evidence.length,0);a=validateAssessment({verdict:'refuted',evidence},sources.map(s=>({...s,host:'a.test'})));assert.equal(a.verdict,'unknown');});
test('contradictory or missing relations conservatively downgrade',()=>{assert.equal(validateAssessment({verdict:'supported',evidence},sources).verdict,'unknown');assert.equal(validateAssessment({verdict:'mixed',evidence},sources).verdict,'unknown');});
const env={TENCENTCLOUD_WSA_APIKEY:'test-not-a-real-key',LLM_API_KEY:'test-not-a-real-key',LLM_MODEL:'test'};
// Dispatch on the prompt, not on call order: the planner and the gut call now run in parallel.
const isGut=s=>s.startsWith('你是“有据事务所”的探长'),isPlan=s=>s.startsWith('将待核验命题'),isReview=s=>s.includes('独立复核');
test('live orchestration searches several lanes, performs second pass, retains trace and exact evidence',async()=>{const events=[];const modelCalls=[];const report=await investigate({claim:'这是一个公开科学说法吗？'},e=>events.push(e),{env,searchFn:async()=>({sources,requestId:'test-request'}),modelFn:async(system)=>{modelCalls.push(system.slice(0,6));if(isGut(system))return {allowed:true,guess:'true',confidence:'mid',reason:'x'};if(isPlan(system))return {allowed:true,queries:['官方数据','反例查证']};return {verdict:'refuted',summary:'不成立',evidence};}});assert.equal(report.verdict,'refuted');assert.equal(report.mode,'live');assert.equal(modelCalls.length,4);assert.equal(report.queries.length,4);assert.equal(report.sources.length,2);assert.equal(report.reviewStatus,'same-model-second-pass');assert.ok(events.some(x=>x.stage==='review'));assert.ok(events.some(x=>x.stage==='bet'));assert.ok(report.trace.some(x=>x.requestId==='test-request'));assert.equal(report.gut.outcome,'overturned');});
test('missing model returns sources but never fabricates a verdict',async()=>{const report=await investigate({claim:'月球背面永远是黑夜？'},()=>{},{env:{TENCENTCLOUD_WSA_APIKEY:'test'},searchFn:async()=>({sources,requestId:'test'})});assert.equal(report.verdict,'unknown');assert.equal(report.evidence.length,0);assert.equal(report.reviewStatus,'not-run');});
test('missing search key fails before external calls',async()=>{await assert.rejects(()=>investigate({claim:'月球背面永远是黑夜？'},()=>{},{env:{}}),/尚未配置/);});
test('total upstream failure does not return a successful report',async()=>{await assert.rejects(()=>investigate({claim:'月球背面永远是黑夜？'},()=>{},{env:{TENCENTCLOUD_WSA_APIKEY:'test'},searchFn:async()=>{throw Error('quota');}}),/所有元宝搜索请求均失败/);});
test('review failure downgrades to unknown',async()=>{const report=await investigate({claim:'公开科学说法的真伪？'},()=>{},{env,searchFn:async()=>({sources,requestId:'test'}),modelFn:async(system)=>{if(isGut(system))return {allowed:true,guess:'true',confidence:'low',reason:'x'};if(isPlan(system))return {allowed:true,queries:['官方','反例']};if(isReview(system))throw Error('model unavailable');return {verdict:'refuted',summary:'不成立',evidence};}});assert.equal(report.verdict,'unknown');assert.equal(report.reviewStatus,'failed');});

test('bet outcomes are decided by plain code from the final verdict',()=>{
 const cases=[['true','supported','confirmed'],['true','refuted','overturned'],['false','refuted','confirmed'],['false','supported','overturned'],['true','mixed','nuanced'],['false','mixed','nuanced'],['depends','mixed','confirmed'],['depends','supported','sharpened'],['depends','refuted','sharpened'],['unsure','supported','sharpened'],['unsure','mixed','sharpened'],['true','unknown','unsettled'],['false','unknown','unsettled'],['unsure','unknown','unsettled'],['depends','unknown','unsettled'],[null,'supported','no-bet'],['nonsense','refuted','no-bet']];
 for(const [guess,verdict,want] of cases)assert.equal(betOutcome(guess,verdict),want,`${guess} vs ${verdict}`);
});
test('a bet is accepted only in the documented shape, with bounded text',()=>{
 assert.equal(normalizeBet(null),null);assert.equal(normalizeBet({allowed:false,guess:'true'}),null);assert.equal(normalizeBet({guess:'maybe'}),null);assert.equal(normalizeBet('true'),null);
 const b=normalizeBet({guess:'false',confidence:'certain',reason:'<b>x</b>'+'很'.repeat(200)});
 assert.equal(b.guess,'false');assert.equal(b.confidence,'low');assert.ok(!b.reason.includes('<'));assert.ok(b.reason.length<=80);
});
test('evidence strength describes publisher types and never claims a probability',()=>{
 const src=(id,tier,originId=id)=>({id,tier,originId});
 const ev=ids=>ids.map(sourceId=>({sourceId,relation:'refutes'}));
 assert.equal(evidenceStrength(ev(['S1','S2']),[src('S1','official'),src('S2','academic')],'refuted').level,'strong');
 assert.equal(evidenceStrength(ev(['S1','S2']),[src('S1','media'),src('S2','social')],'refuted').level,'moderate');
 assert.equal(evidenceStrength(ev(['S1','S2']),[src('S1','social'),src('S2','unknown')],'refuted').level,'thin');
 assert.equal(evidenceStrength(ev(['S1','S2']),[src('S1','official','O'),src('S2','official','O')],'refuted').level,'thin');   // two copies of one origin are one origin
 assert.equal(evidenceStrength([],[],'refuted').level,'none');assert.equal(evidenceStrength(ev(['S1']),[src('S1','official')],'unknown').level,'none');
 assert.ok(!/%|概率/.test(evidenceStrength(ev(['S1','S2']),[src('S1','official'),src('S2','academic')],'refuted').note));
});
test('abort stops subsequent searches',async()=>{const c=new AbortController();c.abort();await assert.rejects(()=>investigate({claim:'月球背面永远是黑夜？'},()=>{},{env:{TENCENTCLOUD_WSA_APIKEY:'test'},signal:c.signal}),/取消/);});

test("queries are UTF-8 bounded without splitting CJK characters",()=>{const q=boundedQuery("汉".repeat(800));assert.equal(Buffer.byteLength(q,"utf8"),1500);assert.equal(q.length,500);assert.deepEqual(normalizePages(null),[]);});

test('background sources cannot satisfy the direct evidence requirement',()=>{
  for(const relation of ['supports','refutes']){
    const verdict=relation==='supports'?'supported':'refuted';
    const a=validateAssessment({verdict,evidence:[{...evidence[0],relation},{...evidence[1],relation:'context'}]},sources);
    assert.equal(a.verdict,'unknown');
    assert.ok(a.limitations.some(x=>x.includes('直接')));
  }
});
test('duplicate direct citations from one host plus another background host remain insufficient',()=>{
  const third={...sources[0],id:'S3',url:'https://a.test/b'};
  const a=validateAssessment({verdict:'refuted',evidence:[evidence[0],{...evidence[0],sourceId:'S3'},{...evidence[1],relation:'context'}]},[...sources,third]);
  assert.equal(a.verdict,'unknown');
});
test('malformed evidence entries are ignored without interrupting report validation',()=>{
  const a=validateAssessment({verdict:'refuted',evidence:[null,7,[],...evidence]},sources);
  assert.equal(a.verdict,'refuted');
  assert.equal(a.evidence.length,2);
});
test('JSON scalars and arrays are not valid model reports',()=>{
  for(const content of ['null','[]','true','123','"answer"'])assert.throws(()=>parseModelJSON(content),/结构化报告/);
});


test('evidence budget preserves later original-source and counterevidence rounds',()=>{
 const queries=['claim','original','counter'];
 const pages=queries.flatMap((query,i)=>Array.from({length:10},(_,j)=>({query,url:`https://s${i}.test/${j}`,id:`S${i*10+j+1}`})));
 const selected=selectSources(pages,queries,12);
 assert.equal(selected.length,12);
 for(const query of queries)assert.equal(selected.filter(s=>s.query===query).length,4);
});
test('provider sends configured JSON mode, reasoning effort and bounded output budget',async t=>{
 let sent;
 t.mock.method(globalThis,'fetch',async(_url,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]})};});
 assert.deepEqual(await modelJSON('Return JSON','test',{env:{LLM_API_KEY:'test',LLM_MODEL:'step-3.7-flash',LLM_BASE_URL:'https://api.stepfun.com/v1',LLM_JSON_MODE:'true',LLM_REASONING_EFFORT:'low',LLM_MAX_TOKENS:'8192'}}),{ok:true});
 assert.deepEqual(sent.response_format,{type:'json_object'});assert.equal(sent.reasoning_effort,'low');assert.equal(sent.max_tokens,8192);
});
test('provider rejects truncated model output even when its prefix is valid JSON',async t=>{
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"ok":true}'}}]})}));
 await assert.rejects(()=>modelJSON('Return JSON','test',{env:{LLM_API_KEY:'test',LLM_MODEL:'test'}}),/长度上限/);
});


test('typographic punctuation matches return exact original source text',()=>{
 const excerpt='虽然月球始终只有一面朝向着地球,但这并不意味着它的背面是一个永远黑暗的世界。';
 const quote='虽然月球始终只有一面朝向着地球，但这并不意味着它的背面是一个永远黑暗的世界。';
 assert.equal(sourceQuote(excerpt,quote),excerpt);
 assert.equal(sourceQuote('Temperatures range from -173 to +127 degrees.','Temperatures range from 173 to +127 degrees.'),'');
 assert.equal(sourceQuote('The value is 1.0 and not 10.','The value is 10 and not 10.'),'');
 assert.equal(sourceQuote('The message says now here.','The message says nowhere.'),'');
});
test('downgraded report removes an unsupported definitive summary',()=>{
 const a=validateAssessment({verdict:'refuted',summary:'该说法错误。',evidence:[]},sources);
 assert.equal(a.verdict,'unknown');assert.ok(a.summary.includes('不作真假判断'));assert.ok(!a.summary.includes('该说法错误'));
});


test('server fragments cover the source verbatim and preserve surrogate pairs',()=>{
 const excerpt='A'.repeat(159)+'🔎'+'月球背面不是永恒黑夜。'.repeat(30);
 const f=evidenceFragments({id:'S1',excerpt});
 assert.equal(f.map(x=>x.text).join(''),excerpt);
 assert.ok(f.every(x=>x.text.length<=160));
 assert.ok(f.every(x=>!/[\uD800-\uDBFF]$/.test(x.text)));
});
test('fragment citations use server-owned text and reject cross-source IDs',()=>{
 const raw={verdict:'refuted',summary:'不成立',evidence:sources.map(s=>({sourceId:s.id,fragmentId:s.id+':Q1',quote:'模型改写内容不得替换原文',relation:'refutes'}))};
 const a=validateAssessment(raw,sources);assert.equal(a.verdict,'refuted');assert.equal(a.evidence[0].quote,sources[0].excerpt);
 const b=validateAssessment({...raw,evidence:[{sourceId:'S1',fragmentId:'S2:Q1',relation:'refutes'}]},sources);
 assert.equal(b.evidence.length,0);assert.equal(b.verdict,'unknown');
});
