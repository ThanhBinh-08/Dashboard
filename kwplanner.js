// Kế hoạch từ khoá (giống Google Ads Keyword Planner)
// - Có cấu hình Google Ads API -> lượng tìm kiếm/tháng, xu hướng 12 tháng, cạnh tranh, giá thầu đầu trang
// - Chưa cấu hình -> dùng gợi ý tìm kiếm của Google (không có lượng tìm kiếm, chỉ biết Google có gợi ý hay không)
import { db } from './db.js';

const env = (k) => (process.env[k] || '').trim();
const API_VER = () => env('GOOGLE_ADS_API_VERSION') || 'v26';
const CACHE_MS = (+env('KW_CACHE_HOURS') || 24) * 3600e3;
const digits = (s) => s.replace(/\D/g, '');

export function adsConfigured() {
  return !!(env('GOOGLE_ADS_DEVELOPER_TOKEN') && env('GOOGLE_ADS_CLIENT_ID') && env('GOOGLE_ADS_CLIENT_SECRET') && env('GOOGLE_ADS_REFRESH_TOKEN') && env('GOOGLE_ADS_CUSTOMER_ID'));
}

// Mã vị trí & ngôn ngữ của Google Ads (geoTargetConstants / languageConstants)
export const GEO = {
  US: 2840, GB: 2826, CA: 2124, AU: 2036, NZ: 2554, IE: 2372, DE: 2276, FR: 2250, ES: 2724, IT: 2380, NL: 2528, BE: 2056, PT: 2620,
  AT: 2040, CH: 2756, SE: 2752, DK: 2208, NO: 2578, FI: 2246, PL: 2616, RO: 2642, CZ: 2203, TR: 2792, IN: 2356, PK: 2586, PH: 2608,
  SG: 2702, MY: 2458, ID: 2360, TH: 2764, VN: 2704, JP: 2392, KR: 2410, HK: 2344, TW: 2158, AE: 2784, SA: 2682, ZA: 2710, BR: 2076, MX: 2484,
};
export const LANG = { en: 1000, de: 1001, fr: 1002, es: 1003, it: 1004, ja: 1005, nl: 1010, pt: 1014, pl: 1030, ro: 1032, tr: 1037, vi: 1040 };

// ---------- bộ nhớ đệm ----------
const cacheGet = (key) => { const r = db.prepare('SELECT ts, data FROM kw_cache WHERE key=?').get(key); return r && Date.now() - r.ts < CACHE_MS ? { ...JSON.parse(r.data), cached_at: r.ts } : null; };
const cacheSet = (key, data) => {
  db.prepare('INSERT INTO kw_cache(key,ts,data) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET ts=excluded.ts, data=excluded.data').run(key, Date.now(), JSON.stringify(data));
  db.prepare('DELETE FROM kw_cache WHERE ts<?').run(Date.now() - 30 * 864e5);
};

