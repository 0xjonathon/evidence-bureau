import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceTier, groupOrigins, similarity, byTier} from '../lib/tier.mjs';
import {isPublicIp, assertPublicUrl, fetchDocument, quoteInDocument, verifyEvidence, LIMITS} from '../lib/fetchdoc.mjs';
import {evidenceFragments} from '../lib/investigate.mjs';

test('source tiers classify by publisher type and keep community hosts out of "reference"', () => {
  assert.equal(sourceTier('www.nasa.gov').tier, 'official');
  assert.equal(sourceTier('cmse.gov.cn').tier, 'official');
  assert.equal(sourceTier('igeo.cgs.gov.cn').tier, 'official');   // a .gov.cn research institute is still a government site
  assert.equal(sourceTier('www.cas.cn').tier, 'academic');
  assert.equal(sourceTier('www.nature.com').tier, 'academic');
  assert.equal(sourceTier('tsinghua.edu.cn').tier, 'academic');
  assert.equal(sourceTier('skyandtelescope.org').tier, 'media');
  assert.equal(sourceTier('baike.baidu.com').tier, 'reference');
  assert.equal(sourceTier('www.eb.com').tier, 'reference');
  assert.equal(sourceTier('zhuanlan.zhihu.com').tier, 'social');
  assert.equal(sourceTier('mp.weixin.qq.com').tier, 'social');
  assert.equal(sourceTier('random-blog.example').tier, 'unknown');
  assert.equal(sourceTier('evilnasa.gov.attacker.com').tier, 'unknown');
  const sorted = [sourceTier('weibo.com'), sourceTier('nasa.gov')].sort(byTier);
  assert.equal(sorted[0].tier, 'official');
});

test('near-identical excerpts collapse to one origin, different ones stay independent', () => {
  const a = '月球背面指背向地球、无法从地面直接观测的一面，并非永远没有阳光，月球自转周期与公转周期相同。';
  const b = '月球背面指背向地球、无法从地面直接观测的一面，并非永远没有阳光，月球自转周期与公转周期相同！转载自某网。';
  const c = 'NASA explains that the far side of the Moon receives as much sunlight as the near side over a lunar day.';
  assert.ok(similarity(a, b) > 0.8);
  assert.ok(similarity(a, c) < 0.2);
  const origins = groupOrigins([{id: 'S1', excerpt: a}, {id: 'S2', excerpt: b}, {id: 'S3', excerpt: c}]);
  assert.equal(origins.get('S2'), 'S1');
  assert.equal(origins.get('S3'), 'S3');
  assert.equal(new Set(origins.values()).size, 2);
  // very short excerpts are never merged on weak evidence
  const tiny = groupOrigins([{id: 'A', excerpt: '短'}, {id: 'B', excerpt: '短'}]);
  assert.equal(new Set(tiny.values()).size, 2);
});

test('fragments break at sentence or clause boundaries, never inside an English word', () => {
  const text = 'Credit: BBC Sky at Night Magazine While one side of the Moon permanently faces towards Earth and one permanently faces away, both sides receive pretty much equal amounts of sunlight over a full lunar cycle.';
  const f = evidenceFragments({id: 'S1', excerpt: text});
  assert.equal(f.map(x => x.text).join(''), text);
  assert.ok(f.length >= 2);
  for (const x of f.slice(0, -1)) assert.ok(/[\s,.;]$/.test(x.text), `fragment ends mid-word: ${JSON.stringify(x.text.slice(-12))}`);
  assert.ok(!f.some(x => /equ$/.test(x.text)));
});

test('IP classifier rejects private, loopback, link-local, metadata and mapped addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPublicIp(ip), true, ip);
  assert.equal(isPublicIp('not-an-ip'), false);
});

