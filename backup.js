// Sao lưu tự động: VACUUM INTO tạo bản sao nhất quán ngay cả khi DB đang ghi (chế độ WAL).
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR, todayStr } from './db.js';

export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const KEEP = Math.max(1, +process.env.BACKUP_KEEP || 14);
const NAME_RE = /^dashboard-\d{4}-\d{2}-\d{2}(-\d{6})?\.db$/;

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => NAME_RE.test(f)).map((f) => {
    const st = fs.statSync(path.join(BACKUP_DIR, f));
    return { name: f, size: st.size, ts: st.mtimeMs };
  }).sort((a, b) => b.ts - a.ts);
}

export function createBackup(manual = false) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const t = new Date();
  const hms = [t.getHours(), t.getMinutes(), t.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
  const name = `dashboard-${todayStr()}${manual ? '-' + hms : ''}.db`;
  const file = path.join(BACKUP_DIR, name);
  if (fs.existsSync(file)) return { name, skipped: true };
  const tmp = file + '.tmp';
  try { fs.rmSync(tmp, { force: true }); } catch { }
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  fs.renameSync(tmp, file);
  prune();
  return { name, size: fs.statSync(file).size };
}

function prune() {
  const all = listBackups();
  const auto = all.filter((b) => !/-\d{6}\.db$/.test(b.name));
  const manual = all.filter((b) => /-\d{6}\.db$/.test(b.name));
  for (const b of [...auto.slice(KEEP), ...manual.slice(KEEP)]) { try { fs.rmSync(path.join(BACKUP_DIR, b.name)); } catch { } }
}

export function backupPath(name) {
  if (!NAME_RE.test(name)) return null;
  const f = path.join(BACKUP_DIR, name);
  return fs.existsSync(f) ? f : null;
}

export function startBackups() {
  if (process.env.BACKUP === '0') return;
  const run = () => { try { const r = createBackup(); if (!r.skipped) console.log('[backup] Đã sao lưu', r.name); } catch (e) { console.error('[backup] Lỗi sao lưu:', e.message); } };
  setTimeout(run, 30e3).unref();
  setInterval(run, 3600e3).unref(); // mỗi giờ kiểm tra, mỗi ngày tạo 1 bản
}
