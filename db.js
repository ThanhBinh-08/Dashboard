import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TZ = process.env.DASH_TZ || 'Asia/Ho_Chi_Minh';
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const DATA_DIR = dataDir;
export const DB_FILE = path.join(dataDir, 'dashboard.db');
export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// KHÔNG BAO GIỜ xoá dữ liệu khi nâng cấp. Cấu trúc v3 là nền; các bản sau chỉ thêm bảng / cột (xem MIGRATIONS bên dưới).
const BASE_VERSION = 3;
const tableExists = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const columnsOf = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
if (db.prepare('PRAGMA user_version').get().user_version < BASE_VERSION) {
  // DB từ bản thử nghiệm rất cũ (trước v3) có cấu trúc khác: đổi tên bảng cũ để giữ lại, không xoá.
  const legacy = { domains: 'site_key', stores: 'domain_id', visits: 'domain_id', events: 'visit_id', offers: 'okey', imports: 'kind' };
  const suffix = '_legacy_' + Date.now();
  db.exec('PRAGMA foreign_keys = OFF');
  for (const [t, col] of Object.entries(legacy)) {
    if (tableExists(t) && !columnsOf(t).includes(col)) { db.exec(`ALTER TABLE ${t} RENAME TO ${t}${suffix}`); console.log(`[db] Đã giữ bảng cũ ${t} thành ${t}${suffix}`); }
  }
  db.exec('PRAGMA foreign_keys = ON');
}
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', created_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
);

-- ===== Domain =====
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT UNIQUE NOT NULL,
  site_key TEXT UNIQUE NOT NULL,
  store_path TEXT NOT NULL DEFAULT '/store/{slug}',
  category TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER,
  http_status INTEGER, http_ms INTEGER, http_error TEXT NOT NULL DEFAULT '', http_checked INTEGER,
  ssl_expires INTEGER, ssl_issuer TEXT NOT NULL DEFAULT '', ssl_valid INTEGER, ssl_checked INTEGER,
  reg_expires INTEGER, registrar TEXT NOT NULL DEFAULT '', reg_checked INTEGER
);

-- ===== Dữ liệu chính =====
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, parent_id INTEGER, description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER, updated_at INTEGER, UNIQUE(domain_id, slug)
);
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', category_id INTEGER,
  logo TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
  page_url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER, updated_at INTEGER, UNIQUE(domain_id, slug)
);
CREATE TABLE IF NOT EXISTS promo_events (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL, slug TEXT NOT NULL, starts TEXT, ends TEXT, banner TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at INTEGER, updated_at INTEGER,
  UNIQUE(domain_id, slug)
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  okey TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'code',
  code TEXT NOT NULL DEFAULT '', discount TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '', starts TEXT, expires TEXT, event_id INTEGER,
  verified INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', sort INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', last_seen INTEGER, created_at INTEGER, updated_at INTEGER,
  UNIQUE(domain_id, okey)
);
CREATE INDEX IF NOT EXISTS ix_offers_store ON offers(store_id);

-- ===== Nội dung =====
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  title TEXT NOT NULL, slug TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', meta_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'published', created_at INTEGER, updated_at INTEGER,
  UNIQUE(domain_id, slug)
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  title TEXT NOT NULL, slug TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  thumbnail TEXT NOT NULL DEFAULT '', category_id INTEGER, store_id INTEGER, status TEXT NOT NULL DEFAULT 'published',
  published_at TEXT, created_at INTEGER, updated_at INTEGER, UNIQUE(domain_id, slug)
);
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  store_id INTEGER, question TEXT NOT NULL, answer TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published', created_at INTEGER, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY, domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'store', content TEXT NOT NULL DEFAULT '', created_at INTEGER, updated_at INTEGER
);

-- ===== Thống kê =====
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  visitor TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL, day TEXT NOT NULL, path TEXT NOT NULL DEFAULT '/',
  channel TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '', keyword TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '', browser TEXT NOT NULL DEFAULT '', os TEXT NOT NULL DEFAULT '',
  entry INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, copies INTEGER NOT NULL DEFAULT 0,
  referrer TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_v_dom_day ON visits(domain_id, day);
CREATE INDEX IF NOT EXISTS ix_v_store_day ON visits(store_id, day);
CREATE INDEX IF NOT EXISTS ix_v_day ON visits(day);
CREATE INDEX IF NOT EXISTS ix_v_ts ON visits(ts);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  domain_id INTEGER NOT NULL, store_id INTEGER, ts INTEGER NOT NULL, type TEXT NOT NULL,
  offer TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '', target TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_e_visit ON events(visit_id);
CREATE INDEX IF NOT EXISTS ix_e_store ON events(store_id);

-- ===== Hệ thống =====
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, username TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
  domain_id INTEGER, filename TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL DEFAULT '[]'
);
`);

// ===== Migrations: chỉ THÊM, không xoá. Mỗi bước chạy được nhiều lần mà không hỏng. =====
const addColumn = (t, col, def) => { if (!columnsOf(t).includes(col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
const MIGRATIONS = {
  4: () => {
    // Ghi nhận mọi cú bấm: tên nút, loại, thẻ HTML, trang
    addColumn('events', 'kind', "TEXT NOT NULL DEFAULT ''");
    addColumn('events', 'label', "TEXT NOT NULL DEFAULT ''");
    addColumn('events', 'tag', "TEXT NOT NULL DEFAULT ''");
    addColumn('events', 'page', "TEXT NOT NULL DEFAULT ''");
    db.exec(`CREATE INDEX IF NOT EXISTS ix_e_dom_ts ON events(domain_id, ts);
      CREATE TABLE IF NOT EXISTS pending_events (
        id INTEGER PRIMARY KEY, visit_id TEXT NOT NULL, domain_id INTEGER NOT NULL, ts INTEGER NOT NULL, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_pe_visit ON pending_events(visit_id);
      CREATE TABLE IF NOT EXISTS campaigns (
        domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE, cid TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
        updated_at INTEGER, PRIMARY KEY (domain_id, cid)
      );
      CREATE TABLE IF NOT EXISTS alerts_state (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', ts INTEGER);`);
    // Cú bấm ghi trước v4 chưa có loại: suy ra từ dữ liệu cũ (chỉ cập nhật, không xoá)
    db.exec(`UPDATE events SET kind = CASE WHEN offer<>'' THEN 'offer' WHEN target<>'' THEN 'outbound' ELSE 'button' END
      WHERE kind='' AND type='click'`);
  },
};
export const SCHEMA_VERSION = Math.max(BASE_VERSION, ...Object.keys(MIGRATIONS).map(Number));
{
  let v = db.prepare('PRAGMA user_version').get().user_version;
  if (v < BASE_VERSION) v = BASE_VERSION;
  for (let n = v + 1; n <= SCHEMA_VERSION; n++) {
    db.exec('BEGIN');
    try { MIGRATIONS[n](); db.exec(`PRAGMA user_version = ${n}`); db.exec('COMMIT'); console.log(`[db] Đã nâng cấp cấu trúc lên v${n}`); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  // Đảm bảo bảng/cột của mọi bản tồn tại kể cả khi user_version bị đặt sai
  for (const n of Object.keys(MIGRATIONS)) MIGRATIONS[n]();
  if (db.prepare('PRAGMA user_version').get().user_version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** Đóng DB an toàn khi tắt: ghi hết WAL vào file chính */
export function closeDb() {
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { }
  try { db.close(); } catch { }
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayOf = (ts) => dayFmt.format(new Date(ts));
export const todayStr = () => dayOf(Date.now());
export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}
