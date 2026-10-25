// Source tiering by hostname. This is a transparent heuristic, not a truth score:
// it tells the reader what kind of publisher a source is, nothing more.
export const TIERS = {
  official: {rank: 1, label: '官方机构'},
  academic: {rank: 2, label: '学术科研'},
  media: {rank: 3, label: '权威媒体'},
  reference: {rank: 4, label: '百科工具'},
  social: {rank: 5, label: '自媒体与社区'},
  unknown: {rank: 6, label: '未分级'},
};

const endsWith = (host, list) => list.some(d => host === d || host.endsWith('.' + d));

const OFFICIAL_SUFFIX = [/\.gov(\.[a-z]{2})?$/, /\.mil$/, /\.gov\.cn$/, /\.int$/];
const OFFICIAL_HOSTS = ['nasa.gov', 'who.int', 'un.org', 'cnsa.gov.cn', 'cmse.gov.cn', 'cdc.gov', 'nih.gov', 'esa.int', 'samr.gov.cn', 'nmpa.gov.cn', 'chinacdc.cn', 'cma.cn', 'piyao.org.cn'];
const ACADEMIC_SUFFIX = [/\.edu(\.[a-z]{2})?$/, /\.ac\.[a-z]{2}$/, /\.edu\.cn$/];
const ACADEMIC_HOSTS = ['nature.com', 'science.org', 'cnki.com.cn', 'sciencedirect.com', 'springer.com', 'arxiv.org', 'ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'cas.cn', 'cnki.net', 'thelancet.com', 'bmj.com'];
const MEDIA_HOSTS = ['xinhuanet.com', 'news.cn', 'people.com.cn', 'cctv.com', 'cctv.cn', 'chinadaily.com.cn', 'thepaper.cn', 'caixin.com', 'bbc.com', 'bbc.co.uk', 'reuters.com', 'apnews.com', 'nytimes.com', 'theguardian.com', 'skyandtelescope.org', 'scientificamerican.com', 'kepuchina.cn', 'cast.org.cn', 'dsb.cn',
  // Established news organisations and science museums seen in real search results. Portals that host self-published
  // accounts (qq.com, 163.com, sina user pages) are deliberately left out: they cannot be vouched for as a whole.
  'chinanews.com.cn', 'chinanews.com', 'cnr.cn', 'cri.cn', 'gmw.cn', 'youth.cn', 'cyol.com', 'stdaily.com', 'ce.cn', 'jfdaily.com', 'bjnews.com.cn', 'infzm.com', 'yicai.com', 'cdstm.cn', 'cna.com.tw', 'newscientist.com', 'space.com'];
const REFERENCE_HOSTS = ['eb.com', 'wikipedia.org', 'baike.baidu.com', 'baike.com', 'britannica.com', 'zhihu.com'];
const SOCIAL_HOSTS = ['weibo.com', 'weibo.cn', 'xiaohongshu.com', 'douyin.com', 'bilibili.com', 'tieba.baidu.com', 'reddit.com', 'quora.com', 'twitter.com', 'x.com', 'facebook.com', 'toutiao.com', 'sohu.com', 'baijiahao.baidu.com', 'mp.weixin.qq.com', 'zhuanlan.zhihu.com', 'medium.com', 'douban.com'];

export function sourceTier(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  let key = 'unknown';
  // Order matters: community hosts first so "zhuanlan.zhihu.com" is not treated as a reference site.
  if (endsWith(h, SOCIAL_HOSTS) && !endsWith(h, ['baike.baidu.com'])) key = 'social';
  else if (endsWith(h, OFFICIAL_HOSTS) || OFFICIAL_SUFFIX.some(r => r.test(h))) key = 'official';
  else if (endsWith(h, ACADEMIC_HOSTS) || ACADEMIC_SUFFIX.some(r => r.test(h))) key = 'academic';
  else if (endsWith(h, MEDIA_HOSTS)) key = 'media';
  else if (endsWith(h, REFERENCE_HOSTS)) key = 'reference';
  return {tier: key, tierLabel: TIERS[key].label, tierRank: TIERS[key].rank};
}

// Lower rank = more authoritative publisher type. Used only to order display and to choose which sources to fetch in full.
export const byTier = (a, b) => (a.tierRank ?? 6) - (b.tierRank ?? 6);

// Same-origin republication detection: two sources whose normalized leading text is near-identical
// are one origin repeated, so they must not count as independent corroboration.
const norm = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const grams = (s, n = 4) => { const set = new Set(); for (let i = 0; i + n <= s.length; i++) set.add(s.slice(i, i + n)); return set; };

export function similarity(a, b) {
  const A = grams(norm(a)), B = grams(norm(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / Math.min(A.size, B.size);
}

// Returns a map sourceId -> originId. Sources sharing an originId count as ONE independent source.
export function groupOrigins(sources, threshold = 0.6) {
  const origin = new Map();
  const reps = [];
  for (const s of sources) {
    const text = (s.excerpt || '').slice(0, 400);
    const match = text.length >= 40 ? reps.find(r => similarity(r.text, text) >= threshold) : null;
    if (match) origin.set(s.id, match.id);
    else { origin.set(s.id, s.id); reps.push({id: s.id, text}); }
  }
  return origin;
}
