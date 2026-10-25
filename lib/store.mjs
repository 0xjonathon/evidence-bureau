// Storage layer. Uses Upstash Redis over REST when configured, otherwise an
// in-memory Map so local development and tests need no external service.
// The in-memory fallback is per-process: on serverless it does NOT persist,
// so `storeKind()` is surfaced in /api/status instead of pretending otherwise.
import {createHash, randomBytes} from 'node:crypto';

const restConfig = env => {
  // UPSTASH_* is documented by Upstash. KV_REST_API_* is the name Vercel's
  // integration is commonly reported to inject; it is accepted but unverified.
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? {url: url.replace(/\/$/, ''), token} : null;
};

// Order: Upstash Redis (atomic, preferred when configured) -> EdgeOne Blob (zero setup on EdgeOne Pages) -> memory.
// `blobFactory` is `getStore` from @edgeone/pages-blob; it is injected so this module has no hard dependency on it.
export function createStore(env = process.env, fetchImpl = globalThis.fetch, {blobFactory} = {}) {
  const rest = restConfig(env);
  if (rest) return restStore(rest, fetchImpl);
  if (blobFactory) return blobStore(blobFactory);
  return memoryStore();
}

function restStore({url, token}, fetchImpl) {
  async function command(args) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000),
      });
    } catch { throw new Error('存储服务连接失败或超时。'); }
    let data;
    try { data = await res.json(); } catch { throw new Error('存储服务没有返回有效 JSON。'); }
    if (!res.ok || data.error) throw new Error('存储服务请求失败。');
    return data.result;
  }
  return {
    kind: 'redis',
    atomic: true,
    async get(key) { const v = await command(['GET', key]); return v == null ? null : JSON.parse(v); },
    async set(key, value, ttlSeconds) {
      const args = ['SET', key, JSON.stringify(value)];
      if (ttlSeconds) args.push('EX', ttlSeconds);
      await command(args);
    },
    async del(key) { await command(['DEL', key]); },
    // INCR then set expiry only when the key is new, so a window cannot be extended by traffic.
    async incr(key, ttlSeconds) {
      const n = await command(['INCR', key]);
      if (n === 1 && ttlSeconds) await command(['EXPIRE', key, ttlSeconds]);
      return n;
    },
    async push(key, value, max = 100) {
      await command(['LPUSH', key, JSON.stringify(value)]);
      await command(['LTRIM', key, 0, max - 1]);
    },
    async list(key, count = 50) {
      const rows = await command(['LRANGE', key, 0, count - 1]);
      return (rows || []).map(r => JSON.parse(r));
    },
    // Ledger counters: atomic add that returns the new total. Used for quotas, which can also be refunded.
    async ledgerAdd(key, delta, ttlSeconds) {
      const n = await command(['INCRBY', key, delta]);
      if (ttlSeconds) await command(['EXPIRE', key, ttlSeconds]);
      return n;
    },
    async ledgerSum(key) { return Number(await command(['GET', key])) || 0; },
    // Keys that start with `prefix` (small data sets only: this walks the keyspace with SCAN).
    async keys(prefix) {
      const out = []; let cursor = '0';
      do {
        const [next, batch] = await command(['SCAN', cursor, 'MATCH', prefix.replace(/[\\*?[\]]/g, '\\$&') + '*', 'COUNT', 200]);
        cursor = String(next); out.push(...(batch || []));
      } while (cursor !== '0' && out.length < 5000);
      return out;
    },
  };
}

