// Truy vấn thống kê: Bảng điều khiển, Hiệu quả cửa hàng, Chi tiết, Từ khoá
import { db, todayStr, addDays } from './db.js';

export const OFFER_SEEN_DAYS = 7;
export const ONLINE_MS = 5 * 60e3;
const CHANNELS = ['ads', 'organic', 'direct', 'other'];
const str = (v, n = 200) => (v == null ? '' : String(v)).trim().slice(0, n);

export function rangeOf(q) {
  const t = todayStr(), r = q.get('range') || '7d';
  if (r === 'custom') {
    const f = q.get('from'), to = q.get('to');
    if (/^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(to)) return f <= to ? { from: f, to } : { from: to, to: f };
  }
  if (r === 'today') return { from: t, to: t };
  if (r === 'yesterday') { const y = addDays(t, -1); return { from: y, to: y }; }
  if (r === 'thismonth') return { from: t.slice(0, 8) + '01', to: t };
  if (r === 'lastmonth') { const end = addDays(t.slice(0, 8) + '01', -1); return { from: end.slice(0, 8) + '01', to: end }; }
  const n = { '14d': 14, '30d': 30, '90d': 90 }[r] || 7;
  return { from: addDays(t, -n), to: addDays(t, -1) };
}
export function parseFilter(q) {
  const { from, to } = rangeOf(q);
  return { from, to, domain: +q.get('domain') || 0, store: +q.get('store') || 0, group: str(q.get('group'), 60), channel: q.get('channel') || 'all', country: str(q.get('country'), 2).toUpperCase() };
}
function where(f, { storeOnly = false } = {}) {
  const w = ['v.day BETWEEN ? AND ?'], p = [f.from, f.to];
  if (f.domain) { w.push('v.domain_id=?'); p.push(f.domain); }
  else if (f.group) { w.push('v.domain_id IN (SELECT id FROM domains WHERE category=?)'); p.push(f.group); }
  if (f.store) { w.push('v.store_id=?'); p.push(f.store); }
  else if (storeOnly) w.push('v.store_id IS NOT NULL');
  if (CHANNELS.includes(f.channel)) { w.push('v.channel=?'); p.push(f.channel); }
  if (f.country === '--') w.push("v.country=''");
  else if (f.country) { w.push('v.country=?'); p.push(f.country); }
  return { w: w.join(' AND '), p };
}
const daysBetween = (from, to) => { const out = []; for (let d = to; d >= from && out.length < 2000; d = addDays(d, -1)) out.push(d); return out; };
const GRP = 'COUNT(*) visits, COALESCE(SUM(v.entry),0) entries, COALESCE(SUM(v.clicks>0),0) clicked, COALESCE(SUM(v.clicks),0) clicks, COALESCE(SUM(v.copies),0) copies';

/** Điều kiện "ưu đãi đang chạy": đang bật, trong thời hạn, và (nhập tay hoặc vừa thấy trên trang trong 7 ngày) */
export function activeOfferSQL(alias = 'o') {
  return `${alias}.status='active' AND (${alias}.expires IS NULL OR ${alias}.expires='' OR ${alias}.expires>=?) AND (${alias}.starts IS NULL OR ${alias}.starts='' OR ${alias}.starts<=?)
    AND (${alias}.source='manual' OR ${alias}.last_seen>=?)`;
}
export const activeOfferParams = () => { const t = todayStr(); return [t, t, Date.now() - OFFER_SEEN_DAYS * 864e5]; };

