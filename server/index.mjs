// Local development server. Production runs the same handlers as Vercel functions (see api/).
import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHandlers} from '../lib/routes.mjs';
import {SECURITY_HEADERS} from '../lib/headers.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const api = createHandlers();

export const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api.handle(url.pathname.slice(5).replace(/\/$/, ''), req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let file;
    // three.js is served from node_modules locally; on Vercel it is copied to public/vendor by `npm run build`.
    if (url.pathname === '/vendor/three.module.js') file = path.join(ROOT, 'node_modules/three/build/three.module.js');
    else if (url.pathname === '/vendor/three.core.js') file = path.join(ROOT, 'node_modules/three/build/three.core.js');
    else if (url.pathname.startsWith('/vendor/addons/')) file = path.join(ROOT, 'node_modules/three/examples/jsm', url.pathname.slice(15));
    else file = path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    const allowed = [path.join(ROOT, 'public') + path.sep, path.join(ROOT, 'node_modules/three') + path.sep];
    if (!allowed.some(p => file.startsWith(p))) { res.writeHead(403); return res.end(); }
    const s = await stat(file);
    if (!s.isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch (e) {
    if (!res.headersSent) { res.writeHead(e.code === 'ENOENT' ? 404 : 500, {'Content-Type': 'application/json'}); res.end(JSON.stringify({error: e.code === 'ENOENT' ? '文件不存在。' : '请求未完成。'})); }
    else res.end();
  }
});
server.listen(PORT, HOST, () => console.log(`有据事务所 · http://${HOST}:${PORT}`));