test('URL guard rejects bad schemes, credentials, ports, internal names and private DNS answers', async () => {
  const pub = async () => [{address: '93.184.216.34', family: 4}];
  const priv = async () => [{address: '10.0.0.5', family: 4}];
  const mixed = async () => [{address: '93.184.216.34', family: 4}, {address: '127.0.0.1', family: 4}];
  await assertPublicUrl('https://example.com/a', pub);
  for (const bad of ['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'https://user:pw@example.com/', 'https://example.com:8080/', 'http://localhost/', 'http://foo.localhost/', 'http://printer.local/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://127.0.0.1/', 'not a url']) {
    await assert.rejects(() => assertPublicUrl(bad, pub), undefined, bad);
  }
  await assert.rejects(() => assertPublicUrl('https://rebind.example/', priv), /非公网/);
  await assert.rejects(() => assertPublicUrl('https://rebind.example/', mixed), /非公网/);
  await assert.rejects(() => assertPublicUrl('https://nx.example/', async () => { throw new Error('ENOTFOUND'); }), /无法解析/);
});

const html = body => ({ok: true, status: 200, headers: new Headers({'content-type': 'text/html; charset=utf-8'}), body: new Response(body).body});
const pub = async () => [{address: '93.184.216.34', family: 4}];

test('fetchDocument strips scripts and markup and returns readable text', async () => {
  const res = await fetchDocument('https://example.com/a', {lookup: pub, fetchImpl: async () => html('<html><head><title>x</title></head><body><script>evil()</script><p>月球背面并非永远黑暗。</p><style>p{}</style></body></html>')});
  assert.equal(res.text, '月球背面并非永远黑暗。');
});

test('redirects are followed manually and every hop is re-validated', async () => {
  const seen = [];
  const redirectToMetadata = async url => { seen.push(url); return {ok: false, status: 302, headers: new Headers({location: 'http://169.254.169.254/latest/meta-data/'}), body: null}; };
  await assert.rejects(() => fetchDocument('https://example.com/a', {lookup: pub, fetchImpl: redirectToMetadata}), /地址不允许/);
  assert.equal(seen.length, 1);   // the metadata URL was never requested
  let n = 0;
  const loop = async () => { n++; return {ok: false, status: 302, headers: new Headers({location: '/again'}), body: null}; };
  await assert.rejects(() => fetchDocument('https://example.com/a', {lookup: pub, fetchImpl: loop}), /重定向过多/);
  assert.equal(n, LIMITS.redirects + 1);
});

test('non-text content and HTTP errors are rejected; oversize bodies are truncated', async () => {
  const pdf = async () => ({ok: true, status: 200, headers: new Headers({'content-type': 'application/pdf'}), body: new Response('x').body});
  await assert.rejects(() => fetchDocument('https://example.com/a', {lookup: pub, fetchImpl: pdf}), /不是网页文本/);
  const nf = async () => ({ok: false, status: 404, headers: new Headers(), body: null});
  await assert.rejects(() => fetchDocument('https://example.com/a', {lookup: pub, fetchImpl: nf}), /HTTP 404/);
  const big = async () => html('a'.repeat(5000));
  const res = await fetchDocument('https://example.com/a', {lookup: pub, fetchImpl: big, limits: {...LIMITS, bytes: 1000}});
  assert.equal(res.text.length, 1000);
});

test('quote verification ignores spacing and punctuation but never accepts a different claim', () => {
  const page = '科普中国：月球背面≠黑暗面。月球在绕地球运行时不断接受太阳照射。';
  assert.equal(quoteInDocument('月球背面 ≠ 黑暗面，月球在绕地球运行时不断接受太阳照射', page), true);
  assert.equal(quoteInDocument('月球背面永远黑暗', page), false);
  assert.equal(quoteInDocument('短', page), false);
});

test('verifyEvidence marks verified, not-found, fetch-failed and summary-only without throwing', async () => {
  const sources = [1, 2, 3, 4, 5].map(i => ({id: 'S' + i, url: `https://s${i}.test/`}));
  const quote = '月球在绕地球运行时不断接受太阳照射';
  const evidence = sources.map(s => ({sourceId: s.id, quote, relation: 'refutes'}));
  const fetchFn = async url => {
    if (url.includes('s1')) return {text: '……' + quote + '……'};
    if (url.includes('s2')) return {text: '完全无关的页面内容，没有那句话存在于这里。'};
    throw new Error('HTTP 403');
  };
  const out = await verifyEvidence(evidence, sources, {max: 4, fetchFn});
  assert.deepEqual(out.map(e => e.check), ['verified', 'not-found', 'fetch-failed', 'fetch-failed', 'summary-only']);
  assert.equal(out[2].checkNote, 'HTTP 403');
});

test('two reposts of one text on different hosts do not count as independent corroboration', async () => {
  const { validateAssessment } = await import('../lib/investigate.mjs');
  const text = '研究原始数据表明该命题并不成立，这一结论来自同一份原始公告，各转载站点内容相同。';
  const sources = [
    { id: 'S1', url: 'https://a.test/x', host: 'a.test', excerpt: text, title: 'original' },
    { id: 'S2', url: 'https://b.test/x', host: 'b.test', excerpt: text + ' 转载自 a.test', title: 'repost' },
  ];
  const evidence = sources.map(s => ({ sourceId: s.id, quote: text.slice(0, 20), relation: 'refutes' }));
  const a = validateAssessment({ verdict: 'refuted', summary: '不成立', evidence }, sources);
  assert.equal(a.verdict, 'unknown');
  assert.ok(a.limitations.some(x => x.includes('独立')));
  // genuinely different texts from different hosts still pass
  const independent = [
    sources[0],
    { id: 'S2', url: 'https://b.test/y', host: 'b.test', excerpt: 'Observations from a separate instrument show the proposition fails under every tested condition.', title: 'other' },
  ];
  const ok = validateAssessment({ verdict: 'refuted', summary: '不成立', evidence: [
    { sourceId: 'S1', quote: text.slice(0, 20), relation: 'refutes' },
    { sourceId: 'S2', quote: 'Observations from a separate instrument show the proposition fails', relation: 'refutes' },
  ] }, independent);
  assert.equal(ok.verdict, 'refuted');
});

// ---- orchestration: deep gap search, full-text verification, captain notes ----
const { investigate } = await import('../lib/investigate.mjs');
const env = { TENCENTCLOUD_WSA_APIKEY: 'x', LLM_API_KEY: 'x', LLM_MODEL: 'x' };
const pageA = { url: 'https://nasa.gov/a', host: 'nasa.gov', title: 'a', excerpt: '研究原始数据表明该命题并不成立，尚需核验适用条件，这是第一个机构的独立测量结论。' };
const pageB = { url: 'https://b.test/a', host: 'b.test', title: 'b', excerpt: 'Independent observations from a different instrument show the proposition fails in every tested case.' };
const searchOnce = (log = []) => async q => { log.push(q); return { sources: [{ ...pageA, url: pageA.url + '?' + log.length }, { ...pageB, url: pageB.url + '?' + log.length }], requestId: 'rid' + log.length }; };

function scriptedModel({ gapQueries = [], settle = '', gut = { allowed: true, guess: 'true', confidence: 'high', reason: '凭印象' }, gutFails = false } = {}) {
  const calls = [];
  const fn = async (system, content) => {
    calls.push(system.slice(0, 12));
    if (system.startsWith('你是“有据事务所”的探长')) { if (gutFails) throw new Error('gut model down'); return gut; }
    if (system.startsWith('将待核验命题')) return { allowed: true, timeSensitive: false, queries: ['官方数据', '反例查证', '换个角度'] };
    if (system.startsWith('你是调查员')) return { enough: gapQueries.length === 0, gaps: ['缺少独立反证'], queries: gapQueries };
    const ev = [
      { sourceId: 'S1', fragmentId: 'S1:Q1', relation: 'refutes', explanation: 'x' },
      { sourceId: 'S2', fragmentId: 'S2:Q1', relation: 'refutes', explanation: 'y' },
    ];
    const reviewing = system.includes('独立复核');
    return { verdict: 'refuted', summary: '不成立', evidence: ev, ...(reviewing ? { captainNotes: ['  证据来自两个机构 ', 7, '<b>注意条件</b>'], whatWouldSettle: '' } : {}) };
  };
  fn.calls = calls;
  return fn;
}

test('standard depth never runs the gap-search step; deep depth chases model-named gaps (max two)', async () => {
  const q1 = [], m1 = scriptedModel();
  const std = await investigate({ claim: '这是一个公开科学说法吗', depth: 'standard' }, () => {}, { env, searchFn: searchOnce(q1), modelFn: m1 });
  assert.equal(std.queries.length, 4);   // claim (web), claim (official lane), original source, counter-evidence
  assert.ok(!m1.calls.some(c => c.startsWith('你是调查员')));
  const q2 = [], m2 = scriptedModel({ gapQueries: ['缺口一', '缺口二', '缺口三'] });
  const events = [];
  const deep = await investigate({ claim: '这是一个公开科学说法吗', depth: 'deep' }, e => events.push(e), { env, searchFn: searchOnce(q2), modelFn: m2 });
  assert.equal(deep.queries.length, 8);   // 4 core + news lane + angle + 2 gap queries (third gap query is dropped)
  assert.ok(deep.queries.includes('缺口一') && deep.queries.includes('缺口二') && !deep.queries.includes('缺口三'));
  assert.ok(events.some(e => e.stage === 'gap' && e.gaps));
  assert.equal(q2.length, deep.queries.length);
});

test('deep mode skips gap search when an earlier search failed, keeping the conservative downgrade', async () => {
  // The counter-evidence query is a core round: if it fails, nothing may be concluded.
  const flaky = async (q, o) => { if (q === '反例查证') throw new Error('quota'); return { sources: [pageA, pageB], requestId: 'r' }; };
  const m = scriptedModel({ gapQueries: ['x'] });
  const r = await investigate({ claim: '这是一个公开科学说法吗', depth: 'deep' }, () => {}, { env, searchFn: flaky, modelFn: m });
  assert.ok(!m.calls.some(c => c.startsWith('你是调查员')));
  assert.equal(r.verdict, 'unknown');
});

test('a failed optional lane is disclosed but does not by itself force "unknown"', async () => {
  const search = async (q, o) => { if (o.industry === 'gov') throw new Error('gov lane down'); return { sources: [pageA, pageB], requestId: 'r' }; };
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: search, modelFn: scriptedModel() });
  assert.equal(r.verdict, 'refuted');
  assert.ok(r.limitations.some(x => x.includes('补充检索通道失败')));
  assert.ok(r.rounds.some(x => x.lane === 'gov' && x.failed));
});

