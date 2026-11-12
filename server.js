import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, dayOf, tx, slugify } from './db.js';
import { startMonitor, checkDomain } from './monitor.js';
import { storePerformance, storeDetail, keywords, overview, countries } from './stats.js';
import { RES, listRes, getRes, createRes, updateRes, deleteRes, optionsFor, parseCSV, importStores, importOffers, publicApi } from './resources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ALLOW_LOCAL = process.env.ALLOW_LOCAL === '1';
const SESSION_DAYS = 30;

let geoip = null;
try { geoip = (await import('geoip-lite')).default; } catch { /* tuỳ chọn */ }

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(obj === undefined ? '' : JSON.stringify(obj));
}
function readBody(req, limit = 5e6) {
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
const normHost = (h) => str(h, 255).toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
const validHost = (h) => /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h) || h === 'localhost';
const validPath = (p) => /^\/.*\{slug\}/.test(p);
const newKey = () => crypto.randomBytes(9).toString('base64url');

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

if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
  const u = process.env.ADMIN_USER || 'admin', p = process.env.ADMIN_PASS || 'admin123';
  db.prepare('INSERT INTO users(username,name,pass,role,created_at) VALUES(?,?,?,?,?)').run(u, 'Quản trị viên', hashPass(p), 'admin', Date.now());
  console.log(`\n[!] Đã tạo tài khoản admin mặc định: ${u} / ${p}  -> hãy đổi mật khẩu sau khi đăng nhập.\n`);
}

