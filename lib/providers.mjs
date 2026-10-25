export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const safeUrl = value => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
};
export const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').slice(0, 18000);
export function normalizePages(pages = []) {
  if (!Array.isArray(pages)) return [];
  const seen = new Set(); const out = [];
  for (const item of pages) {
    let p; try { p = typeof item === 'string' ? JSON.parse(item) : item; } catch { continue; }
    if (!p || typeof p !== 'object') continue;
    const url = safeUrl(p.url); if (!url || seen.has(url)) continue; seen.add(url);
    out.push({url, title:plain(p.title).slice(0,300), excerpt:plain(p.content || p.passage).slice(0,3600), publishedAt:plain(p.date).slice(0,50), site:plain(p.site).slice(0,100), host:new URL(url).hostname.replace(/^www\./,''), kind:'搜索摘要'});
  }
  return out;
}
// `retries` re-tries only what is safe to repeat: a rate-limit answer (429) or a server error (5xx) that was returned
// before any work was accepted, and a timeout of a short call. Each retry waits a little longer and gives up early
// if the caller has already cancelled. Search and model calls are read-only, so repeating them cannot do harm.
const sleepFor = (ms, signal) => new Promise(resolve => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, {once: true}); });
async function fetchJson(url, init, signal, {timeoutMs = 65000, retries = 0} = {}) {
  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    let response, failure = null;
    try { response = await fetch(url, {...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout}); }
    catch (e) { if (signal?.aborted) throw new AppError('调查已取消。',499); failure = new AppError('上游服务连接失败或超时，请稍后重试。',502); }
    if (!failure && (response.status === 429 || response.status >= 500) && attempt < retries) failure = new AppError(`上游服务请求失败（HTTP ${response.status}），请检查服务端配置或额度。`,502);
    else if (!failure) {
      let data; try { data = await response.json(); } catch { throw new AppError('上游服务没有返回有效 JSON。',502); }
      if (!response.ok) throw new AppError(`上游服务请求失败（HTTP ${response.status}），请检查服务端配置或额度。`,502);
      return data;
    }
    if (attempt >= retries) throw failure;
    await sleepFor(700 * (attempt + 1) + Math.floor(Math.random() * 400), signal);
    if (signal?.aborted) throw new AppError('调查已取消。',499);
  }
}
export function boundedQuery(query, maxBytes=1500) {
  let out=''; for(const character of String(query)){if(Buffer.byteLength(out+character,'utf8')>maxBytes)break;out+=character;} return out;
}
// Optional SearchPro parameters. Only documented values are forwarded; anything else is dropped.
export const INDUSTRIES = ['gov', 'news', 'acad', 'finance'];
export function searchBody(query, {industry, cnt, freshness} = {}) {
  const body = {Query: boundedQuery(query)};
  if (INDUSTRIES.includes(industry)) body.Industry = industry;
  if ([10, 20, 30, 40, 50].includes(cnt)) body.Cnt = cnt;
  if (typeof freshness === 'string' && /^(d\d{1,2}|m\d{1,2}|y\d)$/.test(freshness)) body.Freshness = freshness;
  return body;
}
export async function search(query, {signal, env=process.env, industry, cnt, freshness}={}) {
  if (!env.TENCENTCLOUD_WSA_APIKEY) throw new AppError('元宝搜索尚未配置。请在工程 .env 中设置 TENCENTCLOUD_WSA_APIKEY 后重启服务。',503);
  const data = await fetchJson('https://api.wsa.cloud.tencent.com/SearchPro', {
    method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.TENCENTCLOUD_WSA_APIKEY}`},body:JSON.stringify(searchBody(query, {industry, cnt, freshness}))
  },signal,{timeoutMs:20000,retries:1});
  const r = data.Response || data;
  if (r.Error) throw new AppError(`元宝搜索返回错误：${String(r.Error.Code).replace(/[^\w.]/g,'').slice(0,90)}。请检查服务开通状态或额度。`,502);
  return {sources:normalizePages(r.Pages),requestId:plain(r.RequestId).slice(0,100),notice:plain(r.Msg).slice(0,300)};
}
export function parseModelJSON(content) {
  if (typeof content !== 'string') throw new AppError('模型返回格式异常。',502);
  const clean=content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try {
    const result = JSON.parse(clean);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Expected an object');
    return result;
  } catch { throw new AppError('模型没有返回有效的结构化报告，本次不作真假判断。',502); }
}
// `quick` is for short answers (the detective's gut call): a small output budget, so it returns while the searches run.
export async function modelJSON(system, content, {signal, review=false, vision=false, quick=false, fast=false, env=process.env}={}) {
  if (!env.LLM_API_KEY || !env.LLM_MODEL) throw new AppError('尚未配置分析模型。',503);
  const endpoint = (env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/,'')+'/chat/completions';
  const data = await fetchJson(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.LLM_API_KEY}`},body:JSON.stringify({
    model:vision ? env.LLM_VISION_MODEL : review ? (env.LLM_REVIEW_MODEL || env.LLM_MODEL) : env.LLM_MODEL,
    temperature:quick?.3:.1,max_tokens:quick?1024:Math.max(512,Math.min(16384,Number(env.LLM_MAX_TOKENS)||3500)),
    ...(env.LLM_JSON_MODE==='true'?{response_format:{type:'json_object'}}:{}),
    ...(['low','medium','high'].includes(env.LLM_REASONING_EFFORT)?{reasoning_effort:env.LLM_REASONING_EFFORT}:{}),
    messages:[{role:'system',content:system},{role:'user',content}]
  })},signal,
  // Short calls (the gut call, the question planner) should fail fast and retry; a slow outlier of a minute
  // would otherwise hold up every search. Long analysis calls keep the long timeout and retry only 429/5xx once.
  {timeoutMs:quick?15000:fast?20000:65000,retries:quick||fast?2:1});
  if(data.choices?.[0]?.finish_reason==='length')throw new AppError('模型输出达到长度上限，报告未完整生成。请调高服务端 LLM_MAX_TOKENS 后重试。',502);
  return parseModelJSON(data.choices?.[0]?.message?.content);
}
