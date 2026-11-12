// CRUD dùng chung cho Dữ liệu chính & Nội dung, Import CSV, API công khai cho website
import { db, tx, slugify, todayStr } from './db.js';
import { activeOfferSQL, activeOfferParams, storeLink } from './stats.js';

const T = (max = 200, req = false) => ({ t: 'text', max, req });
const INT = { t: 'int' }, SORT = { t: 'int', def: 0 }, DATE = { t: 'date' }, BOOL = { t: 'bool' };
const SLUG = (from) => ({ t: 'slug', from });
const ENUM = (vals, def) => ({ t: 'enum', vals, def });
const PUB = ENUM(['published', 'draft'], 'published'), ACT = ENUM(['active', 'hidden'], 'active');

export const RES = {
  categories: {
    table: 'categories', a: 'c', label: 'Danh mục',
    fields: { name: T(120, true), slug: SLUG('name'), parent_id: INT, description: T(5000), sort: SORT },
    list: `SELECT c.*, p.name parent_name, (SELECT COUNT(*) FROM stores s WHERE s.category_id=c.id) stores FROM categories c LEFT JOIN categories p ON p.id=c.parent_id`,
    search: ['c.name', 'c.slug'], order: 'c.sort, c.name', filters: ['parent_id'],
  },
  stores: {
    table: 'stores', a: 's', label: 'Cửa hàng',
    fields: { name: T(120, true), slug: SLUG('name'), url: T(300), category_id: INT, logo: T(500), description: T(20000), status: ACT },
    list: `SELECT s.*, c.name category_name, d.host, d.store_path,
      (SELECT COUNT(*) FROM offers o WHERE o.store_id=s.id) offers_total,
      (SELECT COUNT(*) FROM offers o WHERE o.store_id=s.id AND ${activeOfferSQL()}) offers_active
      FROM stores s JOIN domains d ON d.id=s.domain_id LEFT JOIN categories c ON c.id=s.category_id`,
    listParams: activeOfferParams, search: ['s.name', 's.slug', 's.url'], order: 's.name COLLATE NOCASE', filters: ['category_id', 'status'],
  },
  offers: {
    table: 'offers', a: 'o', label: 'Mã & ưu đãi',
    fields: {
      store_id: { t: 'int', req: true }, title: T(300, true), type: ENUM(['code', 'deal'], 'code'), code: T(100), discount: T(60), url: T(1000),
      description: T(5000), starts: DATE, expires: DATE, event_id: INT, verified: BOOL, status: ACT, sort: SORT, okey: T(100),
    },
    list: `SELECT o.*, s.name store_name, s.slug store_slug, e.name event_name FROM offers o LEFT JOIN stores s ON s.id=o.store_id LEFT JOIN promo_events e ON e.id=o.event_id`,
    search: ['o.title', 'o.code', 's.name'], order: 'o.sort DESC, o.id DESC', filters: ['store_id', 'event_id', 'type', 'status'],
  },
  promo_events: {
    table: 'promo_events', a: 'e', label: 'Sự kiện khuyến mãi',
    fields: { name: T(200, true), slug: SLUG('name'), starts: DATE, ends: DATE, banner: T(500), description: T(20000), status: ACT },
    list: `SELECT e.*, (SELECT COUNT(*) FROM offers o WHERE o.event_id=e.id) offers FROM promo_events e`,
    search: ['e.name', 'e.slug'], order: 'e.starts DESC, e.id DESC', filters: ['status'],
  },
  pages: {
    table: 'pages', a: 'p', label: 'Trang tĩnh',
    fields: { title: T(200, true), slug: SLUG('title'), content: T(200000), meta_title: T(200), meta_description: T(500), status: PUB },
    list: 'SELECT p.* FROM pages p', search: ['p.title', 'p.slug'], order: 'p.title', filters: ['status'],
  },
  posts: {
    table: 'posts', a: 'p', label: 'Bài viết',
    fields: { title: T(300, true), slug: SLUG('title'), excerpt: T(1000), content: T(200000), thumbnail: T(500), category_id: INT, store_id: INT, status: PUB, published_at: DATE },
    list: 'SELECT p.*, c.name category_name, s.name store_name FROM posts p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN stores s ON s.id=p.store_id',
    search: ['p.title', 'p.slug'], order: 'p.published_at DESC, p.id DESC', filters: ['category_id', 'store_id', 'status'],
  },
  faqs: {
    table: 'faqs', a: 'f', label: 'Câu hỏi thường gặp',
    fields: { question: T(500, true), answer: T(20000), store_id: INT, sort: SORT, status: PUB },
    list: 'SELECT f.*, s.name store_name FROM faqs f LEFT JOIN stores s ON s.id=f.store_id',
    search: ['f.question', 'f.answer'], order: 'f.sort, f.id', filters: ['store_id', 'status'],
  },
  templates: {
    table: 'templates', a: 't', label: 'Mẫu nội dung',
    fields: { name: T(200, true), type: ENUM(['store', 'offer', 'post', 'page', 'faq', 'event', 'category'], 'store'), content: T(100000) },
    list: 'SELECT t.* FROM templates t', search: ['t.name', 't.content'], order: 't.type, t.name', filters: ['type'],
  },
};