// ---------- tracking ----------
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|node-fetch|go-http/i;
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
function browserOf(ua) {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge'; if (/OPR\/|Opera/.test(ua)) return 'Opera'; if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/coc_coc|CocCoc/i.test(ua)) return 'Cốc Cốc'; if (/FBAN|FBAV|Instagram|Zalo/i.test(ua)) return 'Trình duyệt trong app';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome'; if (/FxiOS|Firefox\//.test(ua)) return 'Firefox'; if (/Safari\//.test(ua)) return 'Safari'; return 'Khác';
}
function osOf(ua) {
  if (/Windows/.test(ua)) return 'Windows'; if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'; if (/Android/.test(ua)) return 'Android';
  if (/CrOS/.test(ua)) return 'ChromeOS'; if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'; if (/Linux/.test(ua)) return 'Linux'; return 'Khác';
}
function clientIP(req) { return str((req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0], 64) || req.socket.remoteAddress || ''; }
function countryOf(req) {
  const h = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['cloudfront-viewer-country'] || req.headers['x-country-code'];
  if (h && /^[A-Z]{2}$/i.test(h) && !/^(XX|T1)$/i.test(h)) return h.toUpperCase();
  if (geoip) { const r = geoip.lookup(clientIP(req).replace(/^::ffff:/, '')); if (r && r.country) return r.country; }
  return '';
}
const pathRe = new Map();
function storeFromPath(tpl, pathname) {
  tpl = tpl || '/store/{slug}';
  let re = pathRe.get(tpl);
  if (!re) {
    const [a, b = ''] = tpl.split('{slug}');
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp('^' + esc(a) + '([^/?#]+?)' + esc(b.replace(/\/$/, '')) + '/?$', 'i'); pathRe.set(tpl, re);
  }
  let p = pathname; try { p = decodeURIComponent(pathname); } catch { }
  const m = re.exec(p); return m ? m[1] : '';
}

const Q = {
  domainByKey: db.prepare('SELECT id, host, active, store_path FROM domains WHERE site_key=?'),
  storeGet: db.prepare('SELECT * FROM stores WHERE domain_id=? AND slug=?'),
  storeIns: db.prepare("INSERT INTO stores(domain_id,slug,name,url,page_url,source,created_at,updated_at) VALUES(?,?,?,?,?,'tracker',?,?)"),
  storeUpd: db.prepare('UPDATE stores SET name=?, url=?, page_url=? WHERE id=?'),
  visitIns: db.prepare(`INSERT OR IGNORE INTO visits(id,domain_id,store_id,visitor,ts,day,path,channel,source,medium,campaign,keyword,country,device,browser,os,entry,referrer)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  visitGet: db.prepare('SELECT id,domain_id,store_id,clicks,copies FROM visits WHERE id=?'),
  offerSeen: db.prepare(`INSERT INTO offers(domain_id,store_id,okey,title,type,status,source,last_seen,created_at,updated_at) VALUES(?,?,?,?,?,'active','tracker',?,?,?)
                         ON CONFLICT(domain_id,okey) DO UPDATE SET last_seen=excluded.last_seen,
                         store_id=COALESCE(offers.store_id, excluded.store_id),
                         title=CASE WHEN offers.title='' THEN excluded.title ELSE offers.title END,
                         type=CASE WHEN offers.source='tracker' AND excluded.type<>'' THEN excluded.type ELSE offers.type END`),
  evIns: db.prepare('INSERT INTO events(visit_id,domain_id,store_id,ts,type,offer,position,target) VALUES(?,?,?,?,?,?,?,?)'),
  clickInc: db.prepare('UPDATE visits SET clicks=clicks+1 WHERE id=?'),
  copyInc: db.prepare('UPDATE visits SET copies=copies+1 WHERE id=?'),
};

function handlePV(dom, d, req) {
  const u = safeURL(d.u); if (!u) return;
  const now = Date.now();
  const s = d.s && typeof d.s === 'object' ? d.s : {};
  const slug = slugify(str(s.slug, 120) || storeFromPath(dom.store_path, u.pathname));
  const land = d.l && typeof d.l === 'object' ? d.l : { u: d.u, r: d.r };
  const a = classify(safeURL(land.u) || u, str(land.r, 1000));
  const ref = str(d.r, 1000), ua = req.headers['user-agent'] || '';
  let p = u.pathname; try { p = decodeURIComponent(p); } catch { }
  tx(() => {
    let storeId = null;
    if (slug) {
      const name = str(s.name, 120), surl = str(s.url, 300), pageUrl = u.origin + u.pathname;
      let st = Q.storeGet.get(dom.id, slug);
      if (!st) storeId = Number(Q.storeIns.run(dom.id, slug, name || slug, surl, pageUrl, now, now).lastInsertRowid);
      else {
        storeId = st.id;
        if ((name && (!st.name || st.name === st.slug)) || (surl && !st.url) || st.page_url !== pageUrl)
          Q.storeUpd.run((st.name && st.name !== st.slug) ? st.name : (name || st.name), st.url || surl, pageUrl, st.id);
      }
    }
    Q.visitIns.run(str(d.v, 40), dom.id, storeId, str(d.vid, 40), now, dayOf(now), str(p, 300) || '/', a.channel, a.source, a.medium, a.campaign, a.keyword,
      countryOf(req), deviceOf(ua), browserOf(ua), osOf(ua), hostOf(ref) !== hostOf(u.href) ? 1 : 0, ref);
    if (Array.isArray(d.o)) for (const o of d.o.slice(0, 100)) {
      const k = str(o && o.id, 100); if (k) Q.offerSeen.run(dom.id, storeId, k, str(o.title, 300), o.type === 'deal' ? 'deal' : 'code', now, now, now);
    }
  });
}
function handleEvent(dom, d) {
  const v = Q.visitGet.get(str(d.v, 40));
  if (!v || v.domain_id !== dom.id) return;
  const type = d.t === 'copy' ? 'copy' : 'click';
  if ((type === 'click' ? v.clicks : v.copies) >= 50) return;
  const okey = str(d.of, 100), now = Date.now();
  tx(() => {
    Q.evIns.run(v.id, dom.id, v.store_id, now, type, okey, str(d.p, 60), str(d.tg, 200));
    (type === 'click' ? Q.clickInc : Q.copyInc).run(v.id);
    if (okey) Q.offerSeen.run(dom.id, v.store_id, okey, str(d.ot, 300), d.ty === 'deal' ? 'deal' : 'code', now, now, now);
  });
}
async function collect(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  try {
    const d = JSON.parse(await readBody(req, 32768));
    const dom = Q.domainByKey.get(str(d.k, 64));
    if (dom && dom.active && !BOT.test(req.headers['user-agent'] || '')) {
      if (d.t === 'pv') {
        const h = hostOf(d.u);
        if (h === dom.host || h.endsWith('.' + dom.host) || (ALLOW_LOCAL && /^(localhost|127\.0\.0\.1)$/.test(h))) handlePV(dom, d, req);
      } else if (d.t === 'click' || d.t === 'copy') handleEvent(dom, d);
    }
  } catch (e) { if (process.env.DEBUG) console.error('collect', e); }
  res.writeHead(204, CORS); res.end();
}

// ---------- domains ----------
function domainsList(admin) {
  const since = dayOf(Date.now() - 7 * 864e5);
  return db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM visits v WHERE v.domain_id=d.id AND v.day>=?) visits7,
      (SELECT COUNT(*) FROM stores s WHERE s.domain_id=d.id) stores,
      (SELECT MAX(ts) FROM visits v WHERE v.domain_id=d.id) last_hit
    FROM domains d ORDER BY d.name COLLATE NOCASE`).all(since).map((d) => (admin ? d : { ...d, site_key: undefined }));
}
function insertDomain(host, name, category, note = '', storePath = '') {
  const r = db.prepare('INSERT INTO domains(name,host,site_key,store_path,category,note,active,created_at) VALUES(?,?,?,?,?,?,1,?)')
    .run(name || host, host, newKey(), storePath || '/store/{slug}', category, note, Date.now());
  return db.prepare('SELECT * FROM domains WHERE id=?').get(r.lastInsertRowid);
}
const checkSoon = (d) => setTimeout(() => checkDomain(d, true).catch(() => { }), 100);
function logImport(user, kind, domainId, filename, total, r) {
  db.prepare('INSERT INTO imports(ts,username,kind,domain_id,filename,total,added,updated,skipped,detail) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(Date.now(), user.username, kind, domainId || null, str(filename, 200), total, r.added, r.updated || 0, total - r.added - (r.updated || 0), JSON.stringify(r.detail.slice(0, 3000)));
}

// ---------- router ----------
const routes = [];
// auth: false | 'any' (đã đăng nhập) | 'edit' (admin, biên tập) | 'admin'
function route(method, pattern, auth, handler) {
  const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, auth, handler });
}
const canEdit = (u) => u.role === 'admin' || u.role === 'editor';