export function storePerformance(q) {
  const f = parseFilter(q); const { w, p } = where(f, { storeOnly: true });
  const scope = f.domain ? ['s.domain_id=?', [f.domain]] : f.group ? ['d.category=?', [f.group]] : ['1', []];
  const rows = db.prepare(`
    WITH agg AS (SELECT v.store_id, COUNT(*) visits, SUM(v.channel='ads') ads, SUM(v.clicks>0) clicked, SUM(v.clicks) clicks, SUM(v.copies) copies
                 FROM visits v WHERE ${w} GROUP BY v.store_id),
    cc AS (SELECT v.store_id, v.country, ROW_NUMBER() OVER (PARTITION BY v.store_id ORDER BY COUNT(*) DESC) rn
           FROM visits v WHERE ${w} AND v.country<>'' GROUP BY v.store_id, v.country),
    oo AS (SELECT o.store_id, COUNT(*) offers FROM offers o WHERE ${activeOfferSQL()} GROUP BY o.store_id)
    SELECT s.id, s.slug, s.name, s.url, s.page_url, s.status, s.domain_id, d.host, d.name domain_name, d.store_path,
      COALESCE(a.visits,0) visits, COALESCE(a.ads,0) ads, COALESCE(a.clicked,0) clicked, COALESCE(a.clicks,0) clicks,
      COALESCE(a.copies,0) copies, COALESCE(cc.country,'') country, COALESCE(oo.offers,0) offers
    FROM stores s JOIN domains d ON d.id=s.domain_id
    LEFT JOIN agg a ON a.store_id=s.id LEFT JOIN cc ON cc.store_id=s.id AND cc.rn=1 LEFT JOIN oo ON oo.store_id=s.id
    WHERE ${scope[0]}`).all(...p, ...p, ...activeOfferParams(), ...scope[1]);
  let list = rows.map((r) => ({ ...r, rate: r.visits ? r.clicked / r.visits : 0, open_url: storeLink(r) }));
  const kw = str(q.get('q'), 100).toLowerCase();
  if (kw) list = list.filter((r) => (r.name + ' ' + r.slug + ' ' + r.url + ' ' + r.host).toLowerCase().includes(kw));
  if (q.get('active') !== '0') list = list.filter((r) => r.visits > 0);
  const sort = ['name', 'visits', 'ads', 'rate', 'clicks', 'copies', 'country', 'offers', 'host'].includes(q.get('sort')) ? q.get('sort') : 'visits';
  const dir = q.get('dir') === 'asc' ? 1 : -1;
  list.sort((a, b) => { const x = a[sort], y = b[sort]; const c = typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y; return c * dir || (b.visits - a.visits); });
  const per = Math.min(Math.max(+q.get('per') || 10, 1), 500), page = Math.max(+q.get('page') || 1, 1);
  return { from: f.from, to: f.to, total: list.length, page, per, rows: list.slice((page - 1) * per, page * per) };
}
export function storeLink(s) {
  if (s.page_url) return s.page_url;
  return 'https://' + s.host + (s.store_path || '/store/{slug}').replace('{slug}', encodeURIComponent(s.slug));
}

export function storeDetail(id, q) {
  const s = db.prepare('SELECT s.*, d.host, d.name domain_name, d.store_path FROM stores s JOIN domains d ON d.id=s.domain_id WHERE s.id=?').get(id);
  if (!s) return null;
  s.open_url = storeLink(s);
  const f = { ...parseFilter(q), store: id, domain: 0, group: '' }; const { w, p } = where(f);
  const all = (sql) => db.prepare(sql).all(...p);
  const kpi = db.prepare(`SELECT ${GRP} FROM visits v WHERE ${w}`).get(...p);
  kpi.offers = db.prepare(`SELECT COUNT(*) n FROM offers o WHERE o.store_id=? AND ${activeOfferSQL()}`).get(id, ...activeOfferParams()).n;
  const m = new Map(all(`SELECT v.day, ${GRP} FROM visits v WHERE ${w} GROUP BY v.day`).map((r) => [r.day, r]));
  return {
    store: s, from: f.from, to: f.to, kpi,
    byPosition: all(`SELECT e.position, COUNT(DISTINCT CASE WHEN e.type='click' THEN e.visit_id END) clicked, SUM(e.type='click') clicks, SUM(e.type='copy') copies
                     FROM events e JOIN visits v ON v.id=e.visit_id WHERE ${w} GROUP BY e.position ORDER BY clicks DESC`),
    bySource: all(`SELECT v.channel, v.source, ${GRP} FROM visits v WHERE ${w} GROUP BY v.channel, v.source ORDER BY visits DESC LIMIT 5000`),
    byCountry: all(`SELECT v.country, ${GRP} FROM visits v WHERE ${w} GROUP BY v.country ORDER BY visits DESC`),
    byKeyword: all(`SELECT COALESCE(NULLIF(cn.name,''), v.campaign) campaign, v.campaign cid, v.keyword, ${GRP} FROM visits v LEFT JOIN campaigns cn ON cn.domain_id=v.domain_id AND cn.cid=v.campaign WHERE ${w} AND v.keyword<>'' GROUP BY v.campaign, v.keyword ORDER BY visits DESC LIMIT 5000`),
    byOffer: all(`SELECT e.offer okey, COALESCE(o.title,'') title, COALESCE(o.type,'') type, SUM(e.type='click') clicks, SUM(e.type='copy') copies
                  FROM events e JOIN visits v ON v.id=e.visit_id LEFT JOIN offers o ON o.domain_id=e.domain_id AND o.okey=e.offer
                  WHERE ${w} AND e.offer<>'' GROUP BY e.offer ORDER BY copies DESC, clicks DESC LIMIT 5000`),
    byButton: all(`SELECT e.kind, CASE WHEN e.label<>'' THEN e.label WHEN e.target<>'' THEN e.target ELSE e.position END label, COUNT(*) clicks, COUNT(DISTINCT e.visit_id) clicked
                   FROM events e JOIN visits v ON v.id=e.visit_id WHERE ${w} AND e.type='click' GROUP BY 1, 2 ORDER BY clicks DESC LIMIT 5000`),
    byDevice: all(`SELECT v.device, ${GRP} FROM visits v WHERE ${w} GROUP BY v.device ORDER BY visits DESC`),
    byDay: daysBetween(f.from, f.to).map((d) => m.get(d) || { day: d, visits: 0, entries: 0, clicked: 0, clicks: 0, copies: 0 }),
  };
}

