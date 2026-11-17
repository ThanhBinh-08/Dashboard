// IP truy cập: IP nào bấm vào vị trí nào, đến từ đâu, và đánh dấu Click tặc.
// Click tặc = một IP bấm CÙNG MỘT VỊ TRÍ (cùng domain + trang + nút) từ FRAUD_CLICKS lần trở lên trong FRAUD_MINUTES phút.
import { db } from './db.js';
import { parseFilter, where } from './stats.js';
import { sendTelegram, alertsEnabled } from './alerts.js';

const num = (k, def, min) => { const n = +process.env[k]; return Number.isFinite(n) && n >= min ? n : def; };
export const FRAUD = { clicks: Math.round(num('FRAUD_CLICKS', 10, 2)), minutes: num('FRAUD_MINUTES', 10, 1) };

const LABEL = "CASE WHEN e.label<>'' THEN e.label WHEN e.target<>'' THEN e.target ELSE e.position END";
const PAGE = "CASE WHEN e.page<>'' THEN e.page ELSE v.path END";
const escH = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const Q = {
  flagGet: db.prepare('SELECT * FROM ip_flags WHERE ip=?'),
  flagSet: db.prepare(`INSERT INTO ip_flags(ip,status,auto,reason,domain_id,page,label,clicks,ts,username) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(ip) DO UPDATE SET status=excluded.status, auto=excluded.auto, reason=excluded.reason, domain_id=excluded.domain_id,
      page=excluded.page, label=excluded.label, clicks=excluded.clicks, ts=excluded.ts, username=excluded.username`),
  flagDel: db.prepare('DELETE FROM ip_flags WHERE ip=?'),
  burst: db.prepare(`SELECT COUNT(*) n FROM events e JOIN visits v ON v.id=e.visit_id
    WHERE v.ip=? AND v.ts>=? AND e.ts>? AND e.ts<=? AND e.type='click' AND e.domain_id=?
      AND e.page=? AND e.kind=? AND e.label=? AND e.target=? AND e.position=? AND e.offer=?`),
  host: db.prepare('SELECT host FROM domains WHERE id=?'),
};

/** Gọi sau mỗi cú bấm: IP này vừa bấm cùng một vị trí quá nhiều lần liên tục -> đánh dấu Click tặc. */
export function checkFraud(ip, ev) {
  if (!ip) return false;
  const cur = Q.flagGet.get(ip);
  if (cur) return false; // đã đánh dấu (Click tặc) hoặc đã được người dùng xác nhận An toàn
  const n = Q.burst.get(ip, ev.ts - 864e5, ev.ts - FRAUD.minutes * 60e3, ev.ts, ev.domain_id, ev.page, ev.kind, ev.label, ev.target, ev.position, ev.offer).n;
  if (n < FRAUD.clicks) return false;
  const label = ev.label || ev.target || ev.position;
  const reason = `Bấm ${n} lần vào cùng một vị trí trong ${FRAUD.minutes} phút`;
  Q.flagSet.run(ip, 'fraud', 1, reason, ev.domain_id, ev.page, label, n, ev.ts, '');
  const host = (Q.host.get(ev.domain_id) || {}).host || '';
  console.log(`[click tặc] ${ip}: ${reason} – "${label}" tại ${host}${ev.page}`);
  if (alertsEnabled()) sendTelegram(`🚨 <b>Click tặc</b>: IP <code>${escH(ip)}</code>\n${escH(reason)}\nNút: <b>${escH(label)}</b>\nTrang: ${escH(host + ev.page)}`).catch(() => { });
  return true;
}

/** Đánh dấu tay: 'fraud' = Click tặc, 'safe' = An toàn (không tự đánh dấu nữa), '' = bỏ đánh dấu (tự động xét lại) */
export function setFlag(ip, status, username) {
  if (!ip) return { error: 'Thiếu IP' };
  if (status === 'fraud' || status === 'safe') {
    Q.flagSet.run(ip, status, 0, status === 'fraud' ? 'Đánh dấu tay' : 'Xác nhận an toàn', null, '', '', 0, Date.now(), username || '');
  } else Q.flagDel.run(ip);
  return { ok: true, flag: Q.flagGet.get(ip) || null };
}

