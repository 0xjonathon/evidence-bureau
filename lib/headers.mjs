// Security headers shared by the local server and vercel.json (a test keeps them in sync).
// The script hash covers the inline import map in public/index.html. Editing that
// block changes the hash: recompute it with `node scripts/importmap-hash.mjs`.
export const IMPORTMAP_HASH = 'sha256-xKC5iFyQS8Rg2vT8X0L9L5p2MBtIeO2cFdQA+73n0ZA=';
export const CSP = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' '${IMPORTMAP_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': CSP,
};