test('the official lane is searched with Industry=gov and the others without a filter', async () => {
  const seen = [];
  const search = async (q, o) => { seen.push({ q, industry: o.industry }); return { sources: [pageA, pageB], requestId: 'r' }; };
  await investigate({ claim: '这是一个公开科学说法吗', depth: 'deep' }, () => {}, { env, searchFn: search, modelFn: scriptedModel() });
  assert.deepEqual([...new Set(seen.map(x => x.industry))].sort(), [undefined, 'gov', 'news'].sort());
  assert.equal(seen.filter(x => x.industry === 'gov').length, 1);
});

test('searches run concurrently, not one after another', async () => {
  let live = 0, peak = 0;
  const search = async () => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 25)); live--; return { sources: [pageA, pageB], requestId: 'r' }; };
  await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: search, modelFn: scriptedModel() });
  assert.ok(peak >= 4, `peak concurrency was ${peak}`);
});

test('the gut call is made without sources, then settled by code against the verdict', async () => {
  const seenByGut = [];
  const m = scriptedModel({ gut: { allowed: true, guess: 'true', confidence: 'high', reason: '听起来对' } });
  const wrapped = async (system, content, o) => { if (system.startsWith('你是“有据事务所”的探长')) seenByGut.push(String(content)); return m(system, content, o); };
  const r = await investigate({ claim: '这是一个公开科学说法吗', userBet: 'false' }, () => {}, { env, searchFn: searchOnce(), modelFn: wrapped });
  assert.equal(r.verdict, 'refuted');
  assert.equal(seenByGut.length, 1);
  assert.equal(seenByGut[0], '这是一个公开科学说法吗');   // the claim only: no sources, no search results
  assert.equal(r.gut.guess, 'true');
  assert.equal(r.gut.outcome, 'overturned');
  assert.equal(r.userBet.guess, 'false');
  assert.equal(r.userBet.outcome, 'confirmed');
});

