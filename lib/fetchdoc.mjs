// Fetches the full text of a cited source so quotes can be checked against the real page.
// Security: the URL comes from search results, i.e. it is attacker-influenced. Every hop is
// validated: http/https only, no credentials, standard ports, and the hostname must resolve
// only to public addresses. Redirects are followed manually and re-validated. Size and time are capped.
import dns from 'node:dns/promises';
import net from 'node:net';

export const LIMITS = {bytes: 600_000, ms: 6000, redirects: 3};

// Local proxies (Clash/Surge "fake-ip" mode) answer every lookup with 198.18.0.0/15. That range is
// reserved for benchmarking and is blocked by default. Set EB_ALLOW_FAKE_IP=1 ONLY on a developer
// machine that uses such a proxy; the proxy itself then does the real resolution. Never set it in production.
const fakeIpAllowed = () => process.env.EB_ALLOW_FAKE_IP === '1' && process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production';

export function isPublicIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;       // CGNAT
    if (a === 169 && b === 254) return false;                 // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return fakeIpAllowed();   // benchmarking (blocked unless dev fake-IP proxy)
    if (a >= 224) return false;                               // multicast, reserved, broadcast
    return true;
  }
  if (family === 6) {
    const v = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicIp(mapped[1]);
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v)) return false;                       // unique local fc00::/7
    if (/^fe[89ab]/.test(v)) return false;                    // link-local fe80::/10
    if (/^ff/.test(v)) return false;                          // multicast
    if (v.startsWith('64:ff9b:')) return false;               // NAT64 can reach IPv4 internals
    if (v.startsWith('2001:db8')) return false;              // documentation
    return true;
  }
  return false;
}

export async function assertPublicUrl(raw, lookup = dns.lookup) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('链接无效'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('只允许 http/https');
  if (u.username || u.password) throw new Error('链接含凭据');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('端口不允许');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('主机不允许');
  if (net.isIP(host)) { if (!isPublicIp(host)) throw new Error('地址不允许'); return u; }
  let records;
  try { records = await lookup(host, {all: true}); } catch { throw new Error('域名无法解析'); }
  if (!records.length || !records.every(r => isPublicIp(r.address))) throw new Error('域名解析到非公网地址');
  return u;
}

const stripHtml = html => html
  .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

async function readCapped(response, maxBytes) {
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { chunks.push(value.subarray(0, value.length - (size - maxBytes))); await reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Note: DNS is resolved here for validation and again by fetch(), so a DNS-rebinding race is
// theoretically possible. Public-IP checks plus no credentials/cookies keep the blast radius small;
// a hardened deployment should fetch through an egress proxy.
export async function fetchDocument(url, {fetchImpl = globalThis.fetch, lookup = dns.lookup, limits = LIMITS, signal} = {}) {
  let current = url;
  for (let hop = 0; hop <= limits.redirects; hop++) {
    const u = await assertPublicUrl(current, lookup);
    const timeout = AbortSignal.timeout(limits.ms);
    const res = await fetchImpl(u.href, {
      redirect: 'manual', credentials: 'omit',
      headers: {'User-Agent': 'EvidenceBureauBot/2.0 (fact-check research)', Accept: 'text/html,text/plain;q=0.9'},
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const next = res.headers.get('location');
      if (!next) throw new Error('重定向缺少目标');
      current = new URL(next, u).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = String(res.headers.get('content-type') || '');
    if (!/^(text\/html|text\/plain|application\/xhtml\+xml)/i.test(type)) throw new Error('不是网页文本');
    const buf = await readCapped(res, limits.bytes);
    const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase();
    let html;
    try { html = new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(buf); } catch { html = buf.toString('utf8'); }
    return {url: u.href, text: type.includes('plain') ? html.replace(/\s+/g, ' ').trim() : stripHtml(html)};
  }
  throw new Error('重定向过多');
}

const squash = s => String(s).replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();

// "verified" only when the cited quote really appears in the fetched page text.
export function quoteInDocument(quote, text) {
  const q = squash(quote);
  return q.length >= 8 && squash(text).includes(q);
}

// Fetches up to `max` distinct cited pages in parallel. Failures are recorded, never fatal.
export async function verifyEvidence(evidence, sources, {max = 4, fetchFn = fetchDocument, signal} = {}) {
  const byId = new Map(sources.map(s => [s.id, s]));
  const order = [...new Set(evidence.map(e => e.sourceId))].slice(0, max);
  const docs = new Map();
  await Promise.all(order.map(async id => {
    const s = byId.get(id);
    try { docs.set(id, (await fetchFn(s.url, {signal})).text); }
    catch (e) { docs.set(id, {error: String(e.message || e).slice(0, 80)}); }
  }));
  return evidence.map(e => {
    const doc = docs.get(e.sourceId);
    if (doc === undefined) return {...e, check: 'summary-only'};
    if (typeof doc !== 'string') return {...e, check: 'fetch-failed', checkNote: doc.error};
    return {...e, check: quoteInDocument(e.quote, doc) ? 'verified' : 'not-found'};
  });
}
