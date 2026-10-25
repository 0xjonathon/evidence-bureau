// Continuous watch ("盯梢"): re-investigate a claim on a schedule and record what changed.
//
// Two ways to be told:
//   - in the page: the next time the agent opens the case archive, the watch shows its latest verdict and history;
//   - by email, only if the visitor leaves an address AND mail is configured (Resend). Email is optional.
//
// Storage is one record per watch under `watch:<id>`; there is no shared index array. That matters because the
// EdgeOne Blob store has no atomic operations, so a read-modify-write on a shared list would lose updates.
import {randomBytes} from 'node:crypto';
import {AppError} from './providers.mjs';
import {validEmail, sendMail, confirmMail, changeMail, mailConfigured} from './mail.mjs';
import {reserveSearches, refundSearches} from './quota.mjs';

// perRun: how many watches one scheduled pass may re-check. A re-check costs a full investigation.
export const WATCH_LIMITS = {perAgent: 3, perRun: 3, ttlSeconds: 60 * 60 * 24 * 90, historyMax: 30, minHoursBetweenChecks: 20};
const tok = () => randomBytes(18).toString('base64url');

const CONCLUSIVE = new Set(['supported', 'refuted', 'mixed']);

// Decides whether a new result is worth telling anyone. Downgrades to "unknown" are recorded but never announced:
// they are as likely to be a flaky search as a real change.
export function compareReports(prev, next) {
  if (!next || !next.verdict) return {notify: false, kind: 'check-failed'};
  if (prev === next.verdict) return {notify: false, kind: 'unchanged'};
  if (next.verdict === 'unknown') return {notify: false, kind: 'became-unknown'};
  if (prev === 'unknown') return {notify: true, kind: 'became-conclusive'};
  if (CONCLUSIVE.has(prev) && CONCLUSIVE.has(next.verdict)) return {notify: true, kind: 'verdict-changed'};
  return {notify: false, kind: 'unchanged'};
}

const listIds = async store => (await store.keys('watch:')).map(k => k.slice(6)).filter(id => /^W-[0-9A-F]{10}$/.test(id));
const loadAll = async store => (await Promise.all((await listIds(store)).map(id => store.get(`watch:${id}`)))).filter(Boolean);

export async function createWatch(store, agent, {caseId, email = '', report}, {env = process.env, baseUrl, fetchImpl} = {}) {
  if (!report?.claim) throw new AppError('没有找到要盯的案卷。', 404);
  const wantsMail = Boolean(String(email).trim());
  if (wantsMail && !validEmail(email)) throw new AppError('邮箱格式不正确。');
  if (wantsMail && !mailConfigured(env)) throw new AppError('邮件服务尚未配置。可以不填邮箱，改为下次打开事务所时查看变化。', 503);
  const mine = (await loadAll(store)).filter(w => w.owner === agent.hash);
  if (mine.length >= WATCH_LIMITS.perAgent) throw new AppError(`每位探员最多同时盯 ${WATCH_LIMITS.perAgent} 件，请先退订一件。`, 429);
  const id = 'W-' + randomBytes(5).toString('hex').toUpperCase();
  const confirmToken = tok(), unsubToken = tok();
  const watch = {
    id, owner: agent.hash, caseId, claim: report.claim, email: wantsMail ? String(email).trim() : '',
    // Without an email there is nothing to confirm, so the watch is live at once.
    status: wantsMail ? 'pending' : 'active',
    lastVerdict: report.verdict, createdAt: new Date().toISOString(), lastCheckedAt: null,
    confirmToken, unsubToken, history: [], unseen: 0,
  };
  if (wantsMail) {
    const urls = {confirmUrl: `${baseUrl}/api/watch?confirm=${watch.id}.${confirmToken}`, unsubUrl: `${baseUrl}/api/watch?unsub=${watch.id}.${unsubToken}`};
    await sendMail({to: watch.email, ...confirmMail({claim: watch.claim, ...urls})}, {env, fetchImpl});   // fail before storing anything
  }
  await store.set(`watch:${id}`, watch, WATCH_LIMITS.ttlSeconds);
  return publicWatch(watch);
}

