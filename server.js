import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, dayOf, todayStr, addDays, DEFAULT_PATTERN, tx } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ALLOW_LOCAL = process.env.ALLOW_LOCAL === '1';
const SESSION_DAYS = 30;
const OFFER_ACTIVE_DAYS = 7;

// ---------- optional geoip ----------
let geoip = null;
try { geoip = (await import('geoip-lite')).default; } catch { /* optional */ }

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, code, obj, headers = {}) {
  const body = obj === undefined ? '' : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function jsonBody(req) { try { return JSON.parse(await readBody(req) || '{}'); } catch { return {}; } }
const str = (v, n = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, n);
const safeURL = (u) => { try { return new URL(u); } catch { return null; } };
const hostOf = (u) => { const x = safeURL(u); return x ? x.hostname.toLowerCase().replace(/^www\./, '') : ''; };
const normHost = (h) => str(h, 255).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^www\./, '');

function hashPass(p) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(p, salt, 32).toString('hex'); }
function checkPass(p, stored) {
  const [salt, h] = String(stored).split(':'); if (!salt || !h) return false;
  const a = crypto.scryptSync(p, salt, 32), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

// ---------- bootstrap admin ----------
if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
  const u = process.env.ADMIN_USER || 'admin', p = process.env.ADMIN_PASS || 'admin123';
  db.prepare('INSERT INTO users(username,name,pass,role,created_at) VALUES(?,?,?,?,?)').run(u, 'Quản trị viên', hashPass(p), 'admin', Date.now());
  console.log(`\n[!] Đã tạo tài khoản admin mặc định: ${u} / ${p}  -> hãy đổi mật khẩu sau khi đăng nhập.\n`);
}

// ---------- tracking ----------
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch/i;
const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|naver|seznam|qwant|coccoc|ask|aol|brave|startpage)\./i;
const PAID_MED = /^(cpc|ppc|paid|paidsearch|paid_search|paid-search|cpm|cpv|ads?|display|sem|search_ads)$/i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t\.co|twitter|x|linkedin|pinterest|reddit|tiktok|youtube|zalo|telegram|whatsapp|messenger|threads)\./i;

