// EdgeOne Pages Cloud Function: every /api/* request. It runs the same handlers as the local server
// (lib/routes.mjs) through a thin Request/Response adapter, so there is one implementation of the product.
// scripts/build-edgeone.mjs copies lib/ to cloud-functions/_lib/ for the deployment, because a deployed function
// can only import files that live inside its own folder tree.
import {getStore} from '@edgeone/pages-blob';
import {createHandlers} from '../_lib/routes.mjs';
import {createStore} from '../_lib/store.mjs';
import {edgeHandler} from '../_lib/edge-adapter.mjs';

let api, signature = '';

// Environment variables reach the function on `context.env`, not process.env, so handlers get a merged view.
function handlersFor(env) {
  const sig = [env.TENCENTCLOUD_WSA_APIKEY, env.LLM_API_KEY, env.LLM_MODEL, env.UPSTASH_REDIS_REST_URL, env.CRON_SECRET].map(v => (v ? v.length : 0)).join(',');
  if (!api || sig !== signature) {
    signature = sig;
    api = createHandlers({env, store: createStore(env, globalThis.fetch, {blobFactory: getStore})});
  }
  return api;
}

export async function onRequest(context) {
  const env = {
    ...process.env, ...(context.env || {}),
    TENCENTCLOUD_WSA_APIKEY: context.env?.YUANBAO_SEARCH_API_KEY || process.env.YUANBAO_SEARCH_API_KEY || context.env?.TENCENTCLOUD_WSA_APIKEY || process.env.TENCENTCLOUD_WSA_APIKEY,
    EB_TRUST_PROXY: '1',                                              // forwarded client IPs come from EdgeOne itself
    EB_OPEN_CRON: context.env?.CRON_SECRET ? '' : '1',                // schedules send a bare POST; see routes.mjs cronWatch
  };
  return edgeHandler(handlersFor(env), url => url.pathname.replace(/^\/api\//, '').replace(/\/$/, ''))(context);
}