function clean(def, body, isNew) {
  const out = {};
  for (const [k, f] of Object.entries(def.fields)) {
    if (!(k in body)) { if (isNew && f.t === 'enum') out[k] = f.def; continue; }
    let v = body[k];
    if (f.t === 'text') { v = v == null ? '' : String(v).trim().slice(0, f.max); if (f.req && !v) return { error: `Thiếu trường bắt buộc: ${k}` }; }
    else if (f.t === 'slug') v = slugify(v);
    else if (f.t === 'int') { v = v === '' || v == null ? null : Math.trunc(+v); if (Number.isNaN(v)) v = null; if (v == null && f.def !== undefined) v = f.def; if (f.req && v == null) return { error: `Thiếu trường bắt buộc: ${k}` }; }
    else if (f.t === 'date') v = /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
    else if (f.t === 'bool') v = v ? 1 : 0;
    else if (f.t === 'enum') v = f.vals.includes(v) ? v : f.def;
    out[k] = v;
  }
  for (const [k, f] of Object.entries(def.fields)) {
    if (f.t === 'slug' && (isNew || k in out) && !out[k]) {
      const src = out[f.from] ?? body[f.from]; if (src) out[k] = slugify(src);
    }
    if (isNew && f.req && out[k] == null) return { error: `Thiếu trường bắt buộc: ${k}` };
  }
  return { values: out };
}
function friendly(e) {
  const m = String(e.message || e);
  if (/UNIQUE.*slug/.test(m)) return 'Slug này đã tồn tại trong domain';
  if (/UNIQUE.*okey/.test(m)) return 'Mã theo dõi (okey) đã tồn tại';
  if (/UNIQUE/.test(m)) return 'Dữ liệu bị trùng';
  return 'Không lưu được: ' + m.slice(0, 120);
}
function ensureRefs(domainId, v) {
  // chặn tham chiếu sang dữ liệu của domain khác
  const own = (tbl, id) => id == null || !!db.prepare(`SELECT 1 FROM ${tbl} WHERE id=? AND domain_id=?`).get(id, domainId);
  if (!own('stores', v.store_id)) return 'Cửa hàng không thuộc domain này';
  if (!own('categories', v.category_id) || !own('categories', v.parent_id)) return 'Danh mục không thuộc domain này';
  if (!own('promo_events', v.event_id)) return 'Sự kiện không thuộc domain này';
  return '';
}