function classify(land, ref) {
  const p = land ? land.searchParams : new URLSearchParams();
  const g = (k) => str(p.get(k), 200);
  let source = g('utm_source').toLowerCase(), medium = g('utm_medium').toLowerCase();
  const campaign = g('utm_campaign') || g('gad_campaignid') || g('utm_id') || g('campaignid');
  let keyword = (g('utm_term') || g('keyword')).toLowerCase().replace(/\s+/g, ' ');
  if (/^\{.*\}$/.test(keyword)) keyword = '';
  const refHost = hostOf(ref);
  let channel;
  if (p.has('gad_source') || p.has('gclid') || p.has('gbraid') || p.has('wbraid') || p.has('dclid') || p.has('msclkid') || PAID_MED.test(medium)) {
    channel = 'ads'; if (!source) source = p.has('msclkid') ? 'bing' : 'google';
  } else if (refHost && SEARCH.test(refHost + '.')) {
    channel = 'organic'; if (!source) source = (refHost.match(SEARCH) || [])[2] || refHost;
  } else if (!refHost && !source) {
    channel = 'direct'; source = '(direct)';
  } else {
    channel = 'other'; if (!source) source = refHost || '(không rõ)';
    if (!medium && SOCIAL.test(refHost + '.')) medium = 'social';
  }
  return { channel, source, medium, campaign, keyword };
}
function deviceOf(ua) { if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet'; if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua)) return 'mobile'; return 'desktop'; }
function clientIP(req) { return str((req.headers['x-forwarded-for'] || '').split(',')[0], 64) || req.socket.remoteAddress || ''; }
function countryOf(req) {
  const h = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['cloudfront-viewer-country'] || req.headers['x-country-code'] || req.headers['x-appengine-country'];
  if (h && /^[A-Z]{2}$/i.test(h) && h.toUpperCase() !== 'XX') return h.toUpperCase();
  if (geoip) { const r = geoip.lookup(clientIP(req).replace(/^::ffff:/, '')); if (r && r.country) return r.country; }
  return '';
}

const patternCache = new Map();
function storeFromPath(pattern, pathname) {
  const src = pattern || DEFAULT_PATTERN;
  let re = patternCache.get(src);
  if (!re) { try { re = new RegExp(src, 'i'); } catch { re = new RegExp(DEFAULT_PATTERN, 'i'); } patternCache.set(src, re); }
  let pth = pathname; try { pth = decodeURIComponent(pathname); } catch { }
  const m = re.exec(pth);
  return m ? (m[1] || m[0]) : '';
}

const Q = {
  domainByKey: db.prepare('SELECT * FROM domains WHERE site_key=?'),
  storeGet: db.prepare('SELECT * FROM stores WHERE domain_id=? AND slug=?'),
  storeIns: db.prepare('INSERT INTO stores(domain_id,slug,name,url,page_url,created_at) VALUES(?,?,?,?,?,?)'),
  storeUpd: db.prepare('UPDATE stores SET name=?, url=?, page_url=? WHERE id=?'),
  visitIns: db.prepare(`INSERT OR IGNORE INTO visits(id,domain_id,store_id,visitor,ts,day,channel,source,medium,campaign,keyword,country,device,entry,url,referrer)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  visitGet: db.prepare('SELECT id,domain_id,store_id,clicks,copies FROM visits WHERE id=?'),
  offerUp: db.prepare(`INSERT INTO offers(store_id,okey,title,type,last_seen) VALUES(?,?,?,?,?)
                       ON CONFLICT(store_id,okey) DO UPDATE SET last_seen=excluded.last_seen,
                       title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE offers.title END,
                       type=CASE WHEN excluded.type<>'' THEN excluded.type ELSE offers.type END`),
  evIns: db.prepare('INSERT INTO events(visit_id,store_id,ts,type,offer,position) VALUES(?,?,?,?,?,?)'),
  clickInc: db.prepare('UPDATE visits SET clicks=clicks+1 WHERE id=?'),
  copyInc: db.prepare('UPDATE visits SET copies=copies+1 WHERE id=?'),
};

function handlePV(dom, d, req) {
  const u = safeURL(d.u); if (!u) return;
  const s = d.s && typeof d.s === 'object' ? d.s : {};
  let slug = str(s.slug, 120) || storeFromPath(dom.store_pattern, u.pathname);
  slug = str(slug, 120).toLowerCase(); if (!slug) return;
  const name = str(s.name, 120), surl = str(s.url, 300);
  const pageUrl = u.origin + u.pathname;
  const now = Date.now();
  tx(() => {
    let st = Q.storeGet.get(dom.id, slug);
    if (!st) { const r = Q.storeIns.run(dom.id, slug, name || slug, surl, pageUrl, now); st = { id: Number(r.lastInsertRowid) }; }
    else if ((name && !st.name) || (name && st.name === st.slug) || (surl && !st.url) || st.page_url !== pageUrl) {
      Q.storeUpd.run((st.name && st.name !== st.slug) ? st.name : (name || st.name), st.url || surl, pageUrl, st.id);
    }
    const land = d.l && typeof d.l === 'object' ? d.l : { u: d.u, r: d.r };
    const landURL = safeURL(land.u) || u;
    const a = classify(landURL, str(land.r, 1000));
    const ref = str(d.r, 1000);
    const entry = hostOf(ref) !== hostOf(u.href) ? 1 : 0;
    const ua = req.headers['user-agent'] || '';
    Q.visitIns.run(str(d.v, 40), dom.id, st.id, str(d.vid, 40), now, dayOf(now), a.channel, a.source, a.medium, a.campaign, a.keyword,
      countryOf(req), deviceOf(ua), entry, str(u.href, 1000), ref);
    if (Array.isArray(d.o)) for (const o of d.o.slice(0, 100)) {
      const k = str(o && o.id, 100); if (k) Q.offerUp.run(st.id, k, str(o.title, 200), str(o.type, 20), now);
    }
  });
}
function handleEvent(dom, d) {
  const v = Q.visitGet.get(str(d.v, 40));
  if (!v || v.domain_id !== dom.id) return;
  const type = d.t === 'copy' ? 'copy' : 'click';
  if ((type === 'click' ? v.clicks : v.copies) >= 50) return; // chống spam
  const okey = str(d.of, 100), now = Date.now();
  tx(() => {
    Q.evIns.run(v.id, v.store_id, now, type, okey, str(d.p, 60));
    (type === 'click' ? Q.clickInc : Q.copyInc).run(v.id);
    if (okey) Q.offerUp.run(v.store_id, okey, str(d.ot, 200), str(d.ty, 20), now);
  });
}
async function collect(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    const d = JSON.parse(await readBody(req, 32768));
    const dom = Q.domainByKey.get(str(d.k, 64));
    const ua = req.headers['user-agent'] || '';
    if (dom && dom.active && !BOT.test(ua)) {
      const h = hostOf(d.u);
      const okHost = h === dom.host || h.endsWith('.' + dom.host) || (ALLOW_LOCAL && /^(localhost|127\.0\.0\.1)$/.test(h));
      // pageview phải đến từ đúng domain; click/copy gắn với visit đã được xác thực khi pageview
      if (d.t === 'pv') { if (okHost) handlePV(dom, d, req); }
      else if (d.t === 'click' || d.t === 'copy') handleEvent(dom, d);
    }
  } catch (e) { if (process.env.DEBUG) console.error('collect', e); }
  res.writeHead(204, cors); res.end();
}

// ---------- filters ----------
const CHANNELS = ['ads', 'organic', 'direct', 'other'];
function rangeOf(q) {
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
function parseFilter(q) {
  const { from, to } = rangeOf(q);
  return { from, to, domain: +q.get('domain') || 0, store: +q.get('store') || 0, channel: q.get('channel') || 'all', country: str(q.get('country'), 2).toUpperCase() };
}
function where(f, a = 'v') {
  const w = [`${a}.day BETWEEN ? AND ?`], p = [f.from, f.to];
  if (f.domain) { w.push(`${a}.domain_id=?`); p.push(f.domain); }
  if (f.store) { w.push(`${a}.store_id=?`); p.push(f.store); }
  if (CHANNELS.includes(f.channel)) { w.push(`${a}.channel=?`); p.push(f.channel); }
  if (f.country === '--') w.push(`${a}.country=''`);
  else if (f.country) { w.push(`${a}.country=?`); p.push(f.country); }
  return { w: w.join(' AND '), p };
}
function daysBetween(from, to) { const out = []; for (let d = to; d >= from && out.length < 400; d = addDays(d, -1)) out.push(d); return out; }

// ---------- API handlers ----------
function storesList(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  const since = Date.now() - OFFER_ACTIVE_DAYS * 864e5;
  const rows = db.prepare(`
    WITH agg AS (SELECT store_id, COUNT(*) visits, SUM(channel='ads') ads, SUM(clicks>0) clicked, SUM(clicks) clicks, SUM(copies) copies
                 FROM visits v WHERE ${w} GROUP BY store_id),
    cc AS (SELECT store_id, country, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY COUNT(*) DESC) rn
           FROM visits v WHERE ${w} AND country<>'' GROUP BY store_id, country),
    oo AS (SELECT store_id, COUNT(*) offers FROM offers WHERE last_seen>=? GROUP BY store_id)
    SELECT s.id, s.slug, s.name, s.url, s.page_url, s.domain_id, d.host, d.name domain_name,
      COALESCE(a.visits,0) visits, COALESCE(a.ads,0) ads, COALESCE(a.clicked,0) clicked, COALESCE(a.clicks,0) clicks,
      COALESCE(a.copies,0) copies, COALESCE(cc.country,'') country, COALESCE(oo.offers,0) offers
    FROM stores s JOIN domains d ON d.id=s.domain_id
    LEFT JOIN agg a ON a.store_id=s.id LEFT JOIN cc ON cc.store_id=s.id AND cc.rn=1 LEFT JOIN oo ON oo.store_id=s.id
    WHERE ${f.domain ? 's.domain_id=?' : '1'}`).all(...p, ...p, since, ...(f.domain ? [f.domain] : []));
  let list = rows.map((r) => ({ ...r, rate: r.visits ? r.clicked / r.visits : 0 }));
  const kw = str(q.get('q'), 100).toLowerCase();
  if (kw) list = list.filter((r) => (r.name + ' ' + r.slug + ' ' + r.url + ' ' + r.host).toLowerCase().includes(kw));
  if (q.get('active') !== '0') list = list.filter((r) => r.visits > 0);
  const sort = ['name', 'visits', 'ads', 'rate', 'clicks', 'copies', 'country', 'offers', 'host'].includes(q.get('sort')) ? q.get('sort') : 'visits';
  const dir = q.get('dir') === 'asc' ? 1 : -1;
  list.sort((a, b) => { const x = a[sort], y = b[sort]; const c = typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y; return c * dir || (b.visits - a.visits); });
  const totals = list.reduce((t, r) => { t.visits += r.visits; t.ads += r.ads; t.clicked += r.clicked; t.clicks += r.clicks; t.copies += r.copies; return t; }, { visits: 0, ads: 0, clicked: 0, clicks: 0, copies: 0 });
  const per = Math.min(Math.max(+q.get('per') || 10, 1), 500), page = Math.max(+q.get('page') || 1, 1);
  return { from: f.from, to: f.to, total: list.length, page, per, totals, rows: list.slice((page - 1) * per, page * per) };
}

function storeDetail(id, q) {
  const s = db.prepare('SELECT s.*, d.host, d.name domain_name FROM stores s JOIN domains d ON d.id=s.domain_id WHERE s.id=?').get(id);
  if (!s) return null;
  const f = { ...parseFilter(q), store: id, domain: 0 }; const { w, p } = where(f);
  const all = (sql) => db.prepare(sql).all(...p);
  const kpi = db.prepare(`SELECT COUNT(*) visits, COALESCE(SUM(entry),0) entries, COALESCE(SUM(clicks>0),0) clicked, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(copies),0) copies FROM visits v WHERE ${w}`).get(...p);
  kpi.offers = db.prepare('SELECT COUNT(*) n FROM offers WHERE store_id=? AND last_seen>=?').get(id, Date.now() - OFFER_ACTIVE_DAYS * 864e5).n;
  const grp = `COUNT(*) visits, SUM(entry) entries, SUM(clicks>0) clicked, SUM(clicks) clicks, SUM(copies) copies`;
  const byDayRows = all(`SELECT day, ${grp} FROM visits v WHERE ${w} GROUP BY day`);
  const m = new Map(byDayRows.map((r) => [r.day, r]));
  return {
    store: s, from: f.from, to: f.to, kpi,
    byPosition: all(`SELECT e.position, COUNT(DISTINCT CASE WHEN e.type='click' THEN e.visit_id END) clicked, SUM(e.type='click') clicks, SUM(e.type='copy') copies
                     FROM events e JOIN visits v ON v.id=e.visit_id WHERE ${w} GROUP BY e.position ORDER BY clicks DESC`),
    bySource: all(`SELECT channel, source, ${grp} FROM visits v WHERE ${w} GROUP BY channel, source ORDER BY visits DESC LIMIT 50`),
    byCountry: all(`SELECT country, ${grp} FROM visits v WHERE ${w} GROUP BY country ORDER BY visits DESC LIMIT 100`),
    byKeyword: all(`SELECT campaign, keyword, ${grp} FROM visits v WHERE ${w} AND keyword<>'' GROUP BY campaign, keyword ORDER BY visits DESC LIMIT 100`),
    byOffer: db.prepare(`SELECT e.offer okey, COALESCE(o.title,'') title, COALESCE(o.type,'') type, SUM(e.type='click') clicks, SUM(e.type='copy') copies
                     FROM events e JOIN visits v ON v.id=e.visit_id LEFT JOIN offers o ON o.store_id=e.store_id AND o.okey=e.offer
                     WHERE ${w} AND e.offer<>'' GROUP BY e.offer ORDER BY copies DESC, clicks DESC LIMIT 100`).all(...p),
    byDevice: all(`SELECT device, ${grp} FROM visits v WHERE ${w} GROUP BY device ORDER BY visits DESC`),
    byDay: daysBetween(f.from, f.to).map((d) => m.get(d) || { day: d, visits: 0, entries: 0, clicked: 0, clicks: 0, copies: 0 }),
  };
}

function keywords(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  let rows = db.prepare(`SELECT v.store_id, s.name store_name, s.slug, d.host, v.campaign, v.keyword, COUNT(*) visits, SUM(v.clicks>0) clicked, SUM(v.clicks) clicks, SUM(v.copies) copies
    FROM visits v JOIN stores s ON s.id=v.store_id JOIN domains d ON d.id=v.domain_id
    WHERE ${w} AND v.keyword<>'' GROUP BY v.store_id, v.campaign, v.keyword ORDER BY visits DESC LIMIT 5000`).all(...p);
  const kw = str(q.get('q'), 100).toLowerCase();
  if (kw) rows = rows.filter((r) => (r.keyword + ' ' + r.store_name + ' ' + r.campaign).toLowerCase().includes(kw));
  return { from: f.from, to: f.to, rows };
}

function overview(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  const len = daysBetween(f.from, f.to).length;
  const prev = { ...f, from: addDays(f.from, -len), to: addDays(f.from, -1) }; const pw = where(prev);
  const k = (W, P) => db.prepare(`SELECT COUNT(*) visits, COALESCE(SUM(channel='ads'),0) ads, COALESCE(SUM(clicks>0),0) clicked, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(copies),0) copies FROM visits v WHERE ${W}`).get(...P);
  const grp = `COUNT(*) visits, SUM(clicks>0) clicked, SUM(clicks) clicks, SUM(copies) copies`;
  const dayRows = db.prepare(`SELECT day, ${grp} FROM visits v WHERE ${w} GROUP BY day`).all(...p);
  const m = new Map(dayRows.map((r) => [r.day, r]));
  return {
    from: f.from, to: f.to, kpi: k(w, p), prev: k(pw.w, pw.p),
    byDomain: db.prepare(`SELECT d.id, d.name, d.host, ${grp}
      FROM visits v JOIN domains d ON d.id=v.domain_id WHERE ${w} GROUP BY d.id ORDER BY visits DESC`).all(...p),
    byChannel: db.prepare(`SELECT channel, ${grp} FROM visits v WHERE ${w} GROUP BY channel ORDER BY visits DESC`).all(...p),
    topStores: db.prepare(`SELECT s.id, s.name, s.slug, d.host, ${grp} FROM visits v JOIN stores s ON s.id=v.store_id JOIN domains d ON d.id=v.domain_id WHERE ${w} GROUP BY s.id ORDER BY visits DESC LIMIT 8`).all(...p),
    topKeywords: db.prepare(`SELECT keyword, ${grp} FROM visits v WHERE ${w} AND keyword<>'' GROUP BY keyword ORDER BY visits DESC LIMIT 8`).all(...p),
    byDay: daysBetween(f.from, f.to).reverse().map((d) => m.get(d) || { day: d, visits: 0, clicked: 0, clicks: 0, copies: 0 }),
  };
}

function countries(q) {
  const f = { ...parseFilter(q), channel: 'all', country: '' }; const { w, p } = where(f);
  return db.prepare(`SELECT country, COUNT(*) visits FROM visits v WHERE ${w} GROUP BY country ORDER BY visits DESC`).all(...p);
}

function domainsList() {
  const since = dayOf(Date.now() - 7 * 864e5);
  return db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM stores s WHERE s.domain_id=d.id) stores,
      (SELECT COUNT(*) FROM visits v WHERE v.domain_id=d.id AND v.day>=?) visits7,
      (SELECT MAX(ts) FROM visits v WHERE v.domain_id=d.id) last_hit
    FROM domains d ORDER BY d.name COLLATE NOCASE`).all(since);
}
function validPattern(p) { if (!p) return true; try { new RegExp(p); return true; } catch { return false; } }

