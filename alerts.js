// Cảnh báo qua Telegram khi trạng thái domain THAY ĐỔI (không gửi lặp lại).
// Cấu hình: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (có thể nhiều chat, cách nhau bởi dấu phẩy).
import { db } from './db.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHATS = String(process.env.TELEGRAM_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
export const alertsEnabled = () => !!(TOKEN && CHATS.length);

const getState = db.prepare('SELECT value FROM alerts_state WHERE key=?');
const setState = db.prepare('INSERT INTO alerts_state(key,value,ts) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, ts=excluded.ts');

export async function sendTelegram(text) {
  if (!alertsEnabled()) return false;
  let ok = true;
  for (const chat of CHATS) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      });
      if (!r.ok) { ok = false; console.error('[alerts] Telegram lỗi', r.status, (await r.text()).slice(0, 200)); }
    } catch (e) { ok = false; console.error('[alerts] Telegram lỗi', e.message); }
  }
  return ok;
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const day = 864e5;

/** Tính trạng thái hiện tại của từng domain, so với lần trước, gửi khi đổi. */
export async function checkAlerts() {
  if (!alertsEnabled()) return;
  const now = Date.now();
  const doms = db.prepare('SELECT * FROM domains WHERE active=1').all();
  const lastHit = db.prepare('SELECT MAX(ts) t FROM visits WHERE domain_id=?');
  const msgs = [];
  for (const d of doms) {
    const h = esc(d.host);
    const rules = [
      ['down', d.http_checked ? (d.http_status >= 200 && d.http_status < 400 ? 'ok' : 'bad') : '',
        `🔴 <b>${h}</b> không truy cập được (${d.http_status ? 'HTTP ' + d.http_status : esc(d.http_error || 'lỗi kết nối')})`, `🟢 <b>${h}</b> đã truy cập lại được`],
      ['ssl', d.ssl_expires ? (d.ssl_expires - now < 14 * day ? 'bad' : 'ok') : '',
        `🔐 SSL của <b>${h}</b> sắp hết hạn: ${d.ssl_expires ? new Date(d.ssl_expires).toLocaleDateString('vi-VN') : ''}`, `🔐 SSL của <b>${h}</b> đã được gia hạn`],
      ['reg', d.reg_expires ? (d.reg_expires - now < 30 * day ? 'bad' : 'ok') : '',
        `📅 Domain <b>${h}</b> sắp hết hạn: ${d.reg_expires ? new Date(d.reg_expires).toLocaleDateString('vi-VN') : ''}`, `📅 Domain <b>${h}</b> đã được gia hạn`],
    ];
    const t = lastHit.get(d.id).t;
    // chỉ cảnh báo ngừng nhận dữ liệu với domain đã từng nhận dữ liệu
    rules.push(['track', t ? (now - t > day ? 'bad' : 'ok') : '',
      `📉 <b>${h}</b> không nhận được dữ liệu theo dõi hơn 24 giờ (lần cuối ${t ? new Date(t).toLocaleString('vi-VN') : '—'})`, `📈 <b>${h}</b> đã nhận dữ liệu trở lại`]);
    for (const [k, state, bad, ok] of rules) {
      if (!state) continue;
      const key = `${d.id}:${k}`, prev = (getState.get(key) || {}).value;
      if (prev === state) continue;
      setState.run(key, state, now);
      if (prev === undefined && state === 'ok') continue; // lần đầu & bình thường: không báo
      msgs.push(state === 'bad' ? bad : ok);
    }
  }
  if (msgs.length) await sendTelegram('<b>Domain Manager</b>\n' + msgs.join('\n'));
}

export function startAlerts() {
  if (!alertsEnabled()) { console.log('[alerts] Chưa cấu hình Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) – bỏ qua cảnh báo'); return; }
  const run = () => checkAlerts().catch((e) => console.error('[alerts]', e.message));
  setTimeout(run, 90e3).unref();
  setInterval(run, 5 * 60e3).unref();
  console.log('[alerts] Đã bật cảnh báo Telegram');
}
