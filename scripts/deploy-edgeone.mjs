// Deploys dist-eo/ to EdgeOne Pages. Run `npm run build:edgeone` first (this script does it for you).
//
//   edgeone login                      # once, in a terminal; or export EDGEONE_API_TOKEN
//   npm run deploy:edgeone             # production deploy of project "evidence-bureau-demo"
//   EB_PROJECT=name npm run deploy:edgeone
//
// Secrets are NOT uploaded by this script. Set them in the EdgeOne console (Project Settings > Environment
// Variables) or with `edgeone makers env set KEY VALUE -e production`, then deploy again: variables only apply
// to deployments created after they were set.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, {stdio: 'inherit', cwd: root, ...opts});

const build = run('node', ['scripts/build-edgeone.mjs']);
if (build.status !== 0) process.exit(build.status ?? 1);

const name = process.env.EB_PROJECT || 'evidence-bureau-demo';
const area = process.env.EB_AREA || 'overseas';
if (!['global', 'overseas'].includes(area)) throw new Error('EB_AREA must be global or overseas');
const token = process.env.EDGEONE_API_TOKEN;
const args = ['--yes', 'edgeone@1.6.46', 'makers', 'deploy', 'dist-eo', '-n', name, '-a', area, '--skip-ai-gateway-sync', ...(token ? ['-t', token] : [])];
console.log(`\nDeploying dist-eo/ as "${name}" (${token ? 'API token' : 'logged-in session'})...\n`);
const result = run('npx', args);
if (result.status !== 0) {
  console.error('\nDeploy failed. If it asked you to log in, run `npx edgeone@1.6.46 login` once and try again.');
  process.exit(result.status ?? 1);
}
console.log('\nNext: open the project in the EdgeOne console, set the environment variables listed in docs/GITHUB-DEPLOY.md, then run this script again.');