// ---------- router ----------
const routes = [];
function route(method, pattern, auth, handler) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, handler });
}

route('POST', '/api/login', false, async (req, res) => {
  const b = await jsonBody(req);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(str(b.username, 80));
  if (!u || !checkPass(str(b.password, 200), u.pass)) { await new Promise((r) => setTimeout(r, 600)); return send(res, 401, { error: 'Sai tài khoản hoặc mật khẩu' }); }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(token, u.id, Date.now() + SESSION_DAYS * 864e5);
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` });
});
route('POST', '/api/logout', true, (req, res, ctx) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(ctx.token);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
});
route('GET', '/api/me', true, (req, res, ctx) => send(res, 200, { id: ctx.user.id, username: ctx.user.username, name: ctx.user.name, role: ctx.user.role }));
route('POST', '/api/me/password', true, async (req, res, ctx) => {
  const b = await jsonBody(req);
  if (!checkPass(str(b.old, 200), ctx.user.pass)) return send(res, 400, { error: 'Mật khẩu hiện tại không đúng' });
  if (str(b.new, 200).length < 6) return send(res, 400, { error: 'Mật khẩu mới tối thiểu 6 ký tự' });
  db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(str(b.new, 200)), ctx.user.id);
  send(res, 200, { ok: true });
});

route('GET', '/api/overview', true, (req, res, ctx) => send(res, 200, overview(ctx.q)));
route('GET', '/api/stores', true, (req, res, ctx) => send(res, 200, storesList(ctx.q)));
route('GET', '/api/stores/:id/detail', true, (req, res, ctx) => { const r = storeDetail(+ctx.params.id, ctx.q); r ? send(res, 200, r) : send(res, 404, { error: 'Không tìm thấy' }); });
route('PUT', '/api/stores/:id', 'admin', async (req, res, ctx) => {
  const b = await jsonBody(req);
  db.prepare('UPDATE stores SET name=?, url=? WHERE id=?').run(str(b.name, 120), str(b.url, 300), +ctx.params.id);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/stores/:id', 'admin', (req, res, ctx) => { db.prepare('DELETE FROM stores WHERE id=?').run(+ctx.params.id); send(res, 200, { ok: true }); });
route('GET', '/api/keywords', true, (req, res, ctx) => send(res, 200, keywords(ctx.q)));
route('GET', '/api/countries', true, (req, res, ctx) => send(res, 200, countries(ctx.q)));

route('GET', '/api/domains', true, (req, res) => send(res, 200, domainsList()));
route('POST', '/api/domains', 'admin', async (req, res) => {
  const b = await jsonBody(req);
  const host = normHost(b.host); const name = str(b.name, 100) || host;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && host !== 'localhost') return send(res, 400, { error: 'Domain không hợp lệ (vd: example.com)' });
  if (db.prepare('SELECT 1 FROM domains WHERE host=?').get(host)) return send(res, 400, { error: 'Domain này đã tồn tại' });
  const pattern = str(b.store_pattern, 300);
  if (!validPattern(pattern)) return send(res, 400, { error: 'Mẫu URL (regex) không hợp lệ' });
  const key = crypto.randomBytes(9).toString('base64url');
  const r = db.prepare('INSERT INTO domains(name,host,site_key,store_pattern,active,created_at) VALUES(?,?,?,?,1,?)').run(name, host, key, pattern, Date.now());
  send(res, 200, db.prepare('SELECT * FROM domains WHERE id=?').get(r.lastInsertRowid));
});
route('PUT', '/api/domains/:id', 'admin', async (req, res, ctx) => {
  const b = await jsonBody(req); const id = +ctx.params.id;
  const cur = db.prepare('SELECT * FROM domains WHERE id=?').get(id); if (!cur) return send(res, 404, { error: 'Không tìm thấy' });
  const host = b.host !== undefined ? normHost(b.host) : cur.host;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && host !== 'localhost') return send(res, 400, { error: 'Domain không hợp lệ' });
  if (db.prepare('SELECT 1 FROM domains WHERE host=? AND id<>?').get(host, id)) return send(res, 400, { error: 'Domain này đã tồn tại' });
  const pattern = b.store_pattern !== undefined ? str(b.store_pattern, 300) : cur.store_pattern;
  if (!validPattern(pattern)) return send(res, 400, { error: 'Mẫu URL (regex) không hợp lệ' });
  db.prepare('UPDATE domains SET name=?, host=?, store_pattern=?, active=? WHERE id=?')
    .run(str(b.name, 100) || cur.name, host, pattern, b.active === undefined ? cur.active : (b.active ? 1 : 0), id);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/domains/:id', 'admin', (req, res, ctx) => { db.prepare('DELETE FROM domains WHERE id=?').run(+ctx.params.id); send(res, 200, { ok: true }); });

route('GET', '/api/users', 'admin', (req, res) => send(res, 200, db.prepare('SELECT id,username,name,role,created_at FROM users ORDER BY id').all()));
route('POST', '/api/users', 'admin', async (req, res) => {
  const b = await jsonBody(req); const u = str(b.username, 80).toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(u)) return send(res, 400, { error: 'Tên đăng nhập tối thiểu 3 ký tự (a-z, 0-9, . _ -)' });
  if (str(b.password, 200).length < 6) return send(res, 400, { error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) return send(res, 400, { error: 'Tên đăng nhập đã tồn tại' });
  db.prepare('INSERT INTO users(username,name,pass,role,created_at) VALUES(?,?,?,?,?)').run(u, str(b.name, 100), hashPass(str(b.password, 200)), b.role === 'admin' ? 'admin' : 'viewer', Date.now());
  send(res, 200, { ok: true });
});
route('PUT', '/api/users/:id', 'admin', async (req, res, ctx) => {
  const b = await jsonBody(req); const id = +ctx.params.id;
  if (b.password) { if (str(b.password, 200).length < 6) return send(res, 400, { error: 'Mật khẩu tối thiểu 6 ký tự' }); db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(str(b.password, 200)), id); }
  if (b.role && id !== ctx.user.id) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role === 'admin' ? 'admin' : 'viewer', id);
  if (b.name !== undefined) db.prepare('UPDATE users SET name=? WHERE id=?').run(str(b.name, 100), id);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/users/:id', 'admin', (req, res, ctx) => {
  if (+ctx.params.id === ctx.user.id) return send(res, 400, { error: 'Không thể xoá chính mình' });
  db.prepare('DELETE FROM users WHERE id=?').run(+ctx.params.id); send(res, 200, { ok: true });
});

function serveStatic(req, res, pathname) {
  let file = pathname === '/' ? '/index.html' : pathname;
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(full, (err, st) => {
    const target = (!err && st.isFile()) ? full : path.join(PUBLIC, 'index.html');
    const ext = path.extname(target);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (pathname === '/t.js') Object.assign(headers, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
    else headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers); fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/collect') return await collect(req, res);
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname); if (!m) continue;
      const ctx = { q: url.searchParams, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      if (r.auth) {
        const token = cookies(req).sid || '';
        const u = token && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(token, Date.now());
        if (!u) return send(res, 401, { error: 'Chưa đăng nhập' });
        if (r.auth === 'admin' && u.role !== 'admin') return send(res, 403, { error: 'Bạn không có quyền thực hiện thao tác này' });
        ctx.user = u; ctx.token = token;
      }
      return await r.handler(req, res, ctx);
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e); if (!res.headersSent) send(res, 500, { error: 'Lỗi máy chủ' });
  }
});
server.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`Dashboard đang chạy: http://localhost:${PORT}${geoip ? '' : '  (chưa có geoip-lite: quốc gia lấy từ header Cloudflare)'}`));
