// Transactional email through Resend's HTTP API. Without RESEND_API_KEY + MAIL_FROM nothing is sent
// and callers get a clear "not configured" error instead of a silent success.
import {AppError} from './providers.mjs';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export const validEmail = e => typeof e === 'string' && e.length <= 120 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(e);

export const mailConfigured = (env = process.env) => Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

export async function sendMail({to, subject, html}, {env = process.env, fetchImpl = globalThis.fetch} = {}) {
  if (!mailConfigured(env)) throw new AppError('邮件服务尚未配置，暂时不能开启盯梢。', 503);
  if (!validEmail(to)) throw new AppError('邮箱格式不正确。');
  let res;
  try {
    res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({from: env.MAIL_FROM, to: [to], subject: String(subject).slice(0, 150), html}),
      signal: AbortSignal.timeout(10000),
    });
  } catch { throw new AppError('邮件服务连接失败，请稍后再试。', 502); }
  if (!res.ok) throw new AppError(`邮件发送失败（HTTP ${res.status}）。若使用测试发信域名，收件人通常只能是账号本人的邮箱。`, 502);
  return true;
}

const shell = body => `<div style="font:14px/1.8 -apple-system,'PingFang SC',sans-serif;color:#25322a;max-width:520px;margin:auto;padding:24px">
<p style="letter-spacing:2px;font-size:11px;color:#7a8570">THE EVIDENCE BUREAU · 有据事务所</p>${body}
<p style="font-size:11px;color:#8a9278;margin-top:28px">这封邮件由你在事务所登记的盯梢任务发出。报告依据搜索摘要与可抓取的原文，仅供参考。</p></div>`;

export const confirmMail = ({claim, confirmUrl, unsubUrl}) => ({
  subject: '请确认：让事务所帮你盯着这条说法',
  html: shell(`<h2 style="font-weight:500">确认开启盯梢</h2><p>你想让事务所每天复查：</p><blockquote style="border-left:3px solid #a9b48f;margin:0;padding:4px 12px">${esc(claim)}</blockquote>
<p><a href="${esc(confirmUrl)}" style="display:inline-block;background:#1f3a30;color:#fff;padding:10px 18px;text-decoration:none">确认开启</a></p>
<p style="font-size:12px">不是你本人操作？直接忽略，或 <a href="${esc(unsubUrl)}">删除这条登记</a>。</p>`),
});

const VERDICT = {supported: '得到支持', refuted: '被反驳', mixed: '有条件或存在冲突', unknown: '仍无法判断'};
export const changeMail = ({claim, before, after, summary, reportUrl, unsubUrl}) => ({
  subject: `盯梢有新进展：${VERDICT[after] || after}`,
  html: shell(`<h2 style="font-weight:500">结论有变化</h2><blockquote style="border-left:3px solid #a9b48f;margin:0;padding:4px 12px">${esc(claim)}</blockquote>
<p>上次：<b>${esc(VERDICT[before] || before)}</b> → 这次：<b>${esc(VERDICT[after] || after)}</b></p><p>${esc(String(summary).slice(0, 400))}</p>
<p><a href="${esc(reportUrl)}">打开事务所查看完整证据</a></p><p style="font-size:12px"><a href="${esc(unsubUrl)}">不再盯这条</a></p>`),
});
