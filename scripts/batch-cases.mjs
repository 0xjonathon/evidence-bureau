// Runs the real pipeline (Yuanbao search + the configured model) over scripts/claims.json and stores every result as
// a case file under data/cases/. These are real investigation records, not simulations. The page shows them as
// "已结案卷" with their recording date, and can replay each one without spending any search.
//
//   node --env-file=.env scripts/batch-cases.mjs                 # run everything not done yet
//   node --env-file=.env scripts/batch-cases.mjs --only a,b      # run these slugs
//   node --env-file=.env scripts/batch-cases.mjs --budget 480    # stop starting new cases after 480 s
//   node --env-file=.env scripts/batch-cases.mjs --force         # redo cases that already exist
//   node --env-file=.env scripts/batch-cases.mjs --index         # only rebuild data/cases-index.json
//
// Resumable: finished cases are skipped. Each case costs about 4 searches (6 for "deep"). Add EB_ALLOW_FAKE_IP=1 only
// on a developer machine whose proxy answers every DNS lookup with 198.18.x.x, or full-text checks will be blocked.
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {investigate} from '../lib/investigate.mjs';
import {verifyEvidence} from '../lib/fetchdoc.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'data', 'cases');
const argv = process.argv.slice(2);
const flag = name => argv.includes('--' + name);
const value = name => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; };
const only = value('only')?.split(',').filter(Boolean);
const budget = Number(value('budget')) || Infinity;
const concurrency = Math.max(1, Math.min(4, Number(value('concurrency')) || 2));

await mkdir(dir, {recursive: true});
const claims = JSON.parse(await readFile(path.join(root, 'scripts', 'claims.json'), 'utf8'));
const exists = async slug => readFile(path.join(dir, slug + '.json')).then(() => true, () => false);

const summary = (item, report) => ({
  slug: item.slug, id: report.id, claim: report.claim, category: item.category, depth: report.depth,
  verdict: report.verdict, strength: report.strength, gut: report.gut, timeSensitive: report.timeSensitive,
  sources: report.sources.length, tiers: report.sources.reduce((m, s) => (m[s.tier] = (m[s.tier] || 0) + 1, m), {}),
  evidence: report.evidence.length, verified: report.evidence.filter(e => e.check === 'verified').length,
  searches: (report.rounds || []).filter(r => !r.failed).length, completedAt: report.completedAt,
});

async function runOne(item) {
  const started = Date.now();
  const report = await investigate({claim: item.claim, depth: item.deep ? 'deep' : 'standard'}, () => {}, {verifyFn: process.env.EB_DISABLE_FULLTEXT ? null : verifyEvidence});
  const stored = {...report, slug: item.slug, category: item.category, recorded: true};
  await writeFile(path.join(dir, item.slug + '.json'), JSON.stringify(stored));
  const s = summary(item, report);
  console.log(`${new Date().toTimeString().slice(0, 8)} ${item.slug.padEnd(22)} ${s.verdict.padEnd(9)} gut=${(s.gut?.guess || '-').padEnd(7)} ${(s.gut?.outcome || 'no-bet').padEnd(10)} ${s.strength.label} ${s.sources}src ${s.searches}q ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

async function rebuildIndex() {
  const rows = [];
  for (const item of claims) {
    const raw = await readFile(path.join(dir, item.slug + '.json'), 'utf8').catch(() => null);
    if (raw) rows.push(summary(item, JSON.parse(raw)));
  }
  const meta = {generatedAt: new Date().toISOString(), cases: rows.length, searches: rows.reduce((n, r) => n + r.searches, 0),
    note: '真实调查记录：元宝搜索 SearchPro + 模型分析，非实时。'};
  await writeFile(path.join(root, 'data', 'cases-index.json'), JSON.stringify({meta, cases: rows}, null, 1));
  return meta;
}

if (!flag('index')) {
  if (!process.env.TENCENTCLOUD_WSA_APIKEY || !process.env.LLM_API_KEY) throw new Error('Run with --env-file=.env (search and model keys are required).');
  const queue = [];
  for (const item of claims) if ((!only || only.includes(item.slug)) && (flag('force') || !await exists(item.slug))) queue.push(item);
  console.log(`${queue.length} case(s) to run, concurrency ${concurrency}`);
  const startedAt = Date.now();
  let failed = 0;
  await Promise.all(Array.from({length: concurrency}, async () => {
    while (queue.length && (Date.now() - startedAt) / 1000 < budget) {
      const item = queue.shift();
      try { await runOne(item); } catch (e) { failed++; console.log(`${item.slug.padEnd(22)} FAILED ${String(e.message).slice(0, 80)}`); }
    }
  }));
  if (queue.length) console.log(`${queue.length} case(s) left for the next run: ${queue.map(q => q.slug).join(', ')}`);
  if (failed) console.log(`${failed} case(s) failed and were not stored.`);
}
const meta = await rebuildIndex();
console.log(`index: ${meta.cases} cases, ${meta.searches} Yuanbao searches in the stored records`);
console.log('stored files:', (await readdir(dir)).length);