test('a planner that sets allowed:false because the claim looks false does not block the case', async () => {
  const base = scriptedModel();
  const m = async (system, content, o) => system.startsWith('将待核验命题') ? { allowed: false, reason: '无权威证据支持，蜂蜜含糖量高', timeSensitive: false, queries: ['a', 'b', 'c'] } : base(system, content, o);
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: m });
  assert.equal(r.verdict, 'refuted');
});

test('a planner that refuses for a political or private-person reason still blocks the case before any search', async () => {
  const base = scriptedModel(); let searched = 0;
  const m = async (system, content, o) => system.startsWith('将待核验命题') ? { allowed: false, reason: '涉及政府官员的时政消息' } : base(system, content, o);
  await assert.rejects(() => investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: async () => { searched++; return { sources: [], requestId: 'r' }; }, modelFn: m }), /时政或个人/);
  assert.equal(searched, 0);
});

test('a failing gut call means no bet, never a failed investigation', async () => {
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: scriptedModel({ gutFails: true }) });
  assert.equal(r.verdict, 'refuted');
  assert.equal(r.gut, null);
  assert.equal(r.userBet, null);
});

test('events after the investigation ends are dropped', async () => {
  const events = [];
  let release;
  const slowGut = new Promise(r => { release = r; });
  const base = scriptedModel();
  const m = async (system, content, o) => system.startsWith('你是“有据事务所”的探长') ? (await slowGut, base(system, content, o)) : base(system, content, o);
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, e => events.push(e.stage), { env, searchFn: searchOnce(), modelFn: m });
  const before = events.length;
  release();
  await new Promise(res => setTimeout(res, 20));
  assert.equal(events.length, before);
  assert.equal(r.gut, null);   // it arrived after the verdict, so it is not a bet
});

