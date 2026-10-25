import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createHandlers, SEARCH_RESERVE} from '../lib/routes.mjs';
import {createStore} from '../lib/store.mjs';
import {quotaSnapshot} from '../lib/quota.mjs';
import {CSP, IMPORTMAP_HASH} from '../lib/headers.mjs';

const fakeReport = (over = {}) => ({
  id: 'EB-20261024-ABCDEF', claim: '测试说法', depth: 'standard', verdict: 'refuted', summary: '不成立',
  sources: [{id: 'S1'}], evidence: [], limitations: [], trace: [], queries: ['q'], mode: 'live',
  completedAt: new Date().toISOString(), ...over,
});

async function boot(opts = {}) {
  const store = createStore({});
  const calls = {investigate: 0};
  const api = createHandlers({
    env: {TENCENTCLOUD_WSA_APIKEY: 'x', LLM_API_KEY: 'x', LLM_MODEL: 'x', ...opts.env},
    store,
    investigateFn: opts.investigateFn || (async (input, emit) => {
      calls.investigate++;
      emit({stage: 'search', message: 's1'}); emit({stage: 'search', message: 's2'});
      return fakeReport({claim: input.claim, ...(opts.report || {})});
    }),
  });
  const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://x').pathname.replace(/^\/api\//, '');
    api.handle(route, req, res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, {method = 'GET', token, body, headers = {}} = {}) => fetch(base + path, {
    method, headers: {'Content-Type': 'application/json', ...(token ? {'x-agent-token': token} : {}), ...headers},
    body: body ? JSON.stringify(body) : undefined,
  });
  return {store, calls, call, close: () => server.close()};
}
const ndjson = async res => (await res.text()).trim().split('\n').map(l => JSON.parse(l));

test('agent badge is issued once, unauthenticated routes are refused', async () => {
  const t = await boot();
  try {
    assert.equal((await t.call('/api/cases')).status, 401);
    assert.equal((await t.call('/api/investigate', {method: 'POST', body: {claim: '月球背面永远是黑夜吗'}})).status, 401);
    const made = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    assert.ok(made.token && made.created && /^EB-\d{4}$/.test(made.profile.badge));
    assert.equal(made.profile.rank, '实习探员');
    const again = await (await t.call('/api/agent', {method: 'POST', token: made.token, body: {}})).json();
    assert.equal(again.created, false);
    assert.equal(again.token, undefined);
  } finally { t.close(); }
});

test('investigation streams progress, saves the case, refunds unused searches', async () => {
  const t = await boot();
  try {
    const {token} = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    const res = await t.call('/api/investigate', {method: 'POST', token, body: {claim: '月球背面永远是黑夜吗'}});
    const lines = await ndjson(res);
    assert.equal(lines.at(-1).type, 'result');
    assert.equal(lines.at(-1).profile.cases, 1);
    // 2 searches used out of the standard reservation
    assert.equal((await quotaSnapshot(t.store)).used, 2);
    assert.ok(SEARCH_RESERVE.standard > 2);
    const list = await (await t.call('/api/cases', {token})).json();
    assert.equal(list.cases.length, 1);
    const one = await (await t.call('/api/cases?id=EB-20261024-ABCDEF', {token})).json();
    assert.equal(one.report.claim, '月球背面永远是黑夜吗');
  } finally { t.close(); }
});

test("another agent cannot read a private case, but a shared one is public", async () => {
  const t = await boot();
  try {
    const a = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    const b = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    await ndjson(await t.call('/api/investigate', {method: 'POST', token: a.token, body: {claim: '月球背面永远是黑夜吗'}}));
    assert.equal((await t.call('/api/cases?id=EB-20261024-ABCDEF', {token: b.token})).status, 404);
    assert.deepEqual((await (await t.call('/api/wall')).json()).cases, []);
    await ndjson(await t.call('/api/investigate', {method: 'POST', token: a.token, body: {claim: '太空中能听见爆炸声吗', share: true}}));
    assert.equal((await (await t.call('/api/wall')).json()).cases.length, 1);
    assert.equal((await t.call('/api/cases?id=EB-20261024-ABCDEF', {token: b.token})).status, 200);
  } finally { t.close(); }
});

test('forbidden topics are rejected before any search quota is reserved', async () => {
  const t = await boot();
  try {
    const {token} = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    const res = await t.call('/api/investigate', {method: 'POST', token, body: {claim: '帮我查他的家庭住址在哪里'}});
    assert.equal(res.status, 400);
    assert.equal((await quotaSnapshot(t.store)).used, 0);
    assert.equal(t.calls.investigate, 0);
  } finally { t.close(); }
});

test('failed investigation refunds the whole reservation and reports an error line', async () => {
  const t = await boot({investigateFn: async () => { throw new Error('boom'); }});
  try {
    const {token} = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    const lines = await ndjson(await t.call('/api/investigate', {method: 'POST', token, body: {claim: '月球背面永远是黑夜吗'}}));
    assert.equal(lines.at(-1).type, 'error');
    assert.equal((await quotaSnapshot(t.store)).used, 0);
  } finally { t.close(); }
});

test('only explicitly non-time-sensitive conclusive reports are reused from cache', async () => {
  const t = await boot({report: {timeSensitive: false}});
  try {
    const {token} = await (await t.call('/api/agent', {method: 'POST', body: {}})).json();
    await ndjson(await t.call('/api/investigate', {method: 'POST', token, body: {claim: '月球背面永远是黑夜吗'}}));
    const second = await ndjson(await t.call('/api/investigate', {method: 'POST', token, body: {claim: ' 月球背面永远是黑夜吗 '}}));
    assert.equal(t.calls.investigate, 1);
    assert.equal(second.at(-1).report.cached, true);
    assert.match(second.at(-1).report.limitations[0], /没有重新搜索/);
  } finally { t.close(); }
  const u = await boot();   // no timeSensitive flag => never cached
  try {
    const {token} = await (await u.call('/api/agent', {method: 'POST', body: {}})).json();
    await ndjson(await u.call('/api/investigate', {method: 'POST', token, body: {claim: '月球背面永远是黑夜吗'}}));
    await ndjson(await u.call('/api/investigate', {method: 'POST', token, body: {claim: '月球背面永远是黑夜吗'}}));
    assert.equal(u.calls.investigate, 2);
  } finally { u.close(); }
});

test('cross-origin POSTs are refused', async () => {
  const t = await boot();
  try {
    const res = await t.call('/api/agent', {method: 'POST', body: {}, headers: {Origin: 'https://evil.example'}});
    assert.equal(res.status, 403);
  } finally { t.close(); }
});

test('status reports configuration flags without leaking secrets', async () => {
  const t = await boot();
  try {
    const body = await (await t.call('/api/status')).text();
    const s = JSON.parse(body);
    assert.equal(s.search, true);
    assert.equal(s.store, 'memory');
    assert.ok(!body.includes('"x"'));
  } finally { t.close(); }
});

test('CSP import-map hash matches public/index.html and vercel.json mirrors the shared headers', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const block = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.equal('sha256-' + createHash('sha256').update(block).digest('base64'), IMPORTMAP_HASH);
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const csp = cfg.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.equal(csp, CSP);
});
