import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TZ = process.env.DASH_TZ || 'Asia/Ho_Chi_Minh';
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'dashboard.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT UNIQUE NOT NULL,
  site_key TEXT UNIQUE NOT NULL,
  store_pattern TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER,
  UNIQUE(domain_id, slug)
);
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  visitor TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  keyword TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  entry INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  copies INTEGER NOT NULL DEFAULT 0,
  url TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_v_dom_day ON visits(domain_id, day);
CREATE INDEX IF NOT EXISTS ix_v_store_day ON visits(store_id, day);
CREATE INDEX IF NOT EXISTS ix_v_day ON visits(day);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  offer TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_e_visit ON events(visit_id);
CREATE INDEX IF NOT EXISTS ix_e_store ON events(store_id);
CREATE TABLE IF NOT EXISTS offers (
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  okey TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  last_seen INTEGER NOT NULL,
  PRIMARY KEY(store_id, okey)
);
`);

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayOf = (ts) => dayFmt.format(new Date(ts));
export const todayStr = () => dayOf(Date.now());
export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_PATTERN = '^/(?:store|stores|shop|brand|brands|coupons?|cua-hang|ma-giam-gia)/([^/?#]+)';

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
