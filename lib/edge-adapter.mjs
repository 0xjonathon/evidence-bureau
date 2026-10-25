// Runs the Node-style handlers in lib/routes.mjs on a Web Request/Response runtime (EdgeOne Cloud Functions).
// The handlers only use a small slice of req/res, so this adapter provides exactly that slice:
//   req: method, url, headers (lower-case keys), body (already-parsed JSON), socket.remoteAddress
//   res: writeHead, write, end, on('close'), destroyed, writableEnded, headersSent
// `handle()` resolves with a Response as soon as the handler sends its head, so streaming bodies start immediately.
const TEXT = new TextEncoder();

export function nodeRequest(request, {clientIp, publicHost} = {}) {
  const url = new URL(request.url);
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  // On EdgeOne the function sees an internal host; the public host the browser used is in eo-pages-host.
  // Normalising it here keeps the same-origin check meaningful instead of rejecting every real browser request.
  const host = publicHost || headers['eo-pages-host'] || headers.host || url.host;
  headers.host = host;
  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    socket: {remoteAddress: clientIp || headers['eo-connecting-ip'] || headers['x-real-ip'] || ''},
    body: undefined,
    rawRequest: request,
  };
}

// Parse a JSON body up front so handlers that read `req.body` need no stream support.
export async function withBody(req, limit = 6_000_000) {
  if (req.method === 'GET' || req.method === 'HEAD') return req;
  const text = await req.rawRequest.text();
  if (text.length > limit) { req.body = {__tooLarge: true}; return req; }
  if (!text.trim()) { req.body = {}; return req; }
  try { const parsed = JSON.parse(text); req.body = parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { req.body = {__badJson: true}; }
  return req;
}

export function webResponse() {
  let controller, head = null, ended = false, closeHandlers = [];
  let resolveHead;
  const headReady = new Promise(r => { resolveHead = r; });
  const stream = new ReadableStream({
    start(c) { controller = c; },
    cancel() { res.destroyed = true; for (const fn of closeHandlers) try { fn(); } catch { /* ignore */ } },
  });
  const res = {
    destroyed: false,
    get writableEnded() { return ended; },
    get headersSent() { return head !== null; },
    setHeader() { /* headers are set through writeHead in these handlers */ },
    writeHead(status, headers = {}) { if (head) return res; head = {status, headers}; resolveHead(); return res; },
    write(chunk) {
      if (!head) res.writeHead(200);
      if (res.destroyed || ended) return false;
      try { controller.enqueue(typeof chunk === 'string' ? TEXT.encode(chunk) : chunk); } catch { res.destroyed = true; }
      return true;
    },
    end(chunk) {
      if (ended) return res;
      if (chunk !== undefined && chunk !== null) res.write(chunk);
      if (!head) res.writeHead(200);
      ended = true;
      try { controller.close(); } catch { /* already closed */ }
      return res;
    },
    on(event, fn) { if (event === 'close') closeHandlers.push(fn); return res; },
  };
  return {
    res,
    async response() {
      await headReady;
      return new Response(stream, {status: head.status, headers: head.headers});
    },
  };
}

// Adapts `createHandlers(...).handle(route, req, res)` to `(Request) => Promise<Response>`.
export function edgeHandler(api, routeOf) {
  return async function onRequest(context) {
    const request = context.request;
    const req = await withBody(nodeRequest(request, {clientIp: context.clientIp}));
    const {res, response} = webResponse();
    const route = routeOf(new URL(request.url), context);
    // Do not await: the handler may keep streaming after the Response head has been returned.
    api.handle(route, req, res).catch(() => { try { res.end(); } catch { /* ignore */ } });
    return response();
  };
}
