import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createStore} from '../lib/store.mjs';
import {compareReports, createWatch, confirmWatch, removeWatch, listWatches, runDueWatches, WATCH_LIMITS} from '../lib/watch.mjs';
import {validEmail, esc, sendMail, mailConfigured} from '../lib/mail.mjs';
import {createHandlers} from '../lib/routes.mjs';

const mailEnv = {RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.test'};
const sent = [];
const fakeFetch = async (url, init) => { sent.push({url, body: JSON.parse(init.body)}); return {ok: true, status: 200}; };
const agent = {hash: 'agent1'};
const report = { id: 'EB-20261024-ABCDEF', claim: '某演唱会第二场已开票吗', verdict: 'unknown' };

test('compareReports emails only for real verdict changes, never for noise', () => {
  assert.deepEqual(compareReports('refuted', {verdict: 'refuted'}), {notify: false, kind: 'unchanged'});
  assert.equal(compareReports('unknown', {verdict: 'supported'}).notify, true);
  assert.equal(compareReports('supported', {verdict: 'refuted'}).notify, true);
  assert.equal(compareReports('mixed', {verdict: 'supported'}).notify, true);
  assert.deepEqual(compareReports('supported', {verdict: 'unknown'}), {notify: false, kind: 'became-unknown'});
  assert.equal(compareReports('supported', null).notify, false);
});

test('email helpers validate addresses and escape HTML', () => {
  assert.ok(validEmail('a@b.co'));
  for (const bad of ['', 'a', 'a@b', 'a b@c.com', 'a@b.c', '<x>@b.com', 'a@b.com,c@d.com', 'x'.repeat(130) + '@b.com', null]) assert.ok(!validEmail(bad), String(bad));
  assert.equal(esc('<img src=x onerror="1">&\''), '&lt;img src=x onerror=&quot;1&quot;&gt;&amp;&#39;');
  assert.equal(mailConfigured({}), false);
});

test('sendMail refuses when unconfigured and reports upstream failures plainly', async () => {
  await assert.rejects(() => sendMail({to: 'a@b.co', subject: 's', html: 'h'}, {env: {}}), /尚未配置/);
  await assert.rejects(() => sendMail({to: 'bad', subject: 's', html: 'h'}, {env: mailEnv, fetchImpl: fakeFetch}), /格式/);
  await assert.rejects(() => sendMail({to: 'a@b.co', subject: 's', html: 'h'}, {env: mailEnv, fetchImpl: async () => ({ok: false, status: 403})}), /HTTP 403/);
});

test('a watch is stored only after the confirmation email is accepted', async () => {
  const store = createStore({});
  await assert.rejects(() => createWatch(store, agent, {caseId: report.id, email: 'me@x.co', report}, {env: {}, baseUrl: 'https://eb.test'}), /尚未配置/);
  assert.deepEqual(await listWatches(store, agent), []);
  sent.length = 0;
  const w = await createWatch(store, agent, {caseId: report.id, email: 'me@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
  assert.equal(w.status, 'pending');
  assert.equal(w.email, 'm***@x.co');
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.html, /api\/watch\?confirm=W-[0-9A-F]{10}\./);
  assert.equal((await listWatches(store, agent)).length, 1);
});

test('confirm and unsubscribe links need the right token; unsubscribe deletes the record and email', async () => {
  const store = createStore({});
  sent.length = 0;
  const w = await createWatch(store, agent, {caseId: report.id, email: 'me@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
  const raw = await store.get(`watch:${w.id}`);
  assert.equal(await confirmWatch(store, `${w.id}.wrong`), false);
  assert.equal((await store.get(`watch:${w.id}`)).status, 'pending');
  assert.equal(await confirmWatch(store, `${w.id}.${raw.confirmToken}`), true);
  assert.equal((await store.get(`watch:${w.id}`)).status, 'active');
  assert.equal(await removeWatch(store, `${w.id}.${raw.confirmToken}`), false);   // confirm token cannot unsubscribe
  assert.equal(await removeWatch(store, `${w.id}.${raw.unsubToken}`), true);
  assert.equal(await store.get(`watch:${w.id}`), null);
  assert.deepEqual(await listWatches(store, agent), []);
  assert.equal(await removeWatch(store, 'garbage'), false);
});

test('each agent can hold only a few watches', async () => {
  const store = createStore({});
  for (let i = 0; i < WATCH_LIMITS.perAgent; i++) await createWatch(store, agent, {caseId: report.id, email: 'me@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
  await assert.rejects(() => createWatch(store, agent, {caseId: report.id, email: 'me@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch}), /最多同时盯/);
  await createWatch(store, {hash: 'someone-else'}, {caseId: report.id, email: 'o@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
});

async function activeWatch(store, verdict = 'unknown') {
  const w = await createWatch(store, agent, {caseId: report.id, email: 'me@x.co', report: {...report, verdict}}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
  const raw = await store.get(`watch:${w.id}`);
  await confirmWatch(store, `${w.id}.${raw.confirmToken}`);
  return w.id;
}
// Each scheduled pass in these tests happens "a day later": every watch's last check is moved back first, because a
// watch checked in the last 20 hours is (correctly) skipped. Tests of that rule pass `age: false`.
const run = async (store, verdict, {age = true, ...extra} = {}) => {
  if (age) for (const key of await store.keys('watch:')) { const w = await store.get(key); if (w?.lastCheckedAt) await store.set(key, {...w, lastCheckedAt: new Date(Date.now() - 25 * 3600e3).toISOString()}); }
  return runDueWatches(store, {
    investigateFn: async () => { if (verdict === 'throw') throw new Error('search down'); return {verdict, summary: '新的结论摘要'}; },
    env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch, ...extra,
  });
};

test('a watch without an email is live at once and is told about in the page, not by mail', async () => {
  const store = createStore({});
  const w = await createWatch(store, agent, {caseId: report.id, email: '', report: {...report, verdict: 'unknown'}}, {env: {}, baseUrl: 'https://eb.test'});
  assert.equal(w.status, 'active'); assert.equal(w.email, '');
  sent.length = 0;
  const [r] = await run(store, 'refuted');
  assert.equal(r.kind, 'became-conclusive'); assert.equal(r.mailed, false); assert.equal(sent.length, 0);
  assert.equal((await listWatches(store, agent))[0].unseen, 1);
  assert.equal((await listWatches(store, agent))[0].lastVerdict, 'refuted');
  const { markSeen } = await import('../lib/watch.mjs');
  await markSeen(store, agent);
  assert.equal((await listWatches(store, agent))[0].unseen, 0);
});

test('a watch checked in the last 20 hours is skipped, so repeated calls to the schedule URL cost nothing', async () => {
  const store = createStore({}); await activeWatch(store, 'unknown');
  assert.equal((await run(store, 'refuted', {age: false})).length, 1);
  let searched = 0;
  const again = await runDueWatches(store, {investigateFn: async () => { searched++; return {verdict: 'refuted'}; }, env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
  assert.deepEqual(again, []); assert.equal(searched, 0);
  assert.equal((await runDueWatches(store, {investigateFn: async () => { searched++; return {verdict: 'refuted'}; }, env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch, force: true})).length, 1);
});

test('scheduled run: a real change sends one email and moves the baseline', async () => {
  const store = createStore({}); const id = await activeWatch(store, 'unknown'); sent.length = 0;
  const [r] = await run(store, 'refuted');
  assert.equal(r.kind, 'became-conclusive'); assert.equal(r.mailed, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.subject, /被反驳/);
  assert.match(sent[0].body.html, /api\/watch\?unsub=/);
  assert.equal((await store.get(`watch:${id}`)).lastVerdict, 'refuted');
  sent.length = 0;
  const [again] = await run(store, 'refuted');
  assert.equal(again.kind, 'unchanged'); assert.equal(sent.length, 0);
});

test('scheduled run: failed checks and flaky "unknown" drops never email or move the baseline', async () => {
  const store = createStore({}); const id = await activeWatch(store, 'supported'); sent.length = 0;
  assert.equal((await run(store, 'throw'))[0].kind, 'check-failed');
  assert.equal((await run(store, 'unknown'))[0].kind, 'became-unknown');
  assert.equal(sent.length, 0);
  assert.equal((await store.get(`watch:${id}`)).lastVerdict, 'supported');
  assert.equal((await run(store, 'supported'))[0].kind, 'unchanged');   // back to normal: still no email
  assert.equal(sent.length, 0);
});

test('scheduled run: a failed email keeps the baseline so the change is retried next time', async () => {
  const store = createStore({}); const id = await activeWatch(store, 'unknown');
  const down = async () => ({ok: false, status: 500});
  const [r] = await run(store, 'supported', {fetchImpl: down});
  assert.match(r.kind, /mail-failed/); assert.equal(r.mailed, false);
  assert.equal((await store.get(`watch:${id}`)).lastVerdict, 'unknown');
  sent.length = 0;
  assert.equal((await run(store, 'supported'))[0].mailed, true);
});

test('scheduled run: pending watches are skipped, work is capped, oldest-checked goes first', async () => {
  const store = createStore({});
  const other = {hash: 'other'};
  const pending = await createWatch(store, other, {caseId: report.id, email: 'p@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch});
  assert.deepEqual(await run(store, 'supported'), []);
  const ids = [];
  for (let i = 0; i < 5; i++) { const a = {hash: 'a' + i}; const w = await createWatch(store, a, {caseId: report.id, email: 'q@x.co', report}, {env: mailEnv, baseUrl: 'https://eb.test', fetchImpl: fakeFetch}); const raw = await store.get(`watch:${w.id}`); await confirmWatch(store, `${w.id}.${raw.confirmToken}`); ids.push(w.id); }
  const first = await run(store, 'unknown');
  assert.equal(first.length, WATCH_LIMITS.perRun);
  const second = await run(store, 'unknown');
  assert.equal(second.length, WATCH_LIMITS.perRun);
  assert.equal(new Set([...first, ...second].map(x => x.id)).size, 5);   // rotation reached everyone
  assert.equal((await store.get(`watch:${pending.id}`)).status, 'pending');
});

async function boot(env) {
  const store = createStore({});
  const api = createHandlers({env, store, investigateFn: async () => ({verdict: 'refuted', summary: 's'})});
  const server = http.createServer((req, res) => api.handle(new URL(req.url, 'http://x').pathname.replace(/^\/api\//, ''), req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {store, base, close: () => server.close(), call: (p, init = {}) => fetch(base + p, {...init, headers: {'Content-Type': 'application/json', ...(init.headers || {})}})};
}

test('cron route is disabled without a secret and rejects wrong or missing credentials', async () => {
  for (const env of [{}, {CRON_SECRET: 's3cret-value'}]) {
    const t = await boot(env);
    try {
      assert.equal((await t.call('/api/cron-watch')).status, 401);
      assert.equal((await t.call('/api/cron-watch', {headers: {Authorization: 'Bearer nope'}})).status, 401);
      assert.equal((await t.call('/api/cron-watch', {headers: {Authorization: 'Bearer '}})).status, 401);
    } finally { t.close(); }
  }
  const t = await boot({CRON_SECRET: 's3cret-value'});
  try {
    const ok = await t.call('/api/cron-watch', {headers: {Authorization: 'Bearer s3cret-value'}});
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).checked, 0);
  } finally { t.close(); }
});

test('watch route: requires a badge, refuses unconfigured mail, and email links work without one', async () => {
  const t = await boot({});
  try {
    assert.equal((await t.call('/api/watch')).status, 401);
    const made = await (await t.call('/api/agent', {method: 'POST', body: '{}'})).json();
    const h = {'x-agent-token': made.token};
    const none = await t.call('/api/watch', {method: 'POST', headers: h, body: JSON.stringify({caseId: 'EB-20261024-ABCDEF', email: 'a@b.co'})});
    assert.equal(none.status, 404);
    const bad = await t.call('/api/watch?confirm=W-0000000000.x');
    assert.equal(bad.status, 200);
    assert.match(await bad.text(), /链接无效/);
    assert.equal((await t.call('/api/watch', {headers: h})).status, 200);
  } finally { t.close(); }
});