/** Danh sách IP: lượt vào, lượt bấm, nơi đến, vị trí bấm nhiều nhất, trạng thái Click tặc */
export function ipReport(q) {
  const f = parseFilter(q); const { w, p } = where(f);
  const rows = db.prepare(`
    WITH a AS (SELECT v.ip, MAX(v.ts) last_ts, v.country, v.region, v.city, COUNT(*) visits, SUM(v.channel='ads') ads,
                 SUM(v.clicks) clicks, SUM(v.copies) copies, COUNT(DISTINCT v.visitor) visitors
               FROM visits v WHERE ${w} AND v.ip<>'' GROUP BY v.ip),
    ev AS (SELECT v.ip, e.domain_id, ${PAGE} page, e.kind, ${LABEL} label, e.offer, COUNT(*) clicks
           FROM events e JOIN visits v ON v.id=e.visit_id WHERE ${w} AND v.ip<>'' AND e.type='click'
           GROUP BY v.ip, e.domain_id, 3, e.kind, 5, e.offer),
    top AS (SELECT ev.*, ROW_NUMBER() OVER (PARTITION BY ip ORDER BY clicks DESC) rn, COUNT(*) OVER (PARTITION BY ip) spots FROM ev)
    SELECT a.*, COALESCE(t.spots,0) spots, COALESCE(t.clicks,0) top_clicks, COALESCE(t.label,'') top_label, COALESCE(t.page,'') top_page,
      COALESCE(t.kind,'') top_kind, COALESCE(d.host,'') top_host, COALESCE(fl.status,'') status, COALESCE(fl.auto,0) auto, COALESCE(fl.reason,'') reason, fl.ts flag_ts
    FROM a LEFT JOIN top t ON t.ip=a.ip AND t.rn=1 LEFT JOIN domains d ON d.id=t.domain_id LEFT JOIN ip_flags fl ON fl.ip=a.ip
    ORDER BY (COALESCE(fl.status,'')='fraud') DESC, a.clicks DESC, a.visits DESC LIMIT 5000`).all(...p, ...p);
  const kpi = db.prepare(`SELECT COUNT(DISTINCT v.ip) ips, COUNT(*) visits, COALESCE(SUM(v.clicks),0) clicks,
      COUNT(DISTINCT CASE WHEN fl.status='fraud' THEN v.ip END) fraud_ips,
      COALESCE(SUM(CASE WHEN fl.status='fraud' THEN 1 ELSE 0 END),0) fraud_visits,
      COALESCE(SUM(CASE WHEN fl.status='fraud' THEN v.clicks ELSE 0 END),0) fraud_clicks,
      COALESCE(SUM(CASE WHEN fl.status='fraud' AND v.channel='ads' THEN 1 ELSE 0 END),0) fraud_ads
    FROM visits v LEFT JOIN ip_flags fl ON fl.ip=v.ip WHERE ${w} AND v.ip<>''`).get(...p);
  kpi.no_ip = db.prepare(`SELECT COUNT(*) n FROM visits v WHERE ${w} AND v.ip=''`).get(...p).n;
  return { from: f.from, to: f.to, rule: FRAUD, kpi, rows };
}

/** Chi tiết một IP: đến từ đâu, đã bấm những vị trí nào, các lượt vào và nhật ký bấm */
export function ipDetail(ip, q) {
  const f = parseFilter(q); const { w: w0, p: p0 } = where(f);
  const w = w0 + ' AND v.ip=?', p = [...p0, ip];
  const all = (sql) => db.prepare(sql).all(...p);
  const kpi = db.prepare(`SELECT COUNT(*) visits, COALESCE(SUM(v.channel='ads'),0) ads, COALESCE(SUM(v.clicks),0) clicks, COALESCE(SUM(v.copies),0) copies,
      COUNT(DISTINCT v.visitor) visitors, MIN(v.ts) first_ts FROM visits v WHERE ${w}`).get(...p);
  if (!kpi.visits) return null;
  const last = db.prepare(`SELECT v.ts, v.country, v.region, v.city FROM visits v WHERE ${w} ORDER BY v.ts DESC LIMIT 1`).get(...p);
  return {
    ip, from: f.from, to: f.to, rule: FRAUD, flag: Q.flagGet.get(ip) || null, kpi: { ...kpi, last_ts: last.ts },
    geo: { country: last.country, region: last.region, city: last.city },
    places: all(`SELECT v.country, v.region, v.city, COUNT(*) visits FROM visits v WHERE ${w} GROUP BY v.country, v.region, v.city ORDER BY visits DESC LIMIT 20`),
    bySource: all(`SELECT v.channel, v.source, COUNT(*) visits, SUM(v.clicks) clicks FROM visits v WHERE ${w} GROUP BY v.channel, v.source ORDER BY visits DESC LIMIT 100`),
    byDevice: all(`SELECT v.device, v.os, v.browser, COUNT(*) visits FROM visits v WHERE ${w} GROUP BY v.device, v.os, v.browser ORDER BY visits DESC LIMIT 50`),
    spots: all(`SELECT d.host, ${PAGE} page, e.kind, ${LABEL} label, e.position, e.offer, COUNT(*) clicks, COUNT(DISTINCT e.visit_id) visits, MIN(e.ts) first_ts, MAX(e.ts) last_ts
      FROM events e JOIN visits v ON v.id=e.visit_id JOIN domains d ON d.id=e.domain_id
      WHERE ${w} AND e.type='click' GROUP BY e.domain_id, 2, e.kind, 4, e.position, e.offer ORDER BY clicks DESC LIMIT 1000`),
    visits: all(`SELECT v.ts, d.host, v.path, COALESCE(s.name,'') store_name, v.channel, v.source, v.keyword, v.campaign, v.referrer, v.device, v.os, v.browser, v.clicks, v.copies
      FROM visits v JOIN domains d ON d.id=v.domain_id LEFT JOIN stores s ON s.id=v.store_id WHERE ${w} ORDER BY v.ts DESC LIMIT 300`),
    events: all(`SELECT e.ts, e.type, e.kind, ${LABEL} label, ${PAGE} page, e.position, d.host
      FROM events e JOIN visits v ON v.id=e.visit_id JOIN domains d ON d.id=e.domain_id WHERE ${w} ORDER BY e.ts DESC, e.id DESC LIMIT 1000`),
  };
}
