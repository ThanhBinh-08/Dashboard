// Kiểm tra tình trạng domain: online (HTTP), chứng chỉ SSL, ngày hết hạn & nhà đăng ký (RDAP).
import tls from 'node:tls';
import { db } from './db.js';

const UPTIME_EVERY = (+process.env.UPTIME_MINUTES || 10) * 60e3;
const DEEP_EVERY = 12 * 3600e3; // SSL + RDAP
const UA = 'DomainTracker-Monitor/1.0';
// Đuôi 2 cấp phổ biến để tìm domain gốc khi kiểm tra RDAP
const SLD = /\.(co|com|net|org|gov|edu|ac|info|biz)\.[a-z]{2}$/i;

export function rootDomain(host) {
  const p = host.split('.');
  return p.slice(SLD.test(host) ? -3 : -2).join('.');
}

async function checkHttp(host) {
  const t = Date.now();
  for (const proto of ['https', 'http']) {
    try {
      const r = await fetch(`${proto}://${host}/`, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } });
      try { await r.body?.cancel(); } catch { }
      return { status: r.status, ms: Date.now() - t, error: '' };
    } catch (e) {
      if (proto === 'http') return { status: 0, ms: Date.now() - t, error: String(e.cause?.code || e.name || e.message).slice(0, 120) };
    }
  }
}
function checkSSL(host) {
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10000 }, () => {
      const c = s.getPeerCertificate();
      resolve(c && c.valid_to ? { expires: Date.parse(c.valid_to), issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || '', valid: s.authorized ? 1 : 0 } : null);
      s.end();
    });
    s.on('error', () => resolve(null));
    s.on('timeout', () => { s.destroy(); resolve(null); });
  });
}
async function checkRdap(host) {
  try {
    const r = await fetch('https://rdap.org/domain/' + rootDomain(host), { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/rdap+json', 'User-Agent': UA } });
    if (!r.ok) return null;
    const j = await r.json();
    const exp = (j.events || []).find((e) => e.eventAction === 'expiration');
    const reg = (j.entities || []).find((e) => (e.roles || []).includes('registrar'));
    const fn = reg && Array.isArray(reg.vcardArray) && (reg.vcardArray[1] || []).find((x) => x[0] === 'fn');
    return { expires: exp ? Date.parse(exp.eventDate) : null, registrar: fn ? String(fn[3]).slice(0, 120) : '' };
  } catch { return null; }
}

export async function checkDomain(d, deep = false) {
  const now = Date.now();
  const h = await checkHttp(d.host);
  db.prepare('UPDATE domains SET http_status=?, http_ms=?, http_error=?, http_checked=? WHERE id=?').run(h.status, h.ms, h.error, now, d.id);
  if (deep || !d.ssl_checked || now - d.ssl_checked > DEEP_EVERY) {
    const [s, r] = await Promise.all([checkSSL(d.host), checkRdap(d.host)]);
    db.prepare('UPDATE domains SET ssl_expires=?, ssl_issuer=?, ssl_valid=?, ssl_checked=? WHERE id=?').run(s ? s.expires : null, s ? s.issuer : '', s ? s.valid : null, now, d.id);
    db.prepare('UPDATE domains SET reg_expires=COALESCE(?, reg_expires), registrar=CASE WHEN ?<>\'\' THEN ? ELSE registrar END, reg_checked=? WHERE id=?')
      .run(r ? r.expires : null, r ? r.registrar : '', r ? r.registrar : '', now, d.id);
  }
}

let running = false;
async function tick() {
  if (running) return; running = true;
  try {
    const due = db.prepare('SELECT * FROM domains WHERE active=1 AND (http_checked IS NULL OR http_checked<?) ORDER BY http_checked').all(Date.now() - UPTIME_EVERY + 30e3);
    for (let i = 0; i < due.length; i += 5) await Promise.all(due.slice(i, i + 5).map((d) => checkDomain(d).catch(() => { })));
  } finally { running = false; }
}
export function startMonitor() {
  if (process.env.MONITOR === '0') return;
  setTimeout(tick, 5000);
  setInterval(tick, 60e3).unref();
}
