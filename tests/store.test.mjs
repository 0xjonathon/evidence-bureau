import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore, newToken, validToken, hashToken, hashClaim} from '../lib/store.mjs';
import {checkRate, reserveSearches, refundSearches, quotaSnapshot, LIMITS} from '../lib/quota.mjs';

test('memory store round-trips values, expires them, and clones on read', async () => {
  const s = createStore({});
  assert.equal(s.kind, 'memory');
  await s.set('a', {x: 1});
  const got = await s.get('a');
  got.x = 99;
  assert.deepEqual(await s.get('a'), {x: 1});
  await s.set('b', 1, 1);
  const realNow = Date.now;
  Date.now = () => realNow() + 2000;
  try { assert.equal(await s.get('b'), null); } finally { Date.now = realNow; }
});

test('incr keeps the first expiry instead of extending the window', async () => {
  const s = createStore({});
  assert.equal(await s.incr('k', 60), 1);
  assert.equal(await s.incr('k', 60), 2);
  assert.equal(await s.incr('k', 60), 3);
});

test('list push keeps newest first and trims to max', async () => {
  const s = createStore({});
  for (let i = 0; i < 5; i++) await s.push('l', {i}, 3);
  assert.deepEqual((await s.list('l')).map(x => x.i), [4, 3, 2]);
});

test('redis store is selected from either env naming and sends commands as JSON arrays', async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push({url, body: JSON.parse(init.body), auth: init.headers.Authorization}); return {ok: true, json: async () => ({result: '{"v":1}'})}; };
  for (const env of [{UPSTASH_REDIS_REST_URL: 'https://r.test/', UPSTASH_REDIS_REST_TOKEN: 't'}, {KV_REST_API_URL: 'https://r.test', KV_REST_API_TOKEN: 't'}]) {
    const s = createStore(env, fake);
    assert.equal(s.kind, 'redis');
    assert.deepEqual(await s.get('k'), {v: 1});
  }
  assert.equal(calls[0].url, 'https://r.test');
  assert.deepEqual(calls[0].body, ['GET', 'k']);
  assert.equal(calls[0].auth, 'Bearer t');
});

test('redis errors surface as failures, not silent nulls', async () => {
  const s = createStore({UPSTASH_REDIS_REST_URL: 'https://r.test', UPSTASH_REDIS_REST_TOKEN: 't'}, async () => ({ok: true, json: async () => ({error: 'ERR'})}));
  await assert.rejects(() => s.get('k'), /存储服务/);
});

test('tokens are random, validated, and hashed deterministically', () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a, b);
  assert.ok(validToken(a));
  assert.ok(!validToken('short'));
  assert.ok(!validToken('has spaces and symbols !!!!!!!!!!!!!!!!!!'));
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
  assert.equal(hashClaim('  月球 背面  '), hashClaim('月球 背面'));
});

test('rate limit blocks the request after the per-minute cap', async () => {
  const s = createStore({});
  for (let i = 0; i < LIMITS.perMinute; i++) await checkRate(s, 'ip1');
  await assert.rejects(() => checkRate(s, 'ip1'), /太频繁/);
  await checkRate(s, 'ip2');
});

test('search reservation enforces the daily agent cap and refunds unused searches', async () => {
  const s = createStore({});
  const limits = {...LIMITS, perAgentPerDay: 2, monthlySearchBudget: 100};
  const r1 = await reserveSearches(s, 'agent', 6, limits);
  assert.equal((await quotaSnapshot(s, limits)).used, 6);
  await refundSearches(s, r1, 3);
  assert.equal((await quotaSnapshot(s, limits)).used, 3);
  await reserveSearches(s, 'agent', 3, limits);
  await assert.rejects(() => reserveSearches(s, 'agent', 1, limits), /今天的调查次数/);
});

test('monthly budget exhaustion rejects without leaking the reservation', async () => {
  const s = createStore({});
  const limits = {...LIMITS, perAgentPerDay: 50, monthlySearchBudget: 10};
  await reserveSearches(s, 'a1', 6, limits);
  await assert.rejects(() => reserveSearches(s, 'a2', 6, limits), /额度已用完/);
  assert.equal((await quotaSnapshot(s, limits)).used, 6);
  await reserveSearches(s, 'a3', 4, limits);
  assert.equal((await quotaSnapshot(s, limits)).exhausted, true);
});
