// Rate limits and search-quota protection.
//
// Search quota and per-agent daily caps live in the store as *ledgers* (add / sum), never as read-modify-write:
// the EdgeOne Blob store has no atomic operations, so a counter that is read, bumped and written back loses updates.
// A ledger entry is written once and never changed, so concurrent requests cannot overwrite each other.
// The per-minute request limiter is in-process memory: best effort, enough to stop accidental hammering.
import {AppError} from './providers.mjs';

const ymd = (now = new Date()) => now.toISOString().slice(0, 10).replaceAll('-', '');
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

export const limitsFrom = (env = process.env) => ({
  perMinute: num(env.EB_RATE_PER_MINUTE, 8),               // requests per client per minute
  perAgentPerDay: num(env.EB_AGENT_PER_DAY, 12),           // investigations per agent token per day
  // The competition allowance is 6000 searches a month. The daily cap keeps one bad day from eating the month,
  // and the monthly cap keeps headroom for demos, probes and retries.
  dailySearchBudget: num(env.EB_DAILY_SEARCH_BUDGET, 800),
  monthlySearchBudget: num(env.EB_MONTHLY_SEARCH_BUDGET, 5000),
  searchesPerInvestigationMax: 8,
});
export const LIMITS = limitsFrom({});

// Counters are kept per store object, in this instance's memory: separate stores (and test runs) never share them.
const rateHits = new WeakMap();   // store -> Map<`${clientKey}:${minute}`, count>, pruned on every call
export async function checkRate(store, clientKey, limits = LIMITS, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  const hits = rateHits.get(store) || rateHits.set(store, new Map()).get(store);
  for (const k of hits.keys()) if (Number(k.slice(k.lastIndexOf(':') + 1)) < minute - 1) hits.delete(k);
  const key = `${clientKey}:${minute}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (n > limits.perMinute) throw new AppError('提交太频繁，请稍等一分钟。', 429);
}

const DAY = 172800;
// Totals of earlier days this month never change, so each store remembers them after the first lookup.
const pastDays = new WeakMap();   // store -> Map<yyyymmdd, total>
async function pastTotal(store, now) {
  const cache = pastDays.get(store) || pastDays.set(store, new Map()).get(store);
  const today = ymd(now);
  const days = [];
  for (let d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1); d < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); d += 86400000) days.push(ymd(new Date(d)));
  await Promise.all(days.filter(d => d !== today && !cache.has(d)).map(async d => cache.set(d, await store.ledgerSum(`searchday:${d}`))));
  return days.reduce((sum, d) => sum + (cache.get(d) || 0), 0);
}

// Reserve the worst-case number of searches up front; refund what was not used.
export async function reserveSearches(store, agentHash, count, limits = LIMITS, now = new Date()) {
  const agentKey = `agentday:${agentHash}:${ymd(now)}`;
  if (await store.ledgerAdd(agentKey, 1, DAY) > limits.perAgentPerDay) {
    await store.ledgerAdd(agentKey, -1, DAY);
    throw new AppError('今天的调查次数已用完，明天再来。已有案卷仍可查看。', 429);
  }
  const key = `searchday:${ymd(now)}`;
  const [dayTotal, before] = await Promise.all([store.ledgerAdd(key, count, DAY), pastTotal(store, now)]);
  const overDay = dayTotal > limits.dailySearchBudget;
  if (overDay || before + dayTotal > limits.monthlySearchBudget) {
    await store.ledgerAdd(key, -count, DAY);
    await store.ledgerAdd(agentKey, -1, DAY);
    throw new AppError(overDay ? '今天的搜索额度已用完，明天再来。已有案卷仍可查看。' : '本月搜索额度已用完，暂停新的实时调查。已有案卷仍可查看。', 503);
  }
  return {key, count};
}

export async function refundSearches(store, reservation, unused) {
  if (!reservation || unused <= 0) return;
  await store.ledgerAdd(reservation.key, -unused, DAY);
}

export async function quotaSnapshot(store, limits = LIMITS, now = new Date()) {
  const [today, before] = await Promise.all([store.ledgerSum(`searchday:${ymd(now)}`), pastTotal(store, now)]);
  const used = before + today;
  return {used, today, budget: limits.monthlySearchBudget, dailyBudget: limits.dailySearchBudget, exhausted: used >= limits.monthlySearchBudget || today >= limits.dailySearchBudget};
}