route('POST', '/api/login', false, async (req, res) => {
  const b = await jsonBody(req);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(str(b.username, 80).toLowerCase());
  if (!u || !checkPass(str(b.password, 200), u.pass)) { await new Promise((r) => setTimeout(r, 600)); return send(res, 401, { error: 'Sai tài khoản hoặc mật khẩu' }); }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(token, u.id, Date.now() + SESSION_DAYS * 864e5);
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` });
});
route('POST', '/api/logout', 'any', (req, res, ctx) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(ctx.token);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
});
route('GET', '/api/me', 'any', (req, res, ctx) => send(res, 200, { id: ctx.user.id, username: ctx.user.username, name: ctx.user.name, role: ctx.user.role }));
route('POST', '/api/me/password', 'any', async (req, res, ctx) => {
  const b = await jsonBody(req);
  if (!checkPass(str(b.old, 200), ctx.user.pass)) return send(res, 400, { error: 'Mật khẩu hiện tại không đúng' });
  if (str(b.new, 200).length < 6) return send(res, 400, { error: 'Mật khẩu mới tối thiểu 6 ký tự' });
  db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(str(b.new, 200)), ctx.user.id);
  send(res, 200, { ok: true });
});

// Thống kê
route('GET', '/api/overview', 'any', (req, res, ctx) => send(res, 200, overview(ctx.q)));
route('GET', '/api/performance', 'any', (req, res, ctx) => send(res, 200, storePerformance(ctx.q)));
route('GET', '/api/performance/:id', 'any', (req, res, ctx) => { const r = storeDetail(+ctx.params.id, ctx.q); r ? send(res, 200, r) : send(res, 404, { error: 'Không tìm thấy' }); });
route('GET', '/api/keywords', 'any', (req, res, ctx) => send(res, 200, keywords(ctx.q)));
route('GET', '/api/countries', 'any', (req, res, ctx) => send(res, 200, countries(ctx.q)));

// Domain
route('GET', '/api/domains', 'any', (req, res, ctx) => send(res, 200, domainsList(ctx.user.role === 'admin')));
route('GET', '/api/domain-groups', 'any', (req, res) => send(res, 200, db.prepare("SELECT category, COUNT(*) n FROM domains WHERE category<>'' GROUP BY category ORDER BY category").all()));
route('POST', '/api/domains', 'admin', async (req, res) => {
  const b = await jsonBody(req); const host = normHost(b.host);
  if (!validHost(host)) return send(res, 400, { error: 'Domain không hợp lệ (vd: example.com)' });
  if (db.prepare('SELECT 1 FROM domains WHERE host=?').get(host)) return send(res, 400, { error: 'Domain này đã tồn tại' });
  const sp = str(b.store_path, 200); if (sp && !validPath(sp)) return send(res, 400, { error: 'Đường dẫn trang cửa hàng phải bắt đầu bằng / và chứa {slug}' });
  const d = insertDomain(host, str(b.name, 100), str(b.category, 60), str(b.note, 1000), sp);
  checkSoon(d); send(res, 200, d);
});
route('PUT', '/api/domains/:id', 'admin', async (req, res, ctx) => {
  const b = await jsonBody(req); const id = +ctx.params.id;
  const cur = db.prepare('SELECT * FROM domains WHERE id=?').get(id); if (!cur) return send(res, 404, { error: 'Không tìm thấy' });
  const host = b.host !== undefined ? normHost(b.host) : cur.host;
  if (!validHost(host)) return send(res, 400, { error: 'Domain không hợp lệ' });
  if (db.prepare('SELECT 1 FROM domains WHERE host=? AND id<>?').get(host, id)) return send(res, 400, { error: 'Domain này đã tồn tại' });
  const sp = b.store_path !== undefined ? (str(b.store_path, 200) || '/store/{slug}') : cur.store_path;
  if (!validPath(sp)) return send(res, 400, { error: 'Đường dẫn trang cửa hàng phải bắt đầu bằng / và chứa {slug}' });
  db.prepare('UPDATE domains SET name=?, host=?, store_path=?, category=?, note=?, active=? WHERE id=?').run(
    str(b.name, 100) || cur.name, host, sp, b.category !== undefined ? str(b.category, 60) : cur.category,
    b.note !== undefined ? str(b.note, 1000) : cur.note, b.active === undefined ? cur.active : (b.active ? 1 : 0), id);
  if (host !== cur.host) checkSoon({ ...cur, host });
  send(res, 200, { ok: true });
});
route('POST', '/api/domains/:id/check', 'any', async (req, res, ctx) => {
  const d = db.prepare('SELECT * FROM domains WHERE id=?').get(+ctx.params.id); if (!d) return send(res, 404, { error: 'Không tìm thấy' });
  await checkDomain(d, true); send(res, 200, { ok: true });
});
route('POST', '/api/domains/:id/rotate-key', 'admin', (req, res, ctx) => { db.prepare('UPDATE domains SET site_key=? WHERE id=?').run(newKey(), +ctx.params.id); send(res, 200, { ok: true }); });
route('DELETE', '/api/domains/:id', 'admin', (req, res, ctx) => { db.prepare('DELETE FROM domains WHERE id=?').run(+ctx.params.id); send(res, 200, { ok: true }); });

// Import
route('POST', '/api/import/:kind', 'edit', async (req, res, ctx) => {
  const b = await jsonBody(req); const kind = ctx.params.kind;
  if (kind === 'domains') {
    if (ctx.user.role !== 'admin') return send(res, 403, { error: 'Chỉ quản trị viên được nhập domain' });
    const items = String(b.text || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 5000);
    const detail = [], seen = new Set(), created = []; let added = 0;
    tx(() => {
      for (const raw of items) {
        const host = normHost(raw);
        if (!validHost(host)) { detail.push({ item: raw, status: 'invalid', note: 'Domain không hợp lệ' }); continue; }
        if (seen.has(host) || db.prepare('SELECT 1 FROM domains WHERE host=?').get(host)) { detail.push({ item: host, status: 'exists' }); continue; }
        seen.add(host); created.push(insertDomain(host, host, str(b.category, 60))); added++; detail.push({ item: host, status: 'added' });
      }
    });
    created.forEach(checkSoon);
    const r = { added, updated: 0, detail }; logImport(ctx.user, 'domains', null, b.filename, items.length, r);
    return send(res, 200, { total: items.length, ...r });
  }
  if (!['stores', 'offers'].includes(kind)) return send(res, 404, { error: 'Không hỗ trợ' });
  const domainId = +b.domain_id; if (!db.prepare('SELECT 1 FROM domains WHERE id=?').get(domainId)) return send(res, 400, { error: 'Hãy chọn một domain' });
  const rows = parseCSV(b.text); if (!rows.length) return send(res, 400, { error: 'File trống hoặc thiếu dòng tiêu đề' });
  const r = kind === 'stores' ? importStores(domainId, rows) : importOffers(domainId, rows);
  logImport(ctx.user, kind, domainId, b.filename, rows.length, r);
  send(res, 200, { total: rows.length, ...r });
});
route('GET', '/api/imports', 'any', (req, res) => send(res, 200, db.prepare('SELECT i.*, d.host FROM imports i LEFT JOIN domains d ON d.id=i.domain_id ORDER BY i.id DESC LIMIT 200').all().map((r) => ({ ...r, detail: JSON.parse(r.detail || '[]') }))));

// Dữ liệu chính & Nội dung (CRUD chung)
route('GET', '/api/options', 'any', (req, res, ctx) => send(res, 200, optionsFor(+ctx.q.get('domain'))));
route('GET', '/api/r/:res', 'any', (req, res, ctx) => { if (!RES[ctx.params.res]) return send(res, 404, { error: 'Not found' }); const r = listRes(ctx.params.res, ctx.q); r.error ? send(res, 400, r) : send(res, 200, r); });
route('GET', '/api/r/:res/:id', 'any', (req, res, ctx) => { if (!RES[ctx.params.res]) return send(res, 404, { error: 'Not found' }); const r = getRes(ctx.params.res, +ctx.params.id); r ? send(res, 200, r) : send(res, 404, { error: 'Không tìm thấy' }); });
route('POST', '/api/r/:res', 'edit', async (req, res, ctx) => { if (!RES[ctx.params.res]) return send(res, 404, { error: 'Not found' }); const r = createRes(ctx.params.res, await jsonBody(req)); r.error ? send(res, 400, r) : send(res, 200, r.row); });
route('PUT', '/api/r/:res/:id', 'edit', async (req, res, ctx) => { if (!RES[ctx.params.res]) return send(res, 404, { error: 'Not found' }); const r = updateRes(ctx.params.res, +ctx.params.id, await jsonBody(req)); r.error ? send(res, r.code || 400, r) : send(res, 200, r.row); });
route('DELETE', '/api/r/:res/:id', 'edit', (req, res, ctx) => { if (!RES[ctx.params.res]) return send(res, 404, { error: 'Not found' }); send(res, 200, deleteRes(ctx.params.res, +ctx.params.id)); });

// Nhân viên
const ROLES = ['admin', 'editor', 'viewer'];
route('GET', '/api/users', 'admin', (req, res) => send(res, 200, db.prepare('SELECT id,username,name,role,created_at FROM users ORDER BY id').all()));
route('POST', '/api/users', 'admin', async (req, res) => {
  const b = await jsonBody(req); const u = str(b.username, 80).toLowerCase();
  if (!/^[a-z0-9._-]{3,}$/.test(u)) return send(res, 400, { error: 'Tên đăng nhập tối thiểu 3 ký tự (a-z, 0-9, . _ -)' });
  if (str(b.password, 200).length < 6) return send(res, 400, { error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) return send(res, 400, { error: 'Tên đăng nhập đã tồn tại' });
  db.prepare('INSERT INTO users(username,name,pass,role,created_at) VALUES(?,?,?,?,?)').run(u, str(b.name, 100), hashPass(str(b.password, 200)), ROLES.includes(b.role) ? b.role : 'viewer', Date.now());
  send(res, 200, { ok: true });
});
route('PUT', '/api/users/:id', 'admin', async (req, res, ctx) => {
  const b = await jsonBody(req); const id = +ctx.params.id;
  if (b.password) { if (str(b.password, 200).length < 6) return send(res, 400, { error: 'Mật khẩu tối thiểu 6 ký tự' }); db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(str(b.password, 200)), id); }
  if (b.role && id !== ctx.user.id && ROLES.includes(b.role)) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, id);
  if (b.name !== undefined) db.prepare('UPDATE users SET name=? WHERE id=?').run(str(b.name, 100), id);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/users/:id', 'admin', (req, res, ctx) => {
  if (+ctx.params.id === ctx.user.id) return send(res, 400, { error: 'Không thể xoá chính mình' });
  db.prepare('DELETE FROM users WHERE id=?').run(+ctx.params.id); send(res, 200, { ok: true });
});

function serveStatic(req, res, pathname) {
  const file = pathname === '/' ? '/index.html' : pathname;
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.stat(full, (err, st) => {
    const target = (!err && st.isFile()) ? full : path.join(PUBLIC, 'index.html');
    const headers = { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' };
    if (pathname === '/t.js') Object.assign(headers, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' });
    else headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers); fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/collect') return await collect(req, res);
    const pub = /^\/api\/public\/([\w-]+)\/([a-z]+)(?:\/([^/]+))?$/.exec(url.pathname);
    if (pub) {
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
      const r = publicApi(pub[1], pub[2], pub[3] ? decodeURIComponent(pub[3]) : '', url.searchParams);
      return r.error ? send(res, r.code || 400, { error: r.error }, CORS) : send(res, 200, r.data, { ...CORS, 'Cache-Control': 'public, max-age=60' });
    }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname); if (!m) continue;
      const ctx = { q: url.searchParams, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      if (r.auth) {
        const token = cookies(req).sid || '';
        const u = token && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(token, Date.now());
        if (!u) return send(res, 401, { error: 'Chưa đăng nhập' });
        if ((r.auth === 'admin' && u.role !== 'admin') || (r.auth === 'edit' && !canEdit(u))) return send(res, 403, { error: 'Bạn không có quyền thực hiện thao tác này' });
        ctx.user = u; ctx.token = token;
      }
      return await r.handler(req, res, ctx);
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e); if (!res.headersSent) send(res, 500, { error: 'Lỗi máy chủ' });
  }
});
server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`Domain Manager đang chạy: http://localhost:${PORT}`);
  startMonitor();
});
