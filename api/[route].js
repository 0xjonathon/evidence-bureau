// Vercel function entry. One catch-all file keeps every route on the same shared handlers (lib/routes.mjs).
import {createHandlers} from '../lib/routes.mjs';

const api = createHandlers();

export default function handler(req, res) {
  const route = String(req.query?.route ?? new URL(req.url, 'http://localhost').pathname.replace(/^\/api\//, '')).replace(/\/$/, '');
  return api.handle(route, req, res);
}
