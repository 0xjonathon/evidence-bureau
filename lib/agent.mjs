// Agent (user) identity and case-file bookkeeping. No login: the browser holds a
// random token, the server stores only its hash.
import {newToken, validToken, hashToken} from './store.mjs';

const CODENAMES = ['灰雀', '夜枭', '琥珀', '松烟', '回声', '青灯', '雪豹', '墨鲤', '山雀', '铜铃', '白鹭', '寒鸦'];
export const RANKS = [
  {min: 0, name: '实习探员'},
  {min: 3, name: '正式探员'},
  {min: 10, name: '资深探员'},
];
export const rankFor = cases => [...RANKS].reverse().find(r => cases >= r.min).name;

export function publicProfile(p) {
  return {
    badge: p.badge, codename: p.codename, joinedAt: p.joinedAt,
    cases: p.cases, honest: p.honest, rank: rankFor(p.cases),
  };
}

export async function createAgent(store, now = new Date()) {
  const token = newToken();
  const n = await store.incr('agents:count');
  const codename = CODENAMES[(n - 1) % CODENAMES.length];
  const profile = {
    badge: 'EB-' + String(n).padStart(4, '0'), codename, joinedAt: now.toISOString(),
    cases: 0, honest: 0,
  };
  await store.set(`agent:${hashToken(token)}`, profile);
  return {token, profile: publicProfile(profile)};
}

export async function loadAgent(store, token) {
  if (!validToken(token)) return null;
  const profile = await store.get(`agent:${hashToken(token)}`);
  return profile ? {hash: hashToken(token), profile} : null;
}

export async function renameAgent(store, agent, name) {
  const codename = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  if (codename.length < 1) return agent.profile;
  const profile = {...agent.profile, codename};
  await store.set(`agent:${agent.hash}`, profile);
  return profile;
}

// Case status shown on the case wall. "cold" = honest "don't know" (悬案).
export function caseStatus(report) {
  if (report.verdict === 'unknown') return 'cold';
  return report.verdict;
}

export const summary = r => ({
  id: r.id, claim: r.claim, verdict: r.verdict, status: caseStatus(r),
  completedAt: r.completedAt, depth: r.depth, mode: r.mode, sources: r.sources?.length ?? 0,
});

export async function saveCase(store, agent, report, {publicWall = false} = {}) {
  await store.set(`case:${report.id}`, {report, owner: agent.hash, public: Boolean(publicWall)}, 60 * 60 * 24 * 90);
  await store.push(`agent:${agent.hash}:cases`, summary(report), 200);
  const profile = {
    ...agent.profile,
    cases: agent.profile.cases + 1,
    // An honest "don't know" counts as a proper closure, never as a failure.
    honest: agent.profile.honest + (report.verdict === 'unknown' ? 1 : 0),
  };
  await store.set(`agent:${agent.hash}`, profile);
  if (publicWall) await store.push('wall:recent', summary(report), 40);
  return publicProfile(profile);
}

export async function listCases(store, agent) {
  return store.list(`agent:${agent.hash}:cases`, 200);
}

export async function getCase(store, id, agent) {
  if (!/^EB-\d{8}-[0-9A-F]{6}$/.test(id)) return null;
  const row = await store.get(`case:${id}`);
  if (!row) return null;
  if (row.public || (agent && row.owner === agent.hash)) return row.report;
  return null;
}