export function keywords(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  return {
    from: f.from, to: f.to,
    rows: db.prepare(`SELECT v.store_id, COALESCE(s.name,'') store_name, COALESCE(s.slug,'') slug, d.host, COALESCE(NULLIF(cn.name,''), v.campaign) campaign, v.campaign cid, v.keyword,
        COUNT(*) visits, SUM(v.clicks>0) clicked, SUM(v.clicks) clicks, SUM(v.copies) copies
      FROM visits v JOIN domains d ON d.id=v.domain_id LEFT JOIN stores s ON s.id=v.store_id LEFT JOIN campaigns cn ON cn.domain_id=v.domain_id AND cn.cid=v.campaign
      WHERE ${w} AND v.keyword<>'' GROUP BY v.domain_id, v.store_id, v.campaign, v.keyword ORDER BY visits DESC LIMIT 100000`).all(...p),
  };
}

export function overview(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  const len = daysBetween(f.from, f.to).length;
  const pw = where({ ...f, from: addDays(f.from, -len), to: addDays(f.from, -1) });
  const k = (W, P) => db.prepare(`SELECT COUNT(*) visits, COALESCE(SUM(v.channel='ads'),0) ads, COALESCE(SUM(v.clicks>0),0) clicked, COALESCE(SUM(v.clicks),0) clicks, COALESCE(SUM(v.copies),0) copies FROM visits v WHERE ${W}`).get(...P);
  const m = new Map(db.prepare(`SELECT v.day, ${GRP} FROM visits v WHERE ${w} GROUP BY v.day`).all(...p).map((r) => [r.day, r]));
  const scope = f.domain ? ['id=?', [f.domain]] : f.group ? ['category=?', [f.group]] : ['1', []];
  const doms = db.prepare(`SELECT * FROM domains WHERE ${scope[0]}`).all(...scope[1]);
  const ids = doms.map((d) => d.id); const inIds = ids.length ? ids.join(',') : '0';
  const now = Date.now();
  const count = (sql, ...a) => db.prepare(sql).get(...a).n;
  return {
    from: f.from, to: f.to, kpi: k(w, p), prev: k(pw.w, pw.p),
    online: count(`SELECT COUNT(DISTINCT visitor) n FROM visits WHERE ts>=? AND domain_id IN (${inIds})`, now - ONLINE_MS),
    counts: {
      domains: doms.length,
      stores: count(`SELECT COUNT(*) n FROM stores WHERE domain_id IN (${inIds})`),
      offers: count(`SELECT COUNT(*) n FROM offers o WHERE o.domain_id IN (${inIds}) AND ${activeOfferSQL()}`, ...activeOfferParams()),
      events: count(`SELECT COUNT(*) n FROM promo_events WHERE domain_id IN (${inIds}) AND status='active' AND (ends IS NULL OR ends='' OR ends>=?)`, todayStr()),
      posts: count(`SELECT COUNT(*) n FROM posts WHERE domain_id IN (${inIds})`),
    },
    health: {
      down: doms.filter((d) => d.active && d.http_checked && !(d.http_status >= 200 && d.http_status < 400)).length,
      ssl: doms.filter((d) => d.ssl_expires && d.ssl_expires - now < 14 * 864e5).length,
      expiring: doms.filter((d) => d.reg_expires && d.reg_expires - now < 30 * 864e5).length,
      notracking: doms.filter((d) => d.active && !db.prepare('SELECT 1 FROM visits WHERE domain_id=? AND ts>=? LIMIT 1').get(d.id, now - 2 * 864e5)).length,
    },
    byChannel: db.prepare(`SELECT v.channel, ${GRP} FROM visits v WHERE ${w} GROUP BY v.channel ORDER BY visits DESC`).all(...p),
    byDomain: db.prepare(`SELECT d.id, d.name, d.host, ${GRP} FROM visits v JOIN domains d ON d.id=v.domain_id WHERE ${w} GROUP BY d.id ORDER BY visits DESC`).all(...p),
    topStores: db.prepare(`SELECT s.id, s.name, s.slug, d.host, ${GRP} FROM visits v JOIN stores s ON s.id=v.store_id JOIN domains d ON d.id=v.domain_id WHERE ${w} GROUP BY s.id ORDER BY visits DESC LIMIT 8`).all(...p),
    topKeywords: db.prepare(`SELECT v.keyword, ${GRP} FROM visits v WHERE ${w} AND v.keyword<>'' GROUP BY v.keyword ORDER BY visits DESC LIMIT 8`).all(...p),
    byDay: daysBetween(f.from, f.to).reverse().map((d) => m.get(d) || { day: d, visits: 0, clicked: 0, clicks: 0, copies: 0 }),
  };
}