export function listRes(name, q) {
  const def = RES[name]; const a = def.a;
  const domain = +q.get('domain'); if (!domain) return { error: 'Hãy chọn một domain' };
  const w = [`${a}.domain_id=?`], p = [...(def.listParams ? def.listParams() : []), domain];
  for (const k of def.filters || []) { const v = q.get(k); if (v !== null && v !== '') { w.push(`${a}.${k}=?`); p.push(def.fields[k]?.t === 'int' ? +v : v); } }
  const s = (q.get('q') || '').trim();
  if (s) { w.push('(' + def.search.map((c) => `${c} LIKE ?`).join(' OR ') + ')'); def.search.forEach(() => p.push('%' + s + '%')); }
  const sql = `${def.list} WHERE ${w.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) n FROM (${sql})`).get(...p).n;
  const per = Math.min(Math.max(+q.get('per') || 20, 1), 1000), page = Math.max(+q.get('page') || 1, 1);
  const rows = db.prepare(`${sql} ORDER BY ${def.order} LIMIT ? OFFSET ?`).all(...p, per, (page - 1) * per);
  if (name === 'stores') rows.forEach((r) => (r.open_url = storeLink(r)));
  return { total, page, per, rows };
}
export function getRes(name, id) {
  const def = RES[name];
  return db.prepare(`${def.list} WHERE ${def.a}.id=?`).get(...(def.listParams ? def.listParams() : []), id);
}
export function createRes(name, body) {
  const def = RES[name]; const domainId = +body.domain_id;
  if (!domainId || !db.prepare('SELECT 1 FROM domains WHERE id=?').get(domainId)) return { error: 'Hãy chọn một domain' };
  const c = clean(def, body, true); if (c.error) return c;
  const ref = ensureRefs(domainId, c.values); if (ref) return { error: ref };
  const v = { ...c.values, domain_id: domainId, created_at: Date.now(), updated_at: Date.now() };
  if (name === 'offers' && !v.okey) v.okey = 'tmp-' + Math.random().toString(36).slice(2);
  const cols = Object.keys(v);
  try {
    const r = db.prepare(`INSERT INTO ${def.table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((k) => v[k]));
    const id = Number(r.lastInsertRowid);
    if (name === 'offers' && v.okey.startsWith('tmp-')) db.prepare('UPDATE offers SET okey=? WHERE id=?').run('o' + id, id);
    return { row: getRes(name, id) };
  } catch (e) { return { error: friendly(e) }; }
}
export function updateRes(name, id, body) {
  const def = RES[name];
  const cur = db.prepare(`SELECT * FROM ${def.table} WHERE id=?`).get(id); if (!cur) return { error: 'Không tìm thấy', code: 404 };
  const c = clean(def, body, false); if (c.error) return c;
  const ref = ensureRefs(cur.domain_id, c.values); if (ref) return { error: ref };
  const v = { ...c.values, updated_at: Date.now() };
  if (name === 'offers' && 'okey' in v && !v.okey) delete v.okey;
  const cols = Object.keys(v);
  try {
    db.prepare(`UPDATE ${def.table} SET ${cols.map((k) => k + '=?').join(',')} WHERE id=?`).run(...cols.map((k) => v[k]), id);
    return { row: getRes(name, id) };
  } catch (e) { return { error: friendly(e) }; }
}
export function deleteRes(name, id) {
  const def = RES[name];
  if (name === 'categories') { db.prepare('UPDATE stores SET category_id=NULL WHERE category_id=?').run(id); db.prepare('UPDATE posts SET category_id=NULL WHERE category_id=?').run(id); db.prepare('UPDATE categories SET parent_id=NULL WHERE parent_id=?').run(id); }
  if (name === 'promo_events') db.prepare('UPDATE offers SET event_id=NULL WHERE event_id=?').run(id);
  if (name === 'stores') { db.prepare('UPDATE posts SET store_id=NULL WHERE store_id=?').run(id); db.prepare('DELETE FROM faqs WHERE store_id=?').run(id); }
  db.prepare(`DELETE FROM ${def.table} WHERE id=?`).run(id);
  return { ok: true };
}
export function optionsFor(domainId) {
  return {
    stores: db.prepare('SELECT id, name FROM stores WHERE domain_id=? ORDER BY name COLLATE NOCASE').all(domainId),
    categories: db.prepare('SELECT id, name FROM categories WHERE domain_id=? ORDER BY sort, name').all(domainId),
    promo_events: db.prepare('SELECT id, name FROM promo_events WHERE domain_id=? ORDER BY starts DESC, id DESC').all(domainId),
    templates: db.prepare('SELECT id, name, type, content FROM templates WHERE domain_id=? ORDER BY name').all(domainId),
  };
}

// ---------- Import CSV ----------
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!clean.length) return [];
  const ALIAS = { 'tên': 'name', 'ten': 'name', 'tên cửa hàng': 'name', 'cửa hàng': 'store', 'cua hang': 'store', 'website': 'url', 'link': 'url', 'danh mục': 'category', 'danh muc': 'category',
    'tiêu đề': 'title', 'tieu de': 'title', 'loại': 'type', 'loai': 'type', 'mã': 'code', 'ma': 'code', 'giảm': 'discount', 'bắt đầu': 'starts', 'hết hạn': 'expires', 'mô tả': 'description', 'sự kiện': 'event', 'store_slug': 'store' };
  const head = clean[0].map((h) => { const k = h.trim().toLowerCase(); return ALIAS[k] || k; });
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
const normDate = (s) => {
  s = String(s || '').trim(); if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
function catId(domainId, name, detail) {
  if (!name) return null;
  const slug = slugify(name);
  const c = db.prepare('SELECT id FROM categories WHERE domain_id=? AND slug=?').get(domainId, slug); if (c) return c.id;
  detail.push({ item: name, status: 'added', note: 'Tạo danh mục mới' });
  return Number(db.prepare('INSERT INTO categories(domain_id,name,slug,sort,created_at,updated_at) VALUES(?,?,?,0,?,?)').run(domainId, name, slug, Date.now(), Date.now()).lastInsertRowid);
}
export function importStores(domainId, rows) {
  const detail = []; let added = 0, updated = 0;
  tx(() => {
    for (const r of rows) {
      const name = (r.name || r.store || '').slice(0, 120); const slug = slugify(r.slug || name);
      if (!slug) { detail.push({ item: JSON.stringify(r).slice(0, 80), status: 'invalid', note: 'Thiếu tên' }); continue; }
      const cid = catId(domainId, r.category, detail);
      const cur = db.prepare('SELECT * FROM stores WHERE domain_id=? AND slug=?').get(domainId, slug);
      const status = /^(hidden|ẩn|an|0)$/i.test(r.status || '') ? 'hidden' : 'active';
      if (cur) {
        db.prepare('UPDATE stores SET name=?, url=?, category_id=?, description=?, logo=?, status=?, updated_at=? WHERE id=?')
          .run(name || cur.name, r.url || cur.url, cid ?? cur.category_id, r.description || cur.description, r.logo || cur.logo, r.status ? status : cur.status, Date.now(), cur.id);
        updated++; detail.push({ item: name || slug, status: 'updated' });
      } else {
        db.prepare('INSERT INTO stores(domain_id,slug,name,url,category_id,logo,description,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(domainId, slug, name || slug, r.url || '', cid, r.logo || '', r.description || '', status, 'import', Date.now(), Date.now());
        added++; detail.push({ item: name || slug, status: 'added' });
      }
    }
  });
  return { added, updated, detail };
}
export function importOffers(domainId, rows) {
  const detail = []; let added = 0, updated = 0;
  tx(() => {
    for (const r of rows) {
      const sname = r.store || r.store_name || ''; const sslug = slugify(sname);
      if (!sslug || !r.title) { detail.push({ item: (r.title || JSON.stringify(r)).slice(0, 80), status: 'invalid', note: 'Thiếu cửa hàng hoặc tiêu đề' }); continue; }
      let st = db.prepare('SELECT id FROM stores WHERE domain_id=? AND slug=?').get(domainId, sslug);
      if (!st) {
        st = { id: Number(db.prepare('INSERT INTO stores(domain_id,slug,name,source,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(domainId, sslug, sname, 'import', Date.now(), Date.now()).lastInsertRowid) };
        detail.push({ item: sname, status: 'added', note: 'Tạo cửa hàng mới' });
      }
      let evId = null;
      if (r.event) {
        const es = slugify(r.event); const ev = db.prepare('SELECT id FROM promo_events WHERE domain_id=? AND slug=?').get(domainId, es);
        evId = ev ? ev.id : Number(db.prepare('INSERT INTO promo_events(domain_id,name,slug,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(domainId, r.event, es, 'active', Date.now(), Date.now()).lastInsertRowid);
      }
      const type = /deal|ưu đãi|uu dai/i.test(r.type || '') || (!r.code && !r.type) ? 'deal' : 'code';
      const vals = [st.id, r.title.slice(0, 300), type, (r.code || '').slice(0, 100), (r.discount || '').slice(0, 60), (r.url || '').slice(0, 1000), (r.description || '').slice(0, 5000), normDate(r.starts), normDate(r.expires), evId];
      const cur = r.okey ? db.prepare('SELECT id FROM offers WHERE domain_id=? AND okey=?').get(domainId, r.okey)
        : db.prepare('SELECT id FROM offers WHERE domain_id=? AND store_id=? AND title=? AND code=?').get(domainId, st.id, r.title.slice(0, 300), (r.code || '').slice(0, 100));
      if (cur) {
        db.prepare('UPDATE offers SET store_id=?, title=?, type=?, code=?, discount=?, url=?, description=?, starts=?, expires=?, event_id=COALESCE(?,event_id), updated_at=? WHERE id=?').run(...vals, Date.now(), cur.id);
        updated++; detail.push({ item: r.title, status: 'updated' });
      } else {
        const id = Number(db.prepare(`INSERT INTO offers(domain_id,okey,store_id,title,type,code,discount,url,description,starts,expires,event_id,status,source,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active','manual',?,?)`).run(domainId, r.okey || 'tmp-' + Math.random().toString(36).slice(2), ...vals, Date.now(), Date.now()).lastInsertRowid);
        if (!r.okey) db.prepare('UPDATE offers SET okey=? WHERE id=?').run('o' + id, id);
        added++; detail.push({ item: r.title, status: 'added' });
      }
    }
  });
  return { added, updated, detail };
}