export const publicWatch = w => ({
  id: w.id, caseId: w.caseId, claim: w.claim, status: w.status, lastVerdict: w.lastVerdict,
  lastCheckedAt: w.lastCheckedAt, createdAt: w.createdAt, history: w.history.slice(0, 10), unseen: w.unseen || 0,
  email: w.email ? w.email.replace(/^(.).*(@.*)$/, '$1***$2') : '',
});

const parse = value => { const [id, token] = String(value || '').split('.'); return /^W-[0-9A-F]{10}$/.test(id) && token ? {id, token} : null; };

export async function confirmWatch(store, value) {
  const p = parse(value); if (!p) return false;
  const w = await store.get(`watch:${p.id}`);
  if (!w || w.confirmToken !== p.token) return false;
  if (w.status === 'pending') await store.set(`watch:${p.id}`, {...w, status: 'active'}, WATCH_LIMITS.ttlSeconds);
  return true;
}

export async function removeWatch(store, value) {
  const p = parse(value); if (!p) return false;
  const w = await store.get(`watch:${p.id}`);
  if (!w || w.unsubToken !== p.token) return false;
  await store.del(`watch:${p.id}`);
  return true;
}

export async function listWatches(store, agent) {
  return (await loadAll(store)).filter(w => w.owner === agent.hash).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicWatch);
}

// The visitor has seen the changes: clear the "unseen" counters of their own watches.
export async function markSeen(store, agent) {
  for (const w of (await loadAll(store)).filter(x => x.owner === agent.hash && x.unseen)) await store.set(`watch:${w.id}`, {...w, unseen: 0}, WATCH_LIMITS.ttlSeconds);
}

const hoursSince = iso => (Date.now() - Date.parse(iso)) / 3600000;

// One scheduled pass. Oldest-checked first, capped per run so it fits the function time limit. A watch checked
// recently is skipped, so a repeated call to the (unauthenticated on some platforms) schedule URL costs nothing.
export async function runDueWatches(store, {investigateFn, env = process.env, baseUrl, fetchImpl, limit = WATCH_LIMITS.perRun, reserve = 4, signal, force = false} = {}) {
  const results = [];
  const watches = (await loadAll(store)).filter(w => w.status === 'active'
    && (force || !w.lastCheckedAt || hoursSince(w.lastCheckedAt) >= WATCH_LIMITS.minHoursBetweenChecks));
  watches.sort((a, b) => String(a.lastCheckedAt || '').localeCompare(String(b.lastCheckedAt || '')));
  for (const w of watches.slice(0, limit)) {
    let reservation = null, report = null, kind = 'check-failed', mailed = false;
    try {
      reservation = await reserveSearches(store, 'watch:' + w.id, reserve);
      report = await investigateFn({claim: w.claim, depth: 'standard'}, () => {}, {signal});
      await refundSearches(store, reservation, 0);
      const cmp = compareReports(w.lastVerdict, report);
      kind = cmp.kind;
      if (cmp.notify && w.email && mailConfigured(env)) {
        const mail = changeMail({claim: w.claim, before: w.lastVerdict, after: report.verdict, summary: report.summary,
          reportUrl: `${baseUrl}/`, unsubUrl: `${baseUrl}/api/watch?unsub=${w.id}.${w.unsubToken}`});
        try { await sendMail({to: w.email, ...mail}, {env, fetchImpl}); mailed = true; } catch { kind += '+mail-failed'; }
      }
    } catch (e) { kind = 'check-failed'; if (reservation) await refundSearches(store, reservation, reserve).catch(() => {}); }
    const entry = {at: new Date().toISOString(), kind, verdict: report?.verdict ?? null, mailed};
    // Only advance the baseline when a mail was delivered or nothing needed telling; a failed send is retried next run.
    // A drop to "unknown" is logged but never becomes the baseline, so a flaky search cannot
    // later trigger a false "changed" notice when the old verdict returns.
    const advance = report && !kind.includes('mail-failed') && kind !== 'check-failed' && kind !== 'became-unknown';
    const changed = advance && compareReports(w.lastVerdict, report).notify;
    await store.set(`watch:${w.id}`, {...w, lastCheckedAt: entry.at, lastVerdict: advance ? report.verdict : w.lastVerdict, unseen: (w.unseen || 0) + (changed ? 1 : 0), history: [entry, ...w.history].slice(0, WATCH_LIMITS.historyMax)}, WATCH_LIMITS.ttlSeconds);
    results.push({id: w.id, ...entry});
  }
  return results;
}