export function countries(q) {
  const f = { ...parseFilter(q), channel: 'all', country: '' }; const { w, p } = where(f);
  return db.prepare(`SELECT v.country, COUNT(*) visits FROM visits v WHERE ${w} GROUP BY v.country ORDER BY visits DESC`).all(...p);
}

/** Mọi cú bấm trên domain (cả trang không phải cửa hàng): theo nút + trang. ?limit=0 = tất cả */
export function clicksReport(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  const lim = q.get('limit') === '0' ? 200000 : Math.min(Math.max(+q.get('limit') || 20, 1), 200000);
  const LABEL = "CASE WHEN e.label<>'' THEN e.label WHEN e.target<>'' THEN e.target ELSE e.position END";
  return {
    from: f.from, to: f.to,
    total: db.prepare(`SELECT COUNT(*) clicks, COUNT(DISTINCT e.visit_id) clicked FROM events e JOIN visits v ON v.id=e.visit_id WHERE ${w} AND e.type='click'`).get(...p),
    byKind: db.prepare(`SELECT e.kind, COUNT(*) clicks FROM events e JOIN visits v ON v.id=e.visit_id WHERE ${w} AND e.type='click' GROUP BY e.kind ORDER BY clicks DESC`).all(...p),
    rows: db.prepare(`SELECT e.kind, ${LABEL} label, CASE WHEN e.page<>'' THEN e.page ELSE v.path END page, d.host, COALESCE(s.name,'') store_name,
        COUNT(*) clicks, COUNT(DISTINCT e.visit_id) clicked, MAX(e.ts) last_ts
      FROM events e JOIN visits v ON v.id=e.visit_id JOIN domains d ON d.id=v.domain_id LEFT JOIN stores s ON s.id=v.store_id
      WHERE ${w} AND e.type='click' GROUP BY e.kind, 2, 3, d.id ORDER BY clicks DESC LIMIT ?`).all(...p, lim),
  };
}