// ---------- Google Ads API ----------
let token = { value: '', exp: 0 };
async function accessToken() {
  if (token.value && Date.now() < token.exp - 60e3) return token.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env('GOOGLE_ADS_CLIENT_ID'), client_secret: env('GOOGLE_ADS_CLIENT_SECRET'), refresh_token: env('GOOGLE_ADS_REFRESH_TOKEN') }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google OAuth lỗi: ' + (j.error_description || j.error || r.status));
  token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.value;
}
async function adsCall(method, body) {
  const cid = digits(env('GOOGLE_ADS_CUSTOMER_ID'));
  const headers = { Authorization: 'Bearer ' + (await accessToken()), 'developer-token': env('GOOGLE_ADS_DEVELOPER_TOKEN'), 'Content-Type': 'application/json' };
  if (env('GOOGLE_ADS_LOGIN_CUSTOMER_ID')) headers['login-customer-id'] = digits(env('GOOGLE_ADS_LOGIN_CUSTOMER_ID'));
  const r = await fetch(`https://googleads.googleapis.com/${API_VER()}/customers/${cid}:${method}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = Array.isArray(j) ? j[0] : j;
    const det = e?.error?.details?.[0]?.errors?.[0]?.message;
    throw new Error('Google Ads API lỗi: ' + (det || e?.error?.message || r.status));
  }
  return j;
}
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
function metricsOf(m = {}) {
  const trend = (m.monthlySearchVolumes || []).map((x) => ({ y: +x.year, m: MONTHS.indexOf(x.month) + 1, v: +x.monthlySearches || 0 }))
    .sort((a, b) => a.y - b.y || a.m - b.m).slice(-12);
  const n = (x) => (x == null ? null : +x);
  // Thay đổi 3 tháng & so với cùng kỳ năm trước (giống cột trong Keyword Planner)
  const last = trend.at(-1)?.v, prev3 = trend.at(-4)?.v, yoy = trend.length >= 12 ? trend[0].v : null;
  return {
    volume: n(m.avgMonthlySearches), competition: m.competition || '', competition_index: n(m.competitionIndex),
    bid_low: m.lowTopOfPageBidMicros != null ? +m.lowTopOfPageBidMicros / 1e6 : null,
    bid_high: m.highTopOfPageBidMicros != null ? +m.highTopOfPageBidMicros / 1e6 : null,
    trend, change3m: prev3 ? (last - prev3) / prev3 : null, changeYoy: yoy ? (last - yoy) / yoy : null,
  };
}
function geoLang(country, lang) {
  const b = { language: `languageConstants/${LANG[lang] || LANG.en}`, keywordPlanNetwork: 'GOOGLE_SEARCH' };
  if (GEO[country]) b.geoTargetConstants = [`geoTargetConstants/${GEO[country]}`];
  return b;
}
async function adsIdeas({ keywords, url, country, lang, limit }) {
  const body = { ...geoLang(country, lang), includeAdultKeywords: false, pageSize: Math.min(limit, 1000) };
  if (keywords.length && url) body.keywordAndUrlSeed = { url, keywords: keywords.slice(0, 20) };
  else if (url) body.urlSeed = { url };
  else body.keywordSeed = { keywords: keywords.slice(0, 20) };
  const j = await adsCall('generateKeywordIdeas', body);
  return (j.results || []).map((r) => ({ keyword: String(r.text || '').toLowerCase(), ...metricsOf(r.keywordIdeaMetrics) }));
}
async function adsHistorical({ keywords, country, lang }) {
  const out = [];
  for (let i = 0; i < keywords.length; i += 1000) {
    const j = await adsCall('generateKeywordHistoricalMetrics', { ...geoLang(country, lang), keywords: keywords.slice(i, i + 1000), includeAdultKeywords: false });
    for (const r of j.results || []) {
      const m = metricsOf(r.keywordMetrics);
      out.push({ keyword: String(r.text || '').toLowerCase(), ...m, variants: r.closeVariants || [] });
    }
  }
  // Từ khoá Google không trả về -> vẫn hiện để biết là không có dữ liệu
  const seen = new Set(out.flatMap((r) => [r.keyword, ...r.variants.map((v) => v.toLowerCase())]));
  keywords.filter((k) => !seen.has(k)).forEach((k) => out.push({ keyword: k, volume: 0, competition: '', trend: [], nodata: true }));
  return out;
}

// ---------- Gợi ý tìm kiếm Google (không cần khoá) ----------
async function suggest(q, country, lang) {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country.toLowerCase())}&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const j = JSON.parse(new TextDecoder('utf-8').decode(await r.arrayBuffer()));
    return (j[1] || []).map((s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim());
  } catch { return []; }
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
const MODIFIERS = ['', ' promo code', ' coupon', ' discount code', ' code', ' voucher', ' deal', ' sale', ' coupon code', ' discount', ' free shipping', ' student discount'];
async function suggestIdeas({ keywords, country, lang, limit }) {
  const queries = new Set();
  keywords.slice(0, 10).forEach((k, i) => {
    MODIFIERS.forEach((m) => queries.add((k + m).trim()));
    if (i === 0) 'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c) => queries.add(k + ' ' + c));
  });
  const res = await pool([...queries], 6, (q) => suggest(q, country, lang));
  const score = new Map(); // số lần xuất hiện + thứ hạng -> độ phổ biến tương đối
  res.forEach((list) => list.forEach((s, i) => score.set(s, (score.get(s) || 0) + (10 - Math.min(i, 9)))));
  keywords.forEach((k) => { if (!score.has(k)) score.set(k, 0); });
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([keyword, sc]) => ({ keyword, volume: null, popularity: sc, suggested: sc > 0 }));
}
async function suggestCheck({ keywords, country, lang }) {
  const res = await pool(keywords, 6, (k) => suggest(k, country, lang));
  // Google chỉ trả các câu "đang hoàn thành" -> từ khoá có gợi ý nếu trùng hẳn hoặc là đầu của câu gợi ý
  return keywords.map((k, i) => {
    const list = res[i], at = list.findIndex((x) => x === k || x.startsWith(k + ' '));
    return { keyword: k, volume: null, suggested: at >= 0, popularity: at >= 0 ? Math.min(10, list.length) - Math.min(at, 9) : 0, related: list.filter((x) => x !== k).slice(0, 5) };
  });
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
/** mode: 'ideas' (tìm ý tưởng) | 'check' (kiểm tra danh sách từ khoá) */
export async function planKeywords({ mode, keywords, url, country, lang, limit, fresh }) {
  keywords = [...new Set((keywords || []).map(norm).filter(Boolean))].slice(0, mode === 'check' ? 2000 : 20);
  url = /^https?:\/\//i.test(url || '') ? String(url).slice(0, 500) : '';
  country = /^[A-Z]{2}$/.test(country || '') ? country : '';
  lang = LANG[lang] ? lang : 'en';
  limit = Math.min(Math.max(+limit || 300, 10), 1000);
  if (!keywords.length && !(mode === 'ideas' && url)) throw new Error('Hãy nhập ít nhất một từ khoá' + (mode === 'ideas' ? ' hoặc URL' : ''));
  const source = adsConfigured() ? 'ads' : 'suggest';
  const key = JSON.stringify([source, mode, keywords, url, country, lang, limit]);
  if (!fresh) { const c = cacheGet(key); if (c) return c; }
  let rows;
  if (source === 'ads') rows = mode === 'check' ? await adsHistorical({ keywords, country, lang }) : await adsIdeas({ keywords, url, country, lang, limit });
  else rows = mode === 'check' ? await suggestCheck({ keywords, country, lang }) : await suggestIdeas({ keywords, country, lang, limit });
  const data = { source, mode, country, lang, rows, currency: env('GOOGLE_ADS_CURRENCY') || '' };
  cacheSet(key, data);
  return { ...data, cached_at: null };
}
