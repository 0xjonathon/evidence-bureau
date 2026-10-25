// Builds the EdgeOne Pages deployment folder: dist-eo/
//
//   dist-eo/                       static site (what the browser loads)
//   dist-eo/cloud-functions/api/   the /api function
//   dist-eo/cloud-functions/_lib/  a copy of lib/ (a deployed function can only import files inside its own tree)
//   dist-eo/edgeone.json           headers, 120 s function limit, daily schedule
//
// Only files the page really uses are copied. public/ also holds historic models (character-rig-v4 and others)
// that no page references; shipping them would only slow the upload.
import {cp, mkdir, rm, readdir, readFile, writeFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, process.env.EB_OUT || 'dist-eo');
const at = (...p) => path.join(root, ...p);

// Start from an empty folder. The folder itself is kept (some environments allow emptying a directory but not
// removing it), so its contents are cleared one entry at a time instead of removing the directory.
await mkdir(out, {recursive: true});
for (const entry of await readdir(out)) await rm(path.join(out, entry), {recursive: true, force: true}).catch(e => { throw new Error(`Cannot clear ${out}/${entry}: ${e.message}`); });

// 1. public/vendor must already hold three.js and friends. `npm ci && npm run build` creates it (copy-vendor.mjs);
//    this script never deletes anything under public/, it only reads from it.
for (const f of ['three.module.js', 'three.core.js', 'rapier.mjs']) {
  if (!(await stat(at('public', 'vendor', f)).catch(() => null))) throw new Error(`public/vendor/${f} is missing. Run \`npm ci && npm run build\` first.`);
}

// 2. Static files the page references.
const pageFiles = (await readdir(at('public'))).filter(f => /\.(js|css|html)$/.test(f));
for (const f of pageFiles) await cp(at('public', f), path.join(out, f));
await cp(at('public', 'fixtures'), path.join(out, 'fixtures'), {recursive: true}).catch(() => {});
await mkdir(path.join(out, 'assets'), {recursive: true});
const ASSETS = ['instrument-v9.glb', 'bureau-room-v3.glb', 'detective-standard-v5.glb', 'detective-standard-v5.json', 'visitor-standard-v5.glb', 'visitor-standard-v5.json', 'bureau-preview.png', 'favicon.svg'];
for (const a of ASSETS) await cp(at('public', 'assets', a), path.join(out, 'assets', a));
await mkdir(path.join(out, 'vendor', 'addons'), {recursive: true});
for (const f of ['three.module.js', 'three.core.js', 'rapier.mjs', 'RAPIER-LICENSE']) await cp(at('public', 'vendor', f), path.join(out, 'vendor', f));
await cp(at('public', 'vendor', 'addons'), path.join(out, 'vendor', 'addons'), {recursive: true});

// 3. Handwriting glyphs. All 9,574 are shipped: the user can type any claim, and code point order is not a
//    frequency order, so there is no safe way to pick "the common ones". It is ~9.6k small files and ~47 MB, well
//    inside EdgeOne's limits (20,000 files and 25 MB per file per project). Only the single-character files are
//    copied, which excludes the dataset's licence text.
const glyphDir = at('public', 'vendor', 'hanzi');
const glyphFiles = (await readdir(glyphDir)).filter(f => f.endsWith('.json') && [...f].length === 6);
await mkdir(path.join(out, 'vendor', 'hanzi'), {recursive: true});
for (const f of glyphFiles) await cp(path.join(glyphDir, f), path.join(out, 'vendor', 'hanzi', f));
const glyphs = glyphFiles;
await cp(path.join(glyphDir, 'ARPHICPL.TXT'), path.join(out, 'vendor', 'hanzi', 'ARPHICPL.TXT')).catch(() => {});

// 4. Curated real case files, if present (written by scripts/batch-cases.mjs).
await cp(at('data'), path.join(out, 'data'), {recursive: true}).catch(() => {});

// 5. Function + a copy of lib/.
const fnDir = path.join(out, 'cloud-functions');
await mkdir(path.join(fnDir, 'api'), {recursive: true});
await cp(at('cloud-functions', 'api'), path.join(fnDir, 'api'), {recursive: true});
await cp(at('lib'), path.join(fnDir, '_lib'), {recursive: true});

// 6. Config and package manifest (the function needs @edgeone/pages-blob at install time).
await cp(at('edgeone.json'), path.join(out, 'edgeone.json'));
const pkg = JSON.parse(await readFile(at('package.json'), 'utf8'));
if (!pkg.dependencies['@edgeone/pages-blob']) throw new Error('package.json must pin @edgeone/pages-blob');
await writeFile(path.join(out, 'package.json'), JSON.stringify({name: pkg.name, private: true, type: 'module', version: pkg.version, dependencies: {'@edgeone/pages-blob': pkg.dependencies['@edgeone/pages-blob']}}, null, 2));

// 7. Report.
async function size(dir) { let bytes = 0, files = 0; for (const e of await readdir(dir, {withFileTypes: true})) { const p = path.join(dir, e.name); if (e.isDirectory()) { const s = await size(p); bytes += s.bytes; files += s.files; } else { bytes += (await stat(p)).size; files++; } } return {bytes, files}; }
const s = await size(out);
console.log(`${path.basename(out)} ready: ${s.files} files, ${(s.bytes / 1048576).toFixed(1)} MB (${glyphs.length} handwriting glyphs)`);
if (s.files > 20000) throw new Error('Too many files for one EdgeOne project (limit 20,000).');