function memoryStore() {
  const data = new Map(); // key -> {value, expires}
  const live = key => {
    const row = data.get(key);
    if (!row) return null;
    if (row.expires && row.expires <= Date.now()) { data.delete(key); return null; }
    return row;
  };
  return {
    kind: 'memory',
    atomic: true,
    async get(key) { const r = live(key); return r ? structuredClone(r.value) : null; },
    async set(key, value, ttlSeconds) {
      data.set(key, {value: structuredClone(value), expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0});
    },
    async del(key) { data.delete(key); },
    async incr(key, ttlSeconds) {
      const r = live(key);
      const n = (r ? r.value : 0) + 1;
      data.set(key, {value: n, expires: r ? r.expires : (ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0)});
      return n;
    },
    async push(key, value, max = 100) {
      const r = live(key);
      const list = r ? r.value : [];
      list.unshift(structuredClone(value));
      data.set(key, {value: list.slice(0, max), expires: 0});
    },
    async list(key, count = 50) { const r = live(key); return r ? structuredClone(r.value.slice(0, count)) : []; },
    async ledgerAdd(key, delta, ttlSeconds) {
      const r = live(key);
      const n = (r ? r.value : 0) + delta;
      data.set(key, {value: n, expires: r ? r.expires : (ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0)});
      return n;
    },
    async ledgerSum(key) { const r = live(key); return r ? r.value : 0; },
    async keys(prefix) { return [...data.keys()].filter(k => k.startsWith(prefix) && live(k)); },
  };
}

// EdgeOne Pages Blob: durable, but with no atomic operations (5 parallel read-modify-writes kept only 2 updates in a
// live probe). So nothing here is read-modify-write. Plain values are written whole; counters are one tiny object per
// event whose delta is part of the key, summed by prefix; lists are one object per entry, newest first by key order.
function blobStore(getStore) {
  const blob = getStore('eb-store');
  const STRONG = {type: 'json', consistency: 'strong'};
  const stamp = () => Date.now().toString(36) + '-' + randomBytes(4).toString('hex');
  const keysOf = async prefix => ((await blob.list({prefix, consistency: 'strong'}))?.blobs || []).map(b => b.key);
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length); let next = 0;
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
    return out;
  }
  async function ledgerSum(key) {
    let sum = 0;
    for (const k of await keysOf(`led/${key}/`)) { const m = /-([pm])(\d+)$/.exec(k); if (m) sum += (m[1] === 'p' ? 1 : -1) * Number(m[2]); }
    return sum;
  }
  async function ledgerAdd(key, delta) {
    const d = Math.trunc(delta);
    await blob.set(`led/${key}/${stamp()}-${d < 0 ? 'm' : 'p'}${Math.abs(d)}`, '1');
    return ledgerSum(key);
  }
  return {
    kind: 'blob',
    atomic: false,
    async get(key) { const row = await blob.get('kv/' + key, STRONG); return row && (!row.e || row.e > Date.now()) ? row.v : null; },
    async set(key, value, ttlSeconds) { await blob.setJSON('kv/' + key, {v: value, e: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0}); },
    async del(key) { await blob.delete('kv/' + key); },
    async keys(prefix) { return (await keysOf('kv/' + prefix)).map(k => k.slice(3)); },
    incr: (key) => ledgerAdd(key, 1),
    ledgerAdd, ledgerSum,
    async push(key, value, max = 100) {
      await blob.setJSON(`lst/${key}/${String(9e12 - Date.now()).padStart(13, '0')}-${randomBytes(3).toString('hex')}`, value);
      const keys = (await keysOf(`lst/${key}/`)).sort();
      await Promise.all(keys.slice(max).map(k => blob.delete(k).catch(() => {})));
    },
    async list(key, count = 50) {
      const keys = (await keysOf(`lst/${key}/`)).sort().slice(0, count);
      return (await mapLimit(keys, 12, k => blob.get(k, STRONG))).filter(row => row != null);
    },
  };
}

// Agent tokens are random bearer secrets held in the browser. Only a hash is stored server-side.
export const newToken = () => randomBytes(24).toString('base64url');
export const validToken = t => typeof t === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(t);
export const hashToken = t => createHash('sha256').update(t).digest('hex').slice(0, 32);
export const hashClaim = text => createHash('sha256').update(String(text).trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 32);