test('sources carry tier labels, origin groups, and cacheability follows the model answer only', async () => {
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: scriptedModel() });
  assert.equal(r.sources.find(s => s.host === 'nasa.gov').tier, 'official');
  assert.ok(r.sources.every(s => s.originId));
  assert.equal(r.timeSensitive, false);
  // a model that omits the flag => time-sensitive (not cacheable)
  const m = async (system, c) => system.startsWith('将待核验命题') ? { allowed: true, queries: ['a', 'b'] } : { verdict: 'unknown', summary: '', evidence: [] };
  const r2 = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: m });
  assert.equal(r2.timeSensitive, true);
});

test('captain notes are bounded, string-only and tag-stripped; failed review yields none', async () => {
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: scriptedModel() });
  assert.deepEqual(r.captainNotes, ['证据来自两个机构', '注意条件']);
  let n = 0;
  const m = scriptedModel();
  const failing = async (s, c, o) => { if (s.includes('独立复核')) throw new Error('down'); return m(s, c, o); };
  const bad = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: failing });
  assert.equal(bad.reviewStatus, 'failed');
  assert.deepEqual(bad.captainNotes, []);
});

test('full-text verification annotates evidence, rewrites the summary-only limitation, and never changes the verdict', async () => {
  const verifyFn = async (evidence) => evidence.map((e, i) => ({ ...e, check: i === 0 ? 'verified' : 'fetch-failed', ...(i ? { checkNote: 'HTTP 403' } : {}) }));
  const events = [];
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, e => events.push(e), { env, searchFn: searchOnce(), modelFn: scriptedModel(), verifyFn });
  assert.equal(r.verdict, 'refuted');
  assert.equal(r.fullTextChecked, true);
  assert.deepEqual(r.evidence.map(e => e.check), ['verified', 'fetch-failed']);
  assert.ok(r.limitations.some(x => x.startsWith('原文核对：1 条')));
  assert.ok(!r.limitations.some(x => x.includes('未抓取原始网页全文')));
  assert.ok(events.some(e => e.stage === 'verify'));
});

test('a throwing verifier degrades to summary-only without failing the investigation', async () => {
  const r = await investigate({ claim: '这是一个公开科学说法吗' }, () => {}, { env, searchFn: searchOnce(), modelFn: scriptedModel(), verifyFn: async () => { throw new Error('dns'); } });
  assert.equal(r.verdict, 'refuted');
  assert.equal(r.fullTextChecked, false);
  assert.ok(r.limitations.some(x => x.includes('未抓取原始网页全文')));
});

test('198.18/15 benchmark range stays blocked by default; the dev-only switch is ignored in production', () => {
  const keep = { f: process.env.EB_ALLOW_FAKE_IP, v: process.env.VERCEL, n: process.env.NODE_ENV };
  try {
    delete process.env.EB_ALLOW_FAKE_IP; delete process.env.VERCEL; delete process.env.NODE_ENV;
    assert.equal(isPublicIp('198.18.10.226'), false);
    process.env.EB_ALLOW_FAKE_IP = '1';
    assert.equal(isPublicIp('198.18.10.226'), true);
    assert.equal(isPublicIp('10.0.0.1'), false);           // other private ranges are never relaxed
    assert.equal(isPublicIp('169.254.169.254'), false);
    process.env.VERCEL = '1';
    assert.equal(isPublicIp('198.18.10.226'), false);
    delete process.env.VERCEL; process.env.NODE_ENV = 'production';
    assert.equal(isPublicIp('198.18.10.226'), false);
  } finally {
    for (const [k, v] of [['EB_ALLOW_FAKE_IP', keep.f], ['VERCEL', keep.v], ['NODE_ENV', keep.n]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