// ---------- API công khai cho website (đọc nội dung đã xuất bản) ----------
export function publicApi(key, res, slug, q) {
  const d = db.prepare('SELECT id, host, store_path FROM domains WHERE site_key=? AND active=1').get(key);
  if (!d) return { error: 'Site key không hợp lệ', code: 404 };
  const id = d.id, t = todayStr();
  const offersOf = (where, ...p) => db.prepare(`SELECT o.okey, o.title, o.type, o.code, o.discount, o.url, o.description, o.starts, o.expires, o.verified, s.slug store, e.slug event
    FROM offers o LEFT JOIN stores s ON s.id=o.store_id LEFT JOIN promo_events e ON e.id=o.event_id
    WHERE o.domain_id=? AND ${activeOfferSQL()} AND ${where} ORDER BY o.sort DESC, o.id DESC`).all(id, ...activeOfferParams(), ...p);
  const faqsOf = (storeId) => db.prepare(`SELECT question, answer FROM faqs WHERE domain_id=? AND status='published' AND ${storeId ? 'store_id=?' : 'store_id IS NULL'} ORDER BY sort, id`).all(id, ...(storeId ? [storeId] : []));
  switch (res) {
    case 'stores': {
      if (slug) {
        const s = db.prepare("SELECT s.id, s.slug, s.name, s.url, s.logo, s.description, c.slug category FROM stores s LEFT JOIN categories c ON c.id=s.category_id WHERE s.domain_id=? AND s.slug=? AND s.status='active'").get(id, slug);
        if (!s) return { error: 'Không tìm thấy', code: 404 };
        const out = { ...s, offers: offersOf('o.store_id=?', s.id), faqs: faqsOf(s.id) }; delete out.id; return { data: out };
      }
      const cat = q.get('category');
      return { data: db.prepare(`SELECT s.slug, s.name, s.url, s.logo, c.slug category FROM stores s LEFT JOIN categories c ON c.id=s.category_id WHERE s.domain_id=? AND s.status='active' ${cat ? 'AND c.slug=?' : ''} ORDER BY s.name COLLATE NOCASE`).all(id, ...(cat ? [cat] : [])) };
    }
    case 'offers': { const st = q.get('store'); return { data: st ? offersOf('s.slug=?', st) : offersOf('1') }; }
    case 'categories': return { data: db.prepare('SELECT c.slug, c.name, c.description, p.slug parent FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.domain_id=? ORDER BY c.sort, c.name').all(id) };
    case 'events': {
      if (slug) {
        const e = db.prepare("SELECT id, slug, name, starts, ends, banner, description FROM promo_events WHERE domain_id=? AND slug=? AND status='active'").get(id, slug);
        if (!e) return { error: 'Không tìm thấy', code: 404 };
        const out = { ...e, offers: offersOf('o.event_id=?', e.id) }; delete out.id; return { data: out };
      }
      return { data: db.prepare("SELECT slug, name, starts, ends, banner FROM promo_events WHERE domain_id=? AND status='active' AND (ends IS NULL OR ends='' OR ends>=?) ORDER BY starts").all(id, t) };
    }
    case 'pages': {
      if (slug) { const p = db.prepare("SELECT slug, title, content, meta_title, meta_description FROM pages WHERE domain_id=? AND slug=? AND status='published'").get(id, slug); return p ? { data: p } : { error: 'Không tìm thấy', code: 404 }; }
      return { data: db.prepare("SELECT slug, title FROM pages WHERE domain_id=? AND status='published' ORDER BY title").all(id) };
    }
    case 'posts': {
      if (slug) { const p = db.prepare("SELECT p.slug, p.title, p.excerpt, p.content, p.thumbnail, p.published_at, c.slug category, s.slug store FROM posts p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN stores s ON s.id=p.store_id WHERE p.domain_id=? AND p.slug=? AND p.status='published'").get(id, slug); return p ? { data: p } : { error: 'Không tìm thấy', code: 404 }; }
      return { data: db.prepare("SELECT p.slug, p.title, p.excerpt, p.thumbnail, p.published_at FROM posts p WHERE p.domain_id=? AND p.status='published' AND (p.published_at IS NULL OR p.published_at<=?) ORDER BY p.published_at DESC, p.id DESC LIMIT 200").all(id, t) };
    }
    case 'faqs': {
      const st = q.get('store');
      if (st) { const s = db.prepare('SELECT id FROM stores WHERE domain_id=? AND slug=?').get(id, st); return { data: s ? faqsOf(s.id) : [] }; }
      return { data: faqsOf(null) };
    }
  }
  return { error: 'Không có tài nguyên này', code: 404 };
}
