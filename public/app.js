'use strict';
/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);
const fmtDay = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
const fmtRange = (f, t) => (f === t ? fmtDay(f) : (f.slice(0, 4) === t.slice(0, 4) ? fmtDay(f).slice(0, 5) : fmtDay(f)) + ' – ' + fmtDay(t));
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('vi-VN') : '—');
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('vi-VN') : '—');
const today = () => new Date().toLocaleDateString('en-CA');
const daysLeft = (ts) => Math.floor((ts - Date.now()) / 864e5);
const hostOfUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
let regionNames; try { regionNames = new Intl.DisplayNames(['vi'], { type: 'region' }); } catch { }
const countryName = (c) => { if (!c) return 'Không rõ'; try { return (regionNames ? regionNames.of(c) : c) + ' (' + c + ')'; } catch { return c; } };
const rateBadge = (r) => { const p = Math.round(r * 100); return `<span class="rate ${p >= 40 ? 'g' : p >= 15 ? 'o' : 'b'}">${p}%</span>`; };
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 2800); }
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error('Chưa đăng nhập'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Có lỗi xảy ra');
  return j;
}
async function copyText(t, msg = 'Đã sao chép') { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); } toast(msg); }
function downloadCSV(name, lines) {
  const csv = '﻿' + lines.map((l) => l.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click();
}

const RANGES = [['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['7d', '7 ngày qua'], ['14d', '14 ngày qua'], ['30d', '30 ngày qua'], ['90d', '90 ngày qua'], ['thismonth', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['custom', 'Tuỳ chọn...']];
const CHANNELS = [['all', 'Tất cả các kênh'], ['ads', 'Quảng cáo (Ads)'], ['organic', 'Tìm kiếm tự nhiên'], ['direct', 'Truy cập trực tiếp'], ['other', 'Khác (mạng xã hội, trang khác, email...)']];
const CH_LABEL = { ads: 'Quảng cáo trả phí', organic: 'Tìm kiếm tự nhiên', direct: 'Truy cập trực tiếp', other: 'Khác' };
const KIND_LABEL = { offer: 'Ưu đãi', outbound: 'Link ra ngoài', internal: 'Link nội bộ', button: 'Nút', other: 'Khác', '': 'Khác' };
const kindTag = (k) => `<span class="tag k-${esc(k || 'other')}">${KIND_LABEL[k] || esc(k) || 'Khác'}</span>`;
const DEV_LABEL = { mobile: 'Điện thoại', desktop: 'Máy tính', tablet: 'Máy tính bảng', '': 'Không rõ' };
const OFFER_TYPE = { code: 'Mã giảm giá', deal: 'Ưu đãi' };
const ROLE_LABEL = { admin: 'Quản trị viên', editor: 'Biên tập viên', viewer: 'Nhân viên (chỉ xem)' };
const STATUS_LABEL = { active: 'Hiển thị', hidden: 'Ẩn', published: 'Đã xuất bản', draft: 'Bản nháp' };
const SOURCE_LABEL = { tracker: 'Tự động', import: 'Import', manual: 'Nhập tay' };
const TPL_TYPES = [['store', 'Cửa hàng'], ['offer', 'Mã & ưu đãi'], ['post', 'Bài viết'], ['page', 'Trang tĩnh'], ['faq', 'Câu hỏi thường gặp'], ['event', 'Sự kiện khuyến mãi'], ['category', 'Danh mục']];
const IMPORT_KIND = { domains: 'Domain', stores: 'Cửa hàng', offers: 'Mã & ưu đãi' };
const statusBadge = (s) => `<span class="badge-s ${s === 'active' || s === 'published' ? 'g' : ''}">${STATUS_LABEL[s] || esc(s)}</span>`;

const IC = {
  home: '<path d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>',
  chart: '<path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/>',
  key: '<path d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"/>',
  stack: '<path d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122"/>',
  people: '<path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>',
  tray: '<path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>',
  chevUp: '<path d="m4.5 15.75 7.5-7.5 7.5 7.5"/>',
  chevDown: '<path d="m19.5 8.25-7.5 7.5-7.5-7.5"/>',
  chevRight: '<path d="m8.25 4.5 7.5 7.5-7.5 7.5"/>',
  x: '<path d="M6 18 18 6M6 6l12 12"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  store: '<path d="M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  doc: '<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  search: '<path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>',
  open: '<path d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 5.3M20 4v7h-7"/>',
};
const icon = (n, cls = '') => `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''}>${IC[n]}</svg>`;
const FILTER_SVG = '<svg viewBox="0 0 20 20"><path d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"/></svg>';

/* ================= state ================= */
const DEFAULTS = { domain: 0, group: '', range: '7d', from: '', to: '', channel: 'all', country: '', active: true, sort: 'visits', dir: 'desc', page: 1, per: 10, q: '', kq: '', kstore: 0, ksort: 'visits', kdir: 'desc', kpage: 1, navClosed: [], res: {} };
let S = { ...DEFAULTS }; try { Object.assign(S, JSON.parse(localStorage.getItem('dm_state') || '{}')); } catch { }
const save = () => { try { localStorage.setItem('dm_state', JSON.stringify(S)); } catch { } };
let ME = null, DOMAINS = [], GROUPS = [];
const isAdmin = () => ME && ME.role === 'admin';
const canEdit = () => ME && (ME.role === 'admin' || ME.role === 'editor');
const curDomain = () => DOMAINS.find((d) => d.id === S.domain);

function qs(extra = {}) {
  const o = { domain: S.domain || '', group: S.domain ? '' : S.group, range: S.range, channel: S.channel, country: S.country, ...extra };
  if (o.range === 'custom') { o.from = extra.from ?? S.from; o.to = extra.to ?? S.to; }
  return new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();
}

/* ================= auth & shell ================= */
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); closeModal(); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = new FormData(e.target); $('#loginErr').textContent = '';
  try { await api('/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } }); await boot(); }
  catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logoutBtn').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => { }); showLogin(); };
$('#menuToggle').onclick = () => $('#sidebar').classList.toggle('open');
$('#sbOverlay').onclick = () => $('#sidebar').classList.remove('open');
$('#avatarBtn').onclick = (e) => { e.stopPropagation(); $('#userPop').classList.toggle('hidden'); };
document.addEventListener('click', (e) => { if (!e.target.closest('#userPop') || e.target.closest('a,button')) $('#userPop').classList.add('hidden'); });
$('#pwBtn').onclick = () => {
  openModal(`<div class="m-head"><h2>Đổi mật khẩu</h2><button class="m-close" data-close>×</button></div>
    <form class="m-body form" id="pwForm"><label>Mật khẩu hiện tại<input type="password" name="old" required></label>
    <label>Mật khẩu mới<input type="password" name="new" minlength="6" required></label>
    <button class="btn primary">Lưu</button></form>`, 'sm');
  $('#pwForm').onsubmit = async (e) => { e.preventDefault(); try { await api('/me/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('Đã đổi mật khẩu'); } catch (er) { toast(er.message, 1); } };
};

const NAV = [
  { items: [['dashboard', 'Bảng điều khiển', 'home'], ['performance', 'Hiệu quả cửa hàng', 'chart'], ['keywords', 'Từ khoá', 'key']] },
  { title: 'Dữ liệu chính', items: [['categories', 'Danh mục', 'stack'], ['stores', 'Cửa hàng', 'stack'], ['offers', 'Mã & ưu đãi', 'stack'], ['promo_events', 'Sự kiện khuyến mãi', 'stack']] },
  { title: 'Nội dung', items: [['pages', 'Trang tĩnh', 'stack'], ['posts', 'Bài viết', 'stack'], ['faqs', 'Câu hỏi thường gặp', 'stack'], ['templates', 'Mẫu nội dung', 'stack']] },
  { title: 'Hệ thống', items: [['users', 'Nhân viên', 'people', 'admin'], ['imports', 'Lịch sử import', 'tray']] },
];
const curView = () => (location.hash.slice(2) || 'performance').split('?')[0];
function renderNav() {
  const cur = curView();
  $('#nav').innerHTML = NAV.map((g) => {
    const items = g.items.filter((n) => !(n[3] === 'admin' && !isAdmin()))
      .map((n) => `<a href="#/${n[0]}" class="${cur === n[0] ? 'active' : ''}">${icon(n[2])}${n[1]}</a>`).join('');
    return g.title ? `<div class="grp ${S.navClosed.includes(g.title) ? 'closed' : ''}" data-grp="${esc(g.title)}">${g.title}${icon('chevUp')}</div><div class="grp-items">${items}</div>` : items;
  }).join('');
  $$('[data-grp]').forEach((el) => (el.onclick = () => {
    const t = el.dataset.grp; S.navClosed = S.navClosed.includes(t) ? S.navClosed.filter((x) => x !== t) : [...S.navClosed, t]; save(); el.classList.toggle('closed');
  }));
}
async function loadDomains() {
  [DOMAINS, GROUPS] = await Promise.all([api('/domains'), api('/domain-groups')]);
  if (S.domain && !DOMAINS.some((d) => d.id === S.domain)) { S.domain = 0; save(); }
  if (S.group && !GROUPS.some((g) => g.category === S.group)) { S.group = ''; save(); }
  const v = S.domain ? String(S.domain) : S.group ? 'g:' + S.group : '0';
  $('#domainSel').innerHTML = `<option value="0">Tất cả domain (${DOMAINS.length})</option>`
    + (GROUPS.length ? `<optgroup label="Nhóm domain">${GROUPS.map((g) => `<option value="g:${esc(g.category)}">Nhóm: ${esc(g.category)} (${g.n})</option>`).join('')}</optgroup>` : '')
    + `<optgroup label="Domain">${DOMAINS.map((d) => `<option value="${d.id}">${esc(d.name)}${d.name !== d.host ? ' – ' + esc(d.host) : ''}</option>`).join('')}</optgroup>`;
  $('#domainSel').value = v;
}
function setScope(v) {
  v = String(v);
  if (v.startsWith('g:')) { S.group = v.slice(2); S.domain = 0; } else { S.domain = +v; S.group = ''; }
  S.page = 1; S.kpage = 1; S.kstore = 0; S.country = ''; Object.values(S.res).forEach((r) => { r.page = 1; r.f = {}; }); save();
  $('#domainSel').value = v;
}
$('#domainSel').onchange = (e) => { setScope(e.target.value); render(); };

async function boot() {
  try { ME = await api('/me'); } catch { return; }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdmin()));
  $('#meName').textContent = ME.name || ME.username; $('#meRole').textContent = ROLE_LABEL[ME.role] || ME.role;
  $('#avatarBtn').textContent = (ME.name || ME.username).trim().split(/\s+/).map((w) => w[0]).slice(-2).join('').toUpperCase();
  await loadDomains(); render();
}
window.addEventListener('hashchange', () => { $('#sidebar').classList.remove('open'); closeModal(); render(); });

const VIEWS = {};
async function render() {
  renderNav();
  const v = VIEWS[curView()] || VIEWS.performance;
  try { await v(); } catch (e) { if (e.message !== 'Chưa đăng nhập') $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}

/* ================= modal ================= */
function openModal(html, size = '') { const b = $('#modalBox'); b.className = 'modal-box ' + size; $('#modal').className = 'modal' + (size === 'slide' ? ' slide' : ''); b.innerHTML = html; $('#modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modal').classList.add('hidden'); document.body.style.overflow = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
function confirmBox(title, html, okLabel = 'Xoá') {
  return new Promise((resolve) => {
    openModal(`<div class="m-head"><h2>${esc(title)}</h2><button class="m-close" data-close>×</button></div><div class="m-body">${html}</div>
      <div class="m-foot"><button class="btn" data-close>Huỷ</button><span style="flex:1"></span><button class="btn danger" id="cfOk">${esc(okLabel)}</button></div>`, 'sm');
    $('#cfOk').onclick = () => { closeModal(); resolve(true); };
  });
}

/* ================= shared filter bar ================= */
async function filtersHTML({ channel = true, country = true } = {}) {
  let countries = [];
  if (country) countries = await api('/countries?' + qs()).catch(() => []);
  const custom = S.range === 'custom' ? `<div class="f"><span>Từ ngày</span><input type="date" id="fFrom" value="${esc(S.from)}"></div><div class="f"><span>Đến ngày</span><input type="date" id="fTo" value="${esc(S.to)}"></div>` : '';
  return `<div class="filters">
    <div class="f"><span>Khoảng thời gian</span><select id="fRange">${RANGES.map(([v, l]) => `<option value="${v}" ${S.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${custom}
    ${channel ? `<div class="f"><span>Kênh</span><select id="fChannel">${CHANNELS.map(([v, l]) => `<option value="${v}" ${S.channel === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    ${country ? `<div class="f"><span>Quốc gia</span><select id="fCountry" class="${S.country ? '' : 'placeholder'}"><option value="">Tất cả quốc gia</option>${countries.map((c) => `<option value="${esc(c.country || '--')}" ${S.country === (c.country || '--') ? 'selected' : ''}>${esc(countryName(c.country))} · ${fmt(c.visits)}</option>`).join('')}${S.country && !countries.some((c) => (c.country || '--') === S.country) ? `<option value="${esc(S.country)}" selected>${esc(countryName(S.country === '--' ? '' : S.country))}</option>` : ''}</select></div>` : ''}
  </div>`;
}
function bindFilters(rerender) {
  const on = (id, fn) => { const el = $(id); if (el) el.onchange = fn; };
  on('#fRange', (e) => {
    S.range = e.target.value;
    if (S.range === 'custom' && !S.from) { const t = new Date(); S.to = t.toLocaleDateString('en-CA'); t.setDate(t.getDate() - 7); S.from = t.toLocaleDateString('en-CA'); }
    S.page = S.kpage = 1; save(); rerender();
  });
  on('#fFrom', (e) => { S.from = e.target.value; S.page = S.kpage = 1; save(); rerender(); });
  on('#fTo', (e) => { S.to = e.target.value; S.page = S.kpage = 1; save(); rerender(); });
  on('#fChannel', (e) => { S.channel = e.target.value; S.page = S.kpage = 1; save(); rerender(); });
  on('#fCountry', (e) => { S.country = e.target.value; S.page = S.kpage = 1; save(); rerender(); });
}
function pagerHTML(total, page, per, label = 'kết quả') {
  const pages = Math.max(1, Math.ceil(total / per));
  const from = total ? (page - 1) * per + 1 : 0, to = Math.min(total, page * per);
  const nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return `<div class="pager"><span>Đang hiện từ ${from} đến ${to} của ${fmt(total)} ${label}</span>
    <span class="per"><span>Mỗi trang</span><select data-per>${[10, 20, 50, 100].map((n) => `<option ${n === per ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
    <span class="pages">${nums.map((n) => n === '…' ? '<button disabled>…</button>' : `<button data-page="${n}" class="${n === page ? 'on' : ''}">${n}</button>`).join('')}<button data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Trang sau">${icon('chevRight')}</button></span></div>`;
}
function bindPager(root, onPage, onPer) {
  $$('[data-page]', root).forEach((b) => (b.onclick = () => onPage(+b.dataset.page)));
  const p = $('[data-per]', root); if (p) p.onchange = (e) => onPer(+e.target.value);
}
function sortTh(label, key, cur, dir, cls = '') { const on = cur === key; return `<th class="sort ${cls} ${on ? dir : ''}" data-sort="${key}">${label}${icon(on && dir === 'asc' ? 'chevUp' : 'chevDown', 'chv')}</th>`; }
function needDomainHTML(title) {
  return `<div class="page-head"><h1>${esc(title)}</h1></div><div class="card pick-domain">
    ${DOMAINS.length ? `<div>Dữ liệu ${esc(title.toLowerCase())} được quản lý riêng cho từng domain. Hãy chọn một domain:</div>
    <select id="pickDom"><option value="">— Chọn domain —</option>${DOMAINS.map((d) => `<option value="${d.id}">${esc(d.name)} – ${esc(d.host)}</option>`).join('')}</select>`
    : `<div>Chưa có domain nào.</div><a class="btn primary" href="#/domains">+ Thêm domain đầu tiên</a>`}</div>`;
}
function bindNeedDomain() { const s = $('#pickDom'); if (s) s.onchange = (e) => { if (e.target.value) { setScope(e.target.value); render(); } }; }

/* ================= Bảng điều khiển ================= */
VIEWS.dashboard = async () => {
  const view = $('#view');
  const [fh, d, clicks] = await Promise.all([filtersHTML(), api('/overview?' + qs()), api('/clicks?' + qs({ limit: 20 }))]);
  const k = d.kpi, p = d.prev, c = d.counts, h = d.health;
  const delta = (a, b) => { if (!b) return a ? '<span class="delta up">mới</span>' : ''; const x = Math.round(((a - b) * 100) / b); return `<span class="delta ${x >= 0 ? 'up' : 'down'}">${x >= 0 ? '▲' : '▼'} ${Math.abs(x)}%</span>`; };
  const maxDay = Math.max(1, ...d.byDay.map((r) => r.visits));
  const scopeName = S.domain ? (curDomain() || {}).name : S.group ? 'Nhóm ' + S.group : 'Tất cả domain';
  const alert = (n, label, href) => `<a class="alert ${n ? 'bad' : 'ok'}" href="${href}"><b>${fmt(n)}</b><span>${label}</span></a>`;
  view.innerHTML = `<div class="page-head"><h1>Bảng điều khiển · ${esc(scopeName)}</h1><span class="sub">${fmtRange(d.from, d.to)}</span><span class="sp"></span>
    <span class="status"><span class="dot ${d.online ? 'on' : ''}"></span>${fmt(d.online)} người đang xem (5 phút)</span></div>${fh}
  ${!DOMAINS.length ? `<div class="card empty" style="margin-bottom:16px">Chưa có domain nào. <a href="#/domains">Thêm domain đầu tiên →</a></div>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="l">Lượt vào</div><div class="v">${fmt(k.visits)}</div><div class="s">${delta(k.visits, p.visits)} so với kỳ trước</div></div>
    <div class="kpi"><div class="l">Từ Ads</div><div class="v">${fmt(k.ads)}</div><div class="s">${pct(k.ads, k.visits)}% lượt vào</div></div>
    <div class="kpi"><div class="l">Tỉ lệ bấm</div><div class="v">${pct(k.clicked, k.visits)}%</div><div class="s">${fmt(k.clicked)} lượt vào có bấm</div></div>
    <div class="kpi"><div class="l">Lượt bấm</div><div class="v">${fmt(k.clicks)}</div><div class="s">${delta(k.clicks, p.clicks)}</div></div>
    <div class="kpi"><div class="l">Copy mã</div><div class="v">${fmt(k.copies)}</div><div class="s">${delta(k.copies, p.copies)}</div></div>
  </div>
  <div class="counts">
    <a class="kpi" href="#/domains"><div class="l">Domain</div><div class="v">${fmt(c.domains)}</div></a>
    <a class="kpi" href="#/stores"><div class="l">Cửa hàng</div><div class="v">${fmt(c.stores)}</div></a>
    <a class="kpi" href="#/offers"><div class="l">Ưu đãi đang chạy</div><div class="v">${fmt(c.offers)}</div></a>
    <a class="kpi" href="#/promo_events"><div class="l">Sự kiện đang diễn ra</div><div class="v">${fmt(c.events)}</div></a>
    <a class="kpi" href="#/posts"><div class="l">Bài viết</div><div class="v">${fmt(c.posts)}</div></a>
  </div>
  <div class="alerts">
    ${alert(h.down, 'domain đang không truy cập được', '#/domains')}
    ${alert(h.ssl, 'chứng chỉ SSL sắp hết hạn (&lt; 14 ngày)', '#/domains')}
    ${alert(h.expiring, 'domain sắp hết hạn (&lt; 30 ngày)', '#/domains')}
    ${alert(h.notracking, 'domain không nhận dữ liệu 2 ngày qua', '#/domains')}
  </div>
  <div class="card"><div class="card-head"><h3>Biểu đồ theo ngày</h3><span class="sp"></span><span class="legend"><i style="background:var(--c1)"></i>Lượt vào<i style="background:var(--c2)"></i>Lượt bấm<i style="background:var(--c3)"></i>Copy mã</span></div><div class="chart-wrap">${lineChart(d.byDay)}</div></div>
  <div class="card"><div class="card-head"><h3>Nút được bấm nhiều nhất</h3><span class="sub">${fmt(clicks.total.clicks)} lượt bấm · ${clicks.byKind.map((x) => (KIND_LABEL[x.kind] || 'Khác') + ' ' + fmt(x.clicks)).join(' · ')}</span><span class="sp"></span><button class="btn sm" id="clkCsv">Xuất CSV toàn bộ lượt bấm</button></div>
    <div class="table-wrap"><table><thead><tr><th>Nút</th><th>Loại</th><th>Trang</th>${!S.domain ? '<th>Domain</th>' : ''}<th class="r">Lượt vào có bấm</th><th class="r">Lượt bấm</th></tr></thead><tbody>
    ${clicks.rows.map((r) => `<tr><td class="clip"><b style="font-weight:500">${esc(r.label || '—')}</b></td><td>${kindTag(r.kind)}</td><td class="sub clip">${esc(r.page)}${r.store_name ? ' · ' + esc(r.store_name) : ''}</td>${!S.domain ? `<td class="sub">${esc(r.host)}</td>` : ''}<td class="r">${fmt(r.clicked)}</td><td class="r"><b>${fmt(r.clicks)}</b></td></tr>`).join('') || `<tr><td colspan="6" class="empty">Chưa có lượt bấm nào. Mọi nút được bấm trên website có mã nhúng sẽ hiện ở đây.</td></tr>`}</tbody></table></div></div>
  <div class="card"><div class="card-head"><h3>Theo ngày</h3></div><div class="table-wrap"><table>
    <thead><tr><th>Ngày</th><th style="width:40%"></th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead>
    <tbody>${d.byDay.slice().reverse().map((r) => `<tr><td>${fmtDay(r.day)}</td><td><div class="bar-track"><div class="bar" style="width:${(r.visits * 100) / maxDay}%"></div></div></td><td class="r"><b>${fmt(r.visits)}</b></td><td class="r">${r.visits ? pct(r.clicked, r.visits) + '%' : '—'}</td><td class="r">${fmt(r.clicks)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>Cửa hàng nổi bật</h3><span class="sp"></span><a class="link" href="#/performance">Xem tất cả →</a></div><div class="table-wrap"><table>
      <thead><tr><th>Cửa hàng</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Copy mã</th></tr></thead>
      <tbody>${d.topStores.map((r) => `<tr><td class="store-cell"><b><a class="link" style="color:inherit" href="javascript:void 0" data-detail="${r.id}">${esc(r.name || r.slug)}</a></b><span class="sub">${esc(r.host)}</span></td><td class="r">${fmt(r.visits)}</td><td class="r">${rateBadge(r.visits ? r.clicked / r.visits : 0)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có dữ liệu</td></tr>'}</tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>Theo kênh</h3></div><div class="table-wrap"><table>
      <thead><tr><th>Kênh</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead>
      <tbody>${d.byChannel.map((r) => `<tr><td><span class="tag ${r.channel}">${CH_LABEL[r.channel] || r.channel}</span></td><td class="r">${fmt(r.visits)}</td><td class="r">${pct(r.clicked, r.visits)}%</td><td class="r">${fmt(r.clicks)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có dữ liệu</td></tr>'}</tbody></table></div>
      <div class="card-head" style="border-top:1px solid var(--line)"><h3>Từ khoá hàng đầu</h3><span class="sp"></span><a class="link" href="#/keywords">Xem tất cả →</a></div>
      <div class="table-wrap"><table><tbody>${d.topKeywords.map((r) => `<tr><td>${esc(r.keyword)}</td><td class="r">${fmt(r.visits)} lượt</td><td class="r">${fmt(r.copies)} copy</td></tr>`).join('') || '<tr><td class="empty">Chưa có từ khoá (utm_term)</td></tr>'}</tbody></table></div></div>
  </div>
  ${!S.domain && d.byDomain.length > 1 ? `<div class="card" style="margin-top:16px"><div class="card-head"><h3>Theo domain</h3></div><div class="table-wrap"><table>
    <thead><tr><th>Domain</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead>
    <tbody>${d.byDomain.map((r) => `<tr><td class="store-cell"><b><a class="link" style="color:inherit" href="javascript:void 0" data-scope="${r.id}">${esc(r.name)}</a></b><span class="sub">${esc(r.host)}</span></td><td class="r">${fmt(r.visits)}</td><td class="r">${rateBadge(r.visits ? r.clicked / r.visits : 0)}</td><td class="r">${fmt(r.clicks)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  bindFilters(VIEWS.dashboard);
  $('#clkCsv').onclick = async () => {
    const all = await api('/clicks?' + qs({ limit: 0 }));
    downloadCSV(`luot-bam_${all.from}_${all.to}.csv`, [['Nút', 'Loại', 'Trang', 'Cửa hàng', 'Domain', 'Lượt vào có bấm', 'Lượt bấm', 'Lần cuối']]
      .concat(all.rows.map((r) => [r.label, KIND_LABEL[r.kind] || r.kind, r.page, r.store_name, r.host, r.clicked, r.clicks, fmtTime(r.last_ts)])));
  };
  $$('[data-detail]', view).forEach((a) => (a.onclick = () => openDetail(+a.dataset.detail)));
  $$('[data-scope]', view).forEach((a) => (a.onclick = () => { setScope(a.dataset.scope); render(); }));
};

/* ================= Hiệu quả cửa hàng ================= */
VIEWS.performance = async () => {
  const view = $('#view');
  view.innerHTML = (await filtersHTML()) + `<div class="card">
    <div class="card-head"><span class="sp"></span><div class="search">${icon('search')}<input type="text" id="q" placeholder="Tìm kiếm" value="${esc(S.q)}"></div>
      <div class="pop-wrap"><button class="icon-btn" id="fbtn" title="Bộ lọc">${FILTER_SVG}<span class="badge">${S.active ? 1 : ''}</span></button>
        <div class="popover hidden" id="fpop"><b>Bộ lọc</b><label><input type="checkbox" id="fActive" ${S.active ? 'checked' : ''}> Chỉ store có lượt truy cập</label></div></div></div>
    <div id="applied"></div><div class="table-wrap" id="tbl"></div><div id="pg"></div></div>`;
  bindFilters(VIEWS.performance);
  $('#q').oninput = debounce((e) => { S.q = e.target.value; S.page = 1; save(); load(); });
  $('#fbtn').onclick = (e) => { e.stopPropagation(); $('#fpop').classList.toggle('hidden'); };
  $('#fpop').onclick = (e) => e.stopPropagation();
  document.addEventListener('click', () => { const p = $('#fpop'); if (p) p.classList.add('hidden'); }, { once: true });
  const setActive = (v) => { S.active = v; S.page = 1; save(); $('#fbtn .badge').textContent = v ? 1 : ''; $('#fActive').checked = v; load(); };
  $('#fActive').onchange = (e) => setActive(e.target.checked);
  async function load() {
    const d = await api('/performance?' + qs({ q: S.q, active: S.active ? 1 : 0, sort: S.sort, dir: S.dir, page: S.page, per: S.per }));
    if (d.rows.length === 0 && S.page > 1 && d.total) { S.page = 1; return load(); }
    $('#applied').innerHTML = S.active ? `<div class="applied">Bộ lọc đang áp dụng <span class="chip">Chỉ store có lượt truy cập <button id="rmActive" aria-label="Bỏ bộ lọc">×</button></span><span class="sp"></span><button class="x-btn" id="rmAll" title="Xoá bộ lọc">${icon('x')}</button></div>` : '';
    const showDomain = !S.domain && DOMAINS.length > 1;
    $('#tbl').innerHTML = `<table class="nowrap"><thead><tr>
      ${sortTh('Cửa hàng', 'name', S.sort, S.dir)}${sortTh('Lượt vào', 'visits', S.sort, S.dir)}${sortTh('Từ Ads', 'ads', S.sort, S.dir)}
      ${sortTh('Tỉ lệ bấm', 'rate', S.sort, S.dir)}${sortTh('Lượt bấm', 'clicks', S.sort, S.dir)}${sortTh('Copy mã', 'copies', S.sort, S.dir)}
      ${sortTh('Quốc gia chính', 'country', S.sort, S.dir)}${sortTh('Ưu đãi đang chạy', 'offers', S.sort, S.dir)}<th></th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr>
        <td class="store-cell"><b>${esc(r.name || r.slug)}</b><span class="sub">${esc(r.url ? hostOfUrl(r.url) : r.slug)}</span>${showDomain ? `<span class="sub dom-line" title="Domain">${esc(r.host)}</span>` : ''}</td>
        <td>${fmt(r.visits)}</td><td>${fmt(r.ads)}<div class="sub">${pct(r.ads, r.visits)}%</div></td>
        <td>${rateBadge(r.rate)}</td><td>${fmt(r.clicks)}</td><td>${fmt(r.copies)}</td>
        <td>${r.country ? esc(countryName(r.country)) : '<span class="sub">—</span>'}</td><td><span class="pill-n">${r.offers}</span></td>
        <td class="acts"><button class="act pri" data-detail="${r.id}">${icon('search')} Chi tiết</button>
          <a class="act" href="${esc(r.open_url)}" target="_blank" rel="noopener">${icon('open')} Mở trang</a></td></tr>`).join('')
      || `<tr><td colspan="10" class="empty">${DOMAINS.length ? 'Không có cửa hàng nào trong khoảng thời gian / bộ lọc này' : 'Chưa có domain nào. <a href="#/domains">Thêm domain →</a>'}</td></tr>`}
      </tbody></table>`;
    $('#pg').innerHTML = pagerHTML(d.total, d.page, d.per);
    $$('[data-sort]', view).forEach((th) => (th.onclick = () => { const k = th.dataset.sort; if (S.sort === k) S.dir = S.dir === 'desc' ? 'asc' : 'desc'; else { S.sort = k; S.dir = ['name', 'country', 'host'].includes(k) ? 'asc' : 'desc'; } S.page = 1; save(); load(); }));
    $$('[data-detail]', view).forEach((b) => (b.onclick = () => openDetail(+b.dataset.detail)));
    bindPager(view, (pg) => { S.page = pg; save(); load(); }, (n) => { S.per = n; S.page = 1; save(); load(); });
    if ($('#rmActive')) { $('#rmActive').onclick = () => setActive(false); $('#rmAll').onclick = () => setActive(false); }
  }
  await load();
};

/* ================= Chi tiết cửa hàng (modal) ================= */
async function openDetail(id) {
  const F = { range: S.range, from: S.from, to: S.to, channel: S.channel, country: S.country };
  openModal(`<div class="m-head"><h2>Đang tải...</h2><button class="m-close" data-close>×</button></div><div class="m-body"></div>`, 'slide');
  async function load() {
    const d = await api(`/performance/${id}?` + qs({ domain: '', group: '', range: F.range, from: F.from, to: F.to, channel: F.channel, country: F.country }));
    const countries = await api('/countries?' + qs({ domain: d.store.domain_id, group: '', range: F.range, from: F.from, to: F.to })).catch(() => []);
    const k = d.kpi, s = d.store;
    const totalPosClicks = d.byPosition.reduce((a, r) => a + r.clicks, 0);
    const tr = (cells) => `<tr>${cells.join('')}</tr>`;
    const td = (v, cls = 'r') => `<td class="${cls}">${v}</td>`;
    const empty = (n) => `<tr><td colspan="${n}" class="empty" style="padding:14px">Chưa có dữ liệu</td></tr>`;
    $('#modalBox').innerHTML = `<div class="m-head"><h2 title="${esc(s.host)}">${esc(s.name || s.slug)} · ${fmtRange(d.from, d.to)}</h2><button class="m-close" data-close>×</button></div>
    <div class="m-body">
      <div class="d-top"><div><select id="dRange">${RANGES.filter((r) => r[0] !== 'custom' || F.range === 'custom').map(([v, l]) => `<option value="${v}" ${F.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="tabs">${CHANNELS.map(([v, l]) => `<button class="tab ${F.channel === v ? 'on' : ''}" data-ch="${v}">${l}</button>`).join('')}</div>
      <div class="d-country"><select id="dCountry"><option value="">Tất cả quốc gia</option>${countries.map((c) => `<option value="${esc(c.country || '--')}" ${F.country === (c.country || '--') ? 'selected' : ''}>${esc(countryName(c.country))}</option>`).join('')}</select></div></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Lượt vào</div><div class="v">${fmt(k.visits)}</div><div class="s">${fmt(k.entries)} lượt vào thẳng trang này</div></div>
        <div class="kpi"><div class="l">Tỉ lệ bấm</div><div class="v">${pct(k.clicked, k.visits)}%</div><div class="s">${fmt(k.clicked)} lượt vào có bấm</div></div>
        <div class="kpi"><div class="l">Lượt bấm</div><div class="v">${fmt(k.clicks)}</div></div>
        <div class="kpi"><div class="l">Copy mã</div><div class="v">${fmt(k.copies)}</div></div>
        <div class="kpi"><div class="l">Ưu đãi đang chạy</div><div class="v">${fmt(k.offers)}</div></div>
      </div>
      <div class="sec-title">Theo vị trí bấm</div>
      <table><thead><tr><th>Vị trí</th><th class="r">Lượt vào có bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th><th class="r">Tỉ trọng lượt bấm</th></tr></thead><tbody>
        ${d.byPosition.map((r) => tr([td(esc(r.position || ''), ''), td(fmt(r.clicked)), td('<b>' + fmt(r.clicks) + '</b>'), td(fmt(r.copies)), td(pct(r.clicks, totalPosClicks) + '%')])).join('') || empty(5)}</tbody></table>
      <div class="sec-title">Theo nút bấm <span class="sub" style="text-transform:none;font-weight:400">mọi nút được bấm trên trang</span></div>
      <div class="scroll-box"><table><thead><tr><th>Nút</th><th>Loại</th><th class="r">Lượt vào có bấm</th><th class="r">Lượt bấm</th></tr></thead><tbody>
        ${(d.byButton || []).map((r) => tr([td(esc(r.label || '—'), 'clip'), td(kindTag(r.kind), ''), td(fmt(r.clicked)), td('<b>' + fmt(r.clicks) + '</b>')])).join('') || empty(4)}</tbody></table></div>
      <div class="sec-title">Theo nguồn</div>
      <table><thead><tr><th>Kênh</th><th>Nguồn</th><th class="r">Lượt vào</th><th class="r">Vào thẳng</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.bySource.map((r) => tr([td(`<span class="tag ${r.channel}">${CH_LABEL[r.channel] || r.channel}</span>`, ''), td(esc(r.source), ''), td('<b>' + fmt(r.visits) + '</b>'), td(fmt(r.entries)), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(7)}</tbody></table>
      <div class="sec-title">Theo quốc gia</div>
      <table><thead><tr><th>Quốc gia</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byCountry.map((r) => tr([td(esc(countryName(r.country)), ''), td('<b>' + fmt(r.visits) + '</b>'), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(5)}</tbody></table>
      <div class="sec-title">Theo chiến dịch và từ khoá <a id="allKw">Xem mọi từ khoá của store này →</a></div>
      <div class="scroll-box"><table><thead><tr><th>Chiến dịch</th><th>Từ khoá</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byKeyword.map((r) => tr([td(esc(r.campaign || '—'), 'sub'), td(esc(r.keyword), ''), td('<b>' + fmt(r.visits) + '</b>'), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(6)}</tbody></table></div>
      <div class="sec-title">Theo ưu đãi</div>
      <table><thead><tr><th>Ưu đãi</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byOffer.map((r) => tr([td(`${esc(r.title || r.okey)} <span class="sub">${esc(OFFER_TYPE[r.type] || r.type || '')}</span>`, ''), td('<b>' + fmt(r.clicks) + '</b>'), td(fmt(r.copies))])).join('') || empty(3)}</tbody></table>
      <div class="sec-title">Theo thiết bị</div>
      <table><thead><tr><th>Thiết bị</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th></tr></thead><tbody>
        ${d.byDevice.map((r) => tr([td(DEV_LABEL[r.device] || esc(r.device), ''), td('<b>' + fmt(r.visits) + '</b>'), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks))])).join('') || empty(4)}</tbody></table>
      <div class="sec-title">Theo ngày</div>
      <table><thead><tr><th>Ngày</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byDay.map((r) => tr([td(fmtDay(r.day), ''), td('<b>' + fmt(r.visits) + '</b>'), td(r.visits ? pct(r.clicked, r.visits) + '%' : '—'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('')}</tbody></table>
    </div>
    <div class="m-foot"><button class="btn" data-close>Đóng</button></div>`;
    $('#dRange').onchange = (e) => { F.range = e.target.value; load(); };
    $('#dCountry').onchange = (e) => { F.country = e.target.value; load(); };
    $$('[data-ch]').forEach((b) => (b.onclick = () => { F.channel = b.dataset.ch; load(); }));
    $('#allKw').onclick = () => {
      setScope(s.domain_id); S.kstore = id; S.kpage = 1; S.range = F.range; S.channel = F.channel; S.country = F.country; save();
      closeModal(); if (curView() === 'keywords') render(); else location.hash = '#/keywords';
    };
  }
  try { await load(); } catch (e) { toast(e.message, 1); closeModal(); }
}

/* ================= Từ khoá ================= */
VIEWS.keywords = async () => {
  const view = $('#view');
  const [fh, d, stores] = await Promise.all([filtersHTML(), api('/keywords?' + qs({ store: S.kstore || '' })), api('/performance?' + qs({ active: 1, per: 500, sort: 'name', dir: 'asc' }))]);
  view.innerHTML = `<div class="page-head"><h1>Từ khoá</h1><span class="sub">${fmtRange(d.from, d.to)}</span></div>${fh}
  <div class="card"><div class="card-head"><select id="kStore" style="max-width:260px"><option value="0">Tất cả cửa hàng</option>${stores.rows.map((s) => `<option value="${s.id}" ${s.id === S.kstore ? 'selected' : ''}>${esc(s.name || s.slug)}${!S.domain ? ' – ' + esc(s.host) : ''}</option>`).join('')}</select>
    <span class="sp"></span><div class="search">${icon('search')}<input type="text" id="kq" placeholder="Tìm từ khoá" value="${esc(S.kq)}"></div>
    ${canEdit() ? '<button class="btn sm" id="kCamp">Tên chiến dịch</button>' : ''}<button class="btn sm" id="kCsv">Xuất CSV</button></div><div class="table-wrap" id="ktbl"></div><div id="kpg"></div></div>`;
  if ($('#kCamp')) $('#kCamp').onclick = () => openCampaigns(() => VIEWS.keywords());
  bindFilters(VIEWS.keywords);
  $('#kStore').onchange = (e) => { S.kstore = +e.target.value; S.kpage = 1; save(); VIEWS.keywords(); };
  const draw = () => {
    let rows = d.rows; const q = S.kq.toLowerCase();
    if (q) rows = rows.filter((r) => (r.keyword + ' ' + r.store_name + ' ' + r.campaign).toLowerCase().includes(q));
    rows = rows.map((r) => ({ ...r, rate: r.visits ? r.clicked / r.visits : 0 }));
    const k = S.ksort, dir = S.kdir === 'asc' ? 1 : -1;
    rows.sort((a, b) => (typeof a[k] === 'string' ? a[k].localeCompare(b[k], 'vi') : a[k] - b[k]) * dir);
    const per = S.per, pages = Math.max(1, Math.ceil(rows.length / per)); if (S.kpage > pages) S.kpage = 1;
    const pageRows = rows.slice((S.kpage - 1) * per, S.kpage * per);
    $('#ktbl').innerHTML = `<table><thead><tr>${sortTh('Từ khoá', 'keyword', k, S.kdir)}${sortTh('Cửa hàng', 'store_name', k, S.kdir)}${sortTh('Chiến dịch', 'campaign', k, S.kdir)}${sortTh('Lượt vào', 'visits', k, S.kdir, 'r')}${sortTh('Tỉ lệ bấm', 'rate', k, S.kdir, 'r')}${sortTh('Lượt bấm', 'clicks', k, S.kdir, 'r')}${sortTh('Copy mã', 'copies', k, S.kdir, 'r')}</tr></thead><tbody>
      ${pageRows.map((r) => `<tr><td>${esc(r.keyword)}</td><td class="store-cell"><b>${esc(r.store_name || r.slug || '(trang khác)')}</b>${!S.domain ? `<span class="sub">${esc(r.host)}</span>` : ''}</td><td class="sub">${esc(r.campaign || '—')}</td><td class="r"><b>${fmt(r.visits)}</b></td><td class="r">${rateBadge(r.rate)}</td><td class="r">${fmt(r.clicks)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có từ khoá. Từ khoá được lấy từ tham số <code>utm_term</code> trên link quảng cáo.</td></tr>'}</tbody></table>`;
    $('#kpg').innerHTML = pagerHTML(rows.length, S.kpage, per, 'từ khoá');
    $$('[data-sort]', view).forEach((th) => (th.onclick = () => { const key = th.dataset.sort; if (S.ksort === key) S.kdir = S.kdir === 'desc' ? 'asc' : 'desc'; else { S.ksort = key; S.kdir = ['keyword', 'store_name', 'campaign'].includes(key) ? 'asc' : 'desc'; } save(); draw(); }));
    bindPager(view, (pg) => { S.kpage = pg; save(); draw(); }, (n) => { S.per = n; S.kpage = 1; save(); draw(); });
    $('#kCsv').onclick = () => downloadCSV(`tu-khoa_${d.from}_${d.to}.csv`, [['Từ khoá', 'Cửa hàng', 'Domain', 'Chiến dịch', 'Lượt vào', 'Tỉ lệ bấm (%)', 'Lượt bấm', 'Copy mã']].concat(rows.map((r) => [r.keyword, r.store_name, r.host, r.campaign, r.visits, Math.round(r.rate * 100), r.clicks, r.copies])));
  };
  $('#kq').oninput = debounce((e) => { S.kq = e.target.value; S.kpage = 1; save(); draw(); }, 200);
  draw();
};

/* ================= Domain ================= */
function snippet(d) { return `<script async src="${location.origin}/s.js" data-site="${d.site_key}"></script>`; }
function healthCells(d) {
  const http = !d.http_checked ? '<span class="status"><span class="dot"></span>Chưa kiểm tra</span>'
    : d.http_status >= 200 && d.http_status < 400 ? `<span class="status"><span class="dot on"></span>Online · ${fmt(d.http_ms)}ms</span>`
      : `<span class="status" title="${esc(d.http_error)}"><span class="dot" style="background:var(--red)"></span>${d.http_status ? 'Lỗi ' + d.http_status : 'Không truy cập được'}</span>`;
  const sslLeft = d.ssl_expires ? daysLeft(d.ssl_expires) : null;
  const ssl = d.ssl_expires ? `<span class="badge-s ${sslLeft < 14 ? 'r' : sslLeft < 30 ? 'o' : 'g'}">${sslLeft < 0 ? 'Đã hết hạn' : 'Còn ' + sslLeft + ' ngày'}</span><div class="sub">${fmtDate(d.ssl_expires)}${d.ssl_issuer ? ' · ' + esc(d.ssl_issuer) : ''}${d.ssl_valid === 0 ? ' · <b style="color:var(--red)">không hợp lệ</b>' : ''}</div>`
    : `<span class="sub">${d.ssl_checked ? 'Không có SSL' : '—'}</span>`;
  const regLeft = d.reg_expires ? daysLeft(d.reg_expires) : null;
  const reg = d.reg_expires ? `<span class="badge-s ${regLeft < 30 ? 'r' : regLeft < 60 ? 'o' : 'g'}">${regLeft < 0 ? 'Đã hết hạn' : 'Còn ' + regLeft + ' ngày'}</span><div class="sub">${fmtDate(d.reg_expires)}${d.registrar ? ' · ' + esc(d.registrar) : ''}</div>`
    : `<span class="sub">${d.reg_checked ? 'Không tra được' : '—'}</span>`;
  const recent = d.last_hit && Date.now() - d.last_hit < 864e5 * 2;
  const track = !d.active ? '<span class="status"><span class="dot"></span>Tạm dừng</span>' : d.last_hit ? `<span class="status"><span class="dot ${recent ? 'on' : 'warn'}"></span>${recent ? 'Đang nhận dữ liệu' : 'Không có dữ liệu mới'}</span><div class="sub">${fmtTime(d.last_hit)}</div>` : '<span class="status"><span class="dot warn"></span>Chờ cài mã</span>';
  return { http, ssl, reg, track };
}
VIEWS.domains = async () => {
  const view = $('#view');
  await loadDomains();
  const R = S.res.domains || (S.res.domains = { q: '', g: '' });
  view.innerHTML = `<div class="page-head"><h1>Domain</h1><span class="sub">${fmt(DOMAINS.length)} domain</span><span class="sp"></span>
    ${isAdmin() ? `<button class="btn" id="bulkDom">${icon('upload')} Nhập nhiều domain</button>` : ''}</div>
  ${isAdmin() ? `<div class="card"><div class="card-head"><h3>Thêm domain mới</h3></div>
    <form id="addDom" class="m-body form"><div class="row">
      <label>Domain<input name="host" placeholder="vd: example.com" required></label>
      <label>Tên hiển thị<input name="name" placeholder="vd: Site UK"></label>
      <label>Nhóm<input name="category" list="grpList" placeholder="vd: UK, US..."></label>
      <label>Đường dẫn trang cửa hàng<input name="store_path" placeholder="/store/{slug}"></label>
      <button class="btn primary">+ Thêm domain</button></div></form>
    <datalist id="grpList">${GROUPS.map((g) => `<option value="${esc(g.category)}">`).join('')}</datalist></div>` : ''}
  <div class="card"><div class="card-head"><select id="dGrp" style="max-width:200px"><option value="">Tất cả nhóm</option>${GROUPS.map((g) => `<option value="${esc(g.category)}" ${R.g === g.category ? 'selected' : ''}>${esc(g.category)} (${g.n})</option>`).join('')}</select>
    <span class="sp"></span><div class="search">${icon('search')}<input type="text" id="dq" placeholder="Tìm domain" value="${esc(R.q)}"></div>
    <button class="btn sm" id="dCsv">Xuất CSV</button></div>
  <div class="table-wrap"><table><thead><tr><th>Domain</th><th>Nhóm</th><th>Online</th><th>SSL</th><th>Hết hạn domain</th><th>Theo dõi</th><th class="r">Cửa hàng</th><th class="r">Lượt vào 7 ngày</th><th></th></tr></thead><tbody id="dbody"></tbody></table></div></div>`;
  const list = () => DOMAINS.filter((d) => (!R.g || d.category === R.g) && (!R.q || (d.name + ' ' + d.host + ' ' + d.note).toLowerCase().includes(R.q.toLowerCase())));
  const draw = () => {
    $('#dbody').innerHTML = list().map((d) => {
      const h = healthCells(d);
      return `<tr><td class="store-cell"><b>${esc(d.name)}</b><a class="sub" href="https://${esc(d.host)}" target="_blank" rel="noopener">${esc(d.host)}</a></td>
      <td>${d.category ? `<span class="badge-s b">${esc(d.category)}</span>` : '<span class="sub">—</span>'}</td>
      <td>${h.http}</td><td>${h.ssl}</td><td>${h.reg}</td><td>${h.track}</td><td class="r">${fmt(d.stores)}</td><td class="r">${fmt(d.visits7)}</td>
      <td class="acts wrap"><button class="act pri" data-snip="${d.id}">${icon('code')} Mã nhúng</button><button class="act" data-check="${d.id}">${icon('refresh')} Kiểm tra</button>${isAdmin() ? `<button class="act pri" data-edit="${d.id}">${icon('edit')} Sửa</button><button class="act danger" data-del="${d.id}">${icon('trash')} Xoá</button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="9" class="empty">${DOMAINS.length ? 'Không có domain phù hợp' : 'Chưa có domain nào'}</td></tr>`;
    $$('[data-snip]', view).forEach((b) => (b.onclick = () => showSnippet(DOMAINS.find((x) => x.id === +b.dataset.snip))));
    $$('[data-check]', view).forEach((b) => (b.onclick = async () => {
      b.disabled = true; b.innerHTML = icon('refresh') + ' Đang kiểm tra...';
      try { await api(`/domains/${b.dataset.check}/check`, { method: 'POST' }); toast('Đã kiểm tra xong'); await VIEWS.domains(); } catch (er) { toast(er.message, 1); b.disabled = false; }
    }));
    $$('[data-edit]', view).forEach((b) => (b.onclick = () => editDomain(DOMAINS.find((x) => x.id === +b.dataset.edit))));
    $$('[data-del]', view).forEach((b) => (b.onclick = () => deleteDomain(DOMAINS.find((x) => x.id === +b.dataset.del))));
  };
  $('#dq').oninput = debounce((e) => { R.q = e.target.value; save(); draw(); }, 150);
  $('#dGrp').onchange = (e) => { R.g = e.target.value; save(); draw(); };
  $('#dCsv').onclick = () => downloadCSV('domain.csv', [['Tên', 'Domain', 'Nhóm', 'HTTP', 'SSL hết hạn', 'Domain hết hạn', 'Nhà đăng ký', 'Cửa hàng', 'Lượt vào 7 ngày', 'Ghi chú']]
    .concat(list().map((d) => [d.name, d.host, d.category, d.http_status || '', d.ssl_expires ? fmtDate(d.ssl_expires) : '', d.reg_expires ? fmtDate(d.reg_expires) : '', d.registrar, d.stores, d.visits7, d.note])));
  const f = $('#addDom');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try { const d = await api('/domains', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Đã thêm domain'); await VIEWS.domains(); showSnippet(d); }
    catch (er) { toast(er.message, 1); }
  };
  if ($('#bulkDom')) $('#bulkDom').onclick = () => openImport('domains');
  draw();
};
async function deleteDomain(d) {
  openModal(`<div class="m-head"><h2>Xoá domain</h2><button class="m-close" data-close>×</button></div>
    <div class="m-body">Xoá <b>${esc(d.host)}</b> sẽ xoá <b>toàn bộ</b> cửa hàng, ưu đãi, nội dung và dữ liệu thống kê của domain này. Không thể hoàn tác.<br><br>Gõ <code>${esc(d.host)}</code> để xác nhận:<br><input id="delConfirm" style="width:100%;margin-top:8px"></div>
    <div class="m-foot"><button class="btn" data-close>Huỷ</button><span style="flex:1"></span><button class="btn danger" id="delGo">Xoá vĩnh viễn</button></div>`, 'sm');
  $('#delGo').onclick = async () => {
    if ($('#delConfirm').value.trim() !== d.host) return toast('Tên domain không khớp', 1);
    try { await api('/domains/' + d.id, { method: 'DELETE' }); closeModal(); toast('Đã xoá'); VIEWS.domains(); } catch (er) { toast(er.message, 1); }
  };
}
function showSnippet(d) {
  const code = snippet(d);
  const base = `${location.origin}/api/public/${d.site_key}`;
  openModal(`<div class="m-head"><h2>Mã nhúng · ${esc(d.host)}</h2><button class="m-close" data-close>×</button></div>
  <div class="m-body guide">
    <p><b>Bước 1.</b> Dán đoạn mã sau vào trước thẻ <code>&lt;/head&gt;</code> trên <b>mọi trang</b> của ${esc(d.host)} (hoặc trong theme/header chung):</p>
    <pre class="code">${esc(code)}</pre><button class="btn sm" id="cpSnip">${icon('copy')} Sao chép mã</button>
    <p style="margin-top:16px"><b>Bước 2.</b> Gắn thuộc tính để hệ thống nhận diện cửa hàng và ưu đãi (khuyến nghị):</p>
    <pre class="code">${esc(`<!-- Trang cửa hàng: đặt ở thẻ bao ngoài (body/main) -->
<main data-cp-store="insta360" data-cp-store-name="Insta360" data-cp-store-url="https://insta360.com">

  <!-- Mỗi ưu đãi / mã giảm giá (id trùng "Mã theo dõi" trong mục Mã & ưu đãi) -->
  <div data-cp-offer="insta360-5off" data-cp-type="code" data-cp-title="Insta360 Coupon: 5% OFF with Code">
    <button>Lấy mã</button>   <!-- click tự được ghi nhận -->
  </div>

  <!-- Nút khác cần đếm lượt bấm (tuỳ chọn vị trí) -->
  <a href="..." data-cp-click data-cp-pos="Nút trên trang">Đến cửa hàng</a>
</main>`)}</pre>
    <p>Nếu không gắn <code>data-cp-store</code>, hệ thống tự lấy cửa hàng từ URL theo mẫu <code>${esc(d.store_path || '/store/{slug}')}</code> (đổi trong mục <b>Sửa</b>).</p>
    <p><b>Copy mã</b> được ghi nhận tự động khi trang dùng <code>navigator.clipboard</code>, <code>execCommand('copy')</code> hoặc người dùng tự bôi đen + Ctrl+C. Gọi thủ công: <code>CPTrack.copy('offer-id')</code>.</p>
    <p><b>Từ khoá & kênh Ads:</b> thêm vào Google Ads → Hậu tố URL cuối cùng: <code>utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={campaignid}&amp;utm_term={keyword}</code>. Link có <code>gad_source</code>/<code>gclid</code> tự được tính là Quảng cáo.</p>
    <p style="margin-top:16px"><b>API nội dung công khai</b> (website đọc dữ liệu đã xuất bản, dạng JSON):</p>
    <pre class="code">${esc([`${base}/stores`, `${base}/stores/{slug}`, `${base}/offers?store={slug}`, `${base}/categories`, `${base}/events`, `${base}/events/{slug}`, `${base}/pages/{slug}`, `${base}/posts`, `${base}/posts/{slug}`, `${base}/faqs?store={slug}`].join('\n'))}</pre>
  </div><div class="m-foot"><button class="btn" data-close>Đóng</button></div>`);
  $('#cpSnip').onclick = () => copyText(code);
}
function editDomain(d) {
  openModal(`<div class="m-head"><h2>Sửa domain</h2><button class="m-close" data-close>×</button></div>
  <form class="m-body form" id="edDom"><div class="fgrid">
    <label>Tên hiển thị<input name="name" value="${esc(d.name)}"></label>
    <label>Domain<input name="host" value="${esc(d.host)}"></label>
    <label>Nhóm<input name="category" list="grpList2" value="${esc(d.category)}"><datalist id="grpList2">${GROUPS.map((g) => `<option value="${esc(g.category)}">`).join('')}</datalist></label>
    <label>Đường dẫn trang cửa hàng <span class="hint">Phải chứa <code>{slug}</code>, vd <code>/coupons/{slug}</code></span><input name="store_path" value="${esc(d.store_path)}" placeholder="/store/{slug}"></label>
    <label class="full">Ghi chú<textarea name="note" rows="3">${esc(d.note)}</textarea></label>
    <label class="chk full"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}> Đang hoạt động (nhận dữ liệu, theo dõi uptime)</label>
    <label class="full">Site key <span class="hint">Dùng trong mã nhúng và API công khai</span><div class="row"><input value="${esc(d.site_key)}" readonly><button type="button" class="btn" id="rotKey">Đổi key</button></div></label>
  </div><button class="btn primary">Lưu</button></form>`, 'sm');
  $('#edDom').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await api('/domains/' + d.id, { method: 'PUT', body: { name: f.get('name'), host: f.get('host'), category: f.get('category'), store_path: f.get('store_path'), note: f.get('note'), active: f.get('active') === 'on' } }); closeModal(); toast('Đã lưu'); VIEWS.domains(); }
    catch (er) { toast(er.message, 1); }
  };
  $('#rotKey').onclick = async () => {
    if (!(await confirmBox('Đổi site key', `Sau khi đổi, mã nhúng và API cũ của <b>${esc(d.host)}</b> sẽ ngừng hoạt động. Bạn phải dán lại mã nhúng mới.`, 'Đổi key'))) return;
    try { await api(`/domains/${d.id}/rotate-key`, { method: 'POST' }); toast('Đã đổi site key'); await VIEWS.domains(); showSnippet(DOMAINS.find((x) => x.id === d.id)); } catch (er) { toast(er.message, 1); }
  };
}

/* ================= Import ================= */
const IMPORT_HELP = {
  stores: { cols: 'name, slug, url, category, logo, description, status', sample: [['name', 'slug', 'url', 'category', 'logo', 'description', 'status'], ['Insta360', 'insta360', 'https://insta360.com', 'Điện tử', '', 'Camera 360 độ', 'active']] },
  offers: { cols: 'store, title, type, code, discount, url, starts, expires, event, description, okey', sample: [['store', 'title', 'type', 'code', 'discount', 'url', 'starts', 'expires', 'event', 'description', 'okey'], ['Insta360', 'Insta360 Coupon: 5% OFF with Code', 'code', 'SAVE5', '5%', 'https://insta360.com', '2026-11-01', '2026-12-31', 'Black Friday', '', 'insta360-5off']] },
};
function openImport(kind, after) {
  const isDom = kind === 'domains';
  const dom = curDomain();
  if (!isDom && !dom) return toast('Hãy chọn một domain trước khi import', 1);
  const h = IMPORT_HELP[kind];
  openModal(`<div class="m-head"><h2>Import ${IMPORT_KIND[kind]}${dom && !isDom ? ' · ' + esc(dom.host) : ''}</h2><button class="m-close" data-close>×</button></div>
  <div class="m-body form">
    ${isDom ? `<p class="sub" style="margin:0">Mỗi dòng một domain (hoặc cách nhau bởi dấu phẩy / khoảng trắng). Domain đã tồn tại sẽ được bỏ qua.</p>
      <label>Nhóm cho các domain mới (tuỳ chọn)<input id="impGroup" list="grpList3"><datalist id="grpList3">${GROUPS.map((g) => `<option value="${esc(g.category)}">`).join('')}</datalist></label>`
      : `<p class="sub" style="margin:0">File CSV (UTF-8, phân cách bằng dấu phẩy, chấm phẩy hoặc tab) có dòng tiêu đề. Các cột hỗ trợ: <code>${h.cols}</code>. Tên cột tiếng Việt (Tên, Cửa hàng, Mã, Hết hạn...) cũng được. Dòng trùng sẽ được cập nhật. Ngày dạng <code>YYYY-MM-DD</code> hoặc <code>DD/MM/YYYY</code>.</p>
      <div><button type="button" class="btn sm" id="impSample">Tải file mẫu</button></div>`}
    <div class="drop" id="impDrop">Kéo thả file vào đây hoặc <label class="link" style="display:inline;font-weight:500">chọn file<input type="file" id="impFile" accept=".csv,.txt,text/csv,text/plain" hidden></label><div id="impName" class="sub"></div></div>
    <label>Hoặc dán nội dung<textarea id="impText" rows="8" placeholder="${isDom ? 'example.com\nexample.co.uk' : h.cols}"></textarea></label>
    <div id="impResult"></div>
  </div>
  <div class="m-foot"><button class="btn" data-close>Đóng</button><span style="flex:1"></span><button class="btn primary" id="impGo">Bắt đầu import</button></div>`);
  let filename = '';
  const readFile = (file) => { if (!file) return; filename = file.name; $('#impName').textContent = file.name; const r = new FileReader(); r.onload = () => ($('#impText').value = r.result); r.readAsText(file, 'utf-8'); };
  $('#impFile').onchange = (e) => readFile(e.target.files[0]);
  const drop = $('#impDrop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('on'); };
  drop.ondragleave = () => drop.classList.remove('on');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('on'); readFile(e.dataTransfer.files[0]); };
  if ($('#impSample')) $('#impSample').onclick = () => downloadCSV(`mau-import-${kind}.csv`, h.sample);
  $('#impGo').onclick = async () => {
    const text = $('#impText').value; if (!text.trim()) return toast('Chưa có dữ liệu để import', 1);
    const b = $('#impGo'); b.disabled = true; b.textContent = 'Đang import...';
    try {
      const r = await api('/import/' + kind, { method: 'POST', body: { text, filename, domain_id: dom ? dom.id : undefined, category: isDom ? $('#impGroup').value : undefined } });
      $('#impResult').innerHTML = importResultHTML(r);
      toast(`Đã import: thêm ${r.added}, cập nhật ${r.updated || 0}`);
      if (isDom) await loadDomains();
      if (after) after(); else if (isDom) VIEWS.domains();
    } catch (er) { toast(er.message, 1); }
    b.disabled = false; b.textContent = 'Bắt đầu import';
  };
}
const IMP_STATUS = { added: ['g', 'Đã thêm'], updated: ['b', 'Cập nhật'], exists: ['', 'Đã tồn tại'], invalid: ['r', 'Lỗi'] };
function importResultHTML(r) {
  const skipped = r.skipped ?? (r.total - r.added - (r.updated || 0));
  return `<div class="result-sum"><span class="badge-s">Tổng ${fmt(r.total)} dòng</span><span class="badge-s g">Thêm ${fmt(r.added)}</span><span class="badge-s b">Cập nhật ${fmt(r.updated || 0)}</span><span class="badge-s ${skipped ? 'r' : ''}">Bỏ qua ${fmt(skipped)}</span></div>
  <div class="table-wrap" style="max-height:320px;overflow:auto"><table class="mini-table"><thead><tr><th>Mục</th><th>Kết quả</th><th>Ghi chú</th></tr></thead><tbody>
  ${(r.detail || []).map((x) => { const s = IMP_STATUS[x.status] || ['', x.status]; return `<tr><td class="clip">${esc(x.item)}</td><td><span class="badge-s ${s[0]}">${s[1]}</span></td><td class="sub">${esc(x.note || '')}</td></tr>`; }).join('') || '<tr><td colspan="3" class="empty">Không có chi tiết</td></tr>'}
  </tbody></table></div>`;
}
VIEWS.imports = async () => {
  const rows = await api('/imports');
  $('#view').innerHTML = `<div class="page-head"><h1>Lịch sử import</h1><span class="sub">200 lần gần nhất</span></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Loại</th><th>Domain</th><th>File</th><th class="r">Tổng</th><th class="r">Thêm</th><th class="r">Cập nhật</th><th class="r">Bỏ qua</th><th></th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td class="sub">${fmtTime(r.ts)}</td><td>${esc(r.username)}</td><td>${IMPORT_KIND[r.kind] || esc(r.kind)}</td><td class="sub">${esc(r.host || (r.kind === 'domains' ? '—' : '(đã xoá)'))}</td><td class="sub clip">${esc(r.filename || '(dán trực tiếp)')}</td>
    <td class="r">${fmt(r.total)}</td><td class="r">${fmt(r.added)}</td><td class="r">${fmt(r.updated)}</td><td class="r">${r.skipped ? `<b style="color:var(--red)">${fmt(r.skipped)}</b>` : 0}</td>
    <td class="acts"><button class="act pri" data-imp="${r.id}">${icon('search')} Chi tiết</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">Chưa có lần import nào</td></tr>'}
  </tbody></table></div></div>`;
  $$('[data-imp]').forEach((b) => (b.onclick = () => {
    const r = rows.find((x) => x.id === +b.dataset.imp);
    openModal(`<div class="m-head"><h2>Import ${IMPORT_KIND[r.kind] || r.kind} · ${fmtTime(r.ts)}</h2><button class="m-close" data-close>×</button></div><div class="m-body">${importResultHTML(r)}</div><div class="m-foot"><button class="btn" data-close>Đóng</button></div>`);
  }));
};

/* ================= Dữ liệu chính & Nội dung (CRUD chung) ================= */
const opt = (rows, empty) => [['', empty], ...rows.map((r) => [r.id, r.name])];
const offerState = (o) => {
  const t = today();
  if (o.status !== 'active') return '<span class="badge-s">Ẩn</span>';
  if (o.expires && o.expires < t) return '<span class="badge-s r">Hết hạn</span>';
  if (o.starts && o.starts > t) return '<span class="badge-s o">Chưa bắt đầu</span>';
  if (o.source === 'tracker' && (!o.last_seen || Date.now() - o.last_seen > 7 * 864e5)) return '<span class="badge-s o">Không còn trên trang</span>';
  return '<span class="badge-s g">Đang chạy</span>';
};
const range2 = (a, b) => (a || b ? `${a ? fmtDay(a) : '…'} – ${b ? fmtDay(b) : '…'}` : '<span class="sub">Không giới hạn</span>');
const nameSlug = (name, slug) => `<td class="store-cell"><b>${esc(name)}</b><span class="sub">/${esc(slug)}</span></td>`;
const snip = (s, n = 90) => { s = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return esc(s.length > n ? s.slice(0, n) + '…' : s); };

const RV = {
  categories: {
    title: 'Danh mục', tpl: 'category',
    cols: [['Danh mục', (r) => nameSlug(r.name, r.slug)], ['Danh mục cha', (r) => `<td>${esc(r.parent_name || '—')}</td>`], ['Cửa hàng', (r) => `<td class="r">${fmt(r.stores)}</td>`, 'r'], ['Thứ tự', (r) => `<td class="r">${r.sort}</td>`, 'r']],
    form: (o, row) => [{ k: 'name', l: 'Tên danh mục', req: 1 }, { k: 'slug', l: 'Slug', hint: 'Để trống = tự tạo từ tên' },
      { k: 'parent_id', l: 'Danh mục cha', t: 'select', opts: opt(o.categories.filter((c) => !row || c.id !== row.id), '— Không —') }, { k: 'sort', l: 'Thứ tự', t: 'number' },
      { k: 'description', l: 'Mô tả', t: 'content' }],
  },
  stores: {
    title: 'Cửa hàng', tpl: 'store', importKind: 'stores',
    filters: (o) => [{ k: 'category_id', opts: opt(o.categories, 'Tất cả danh mục') }, { k: 'status', opts: [['', 'Mọi trạng thái'], ['active', 'Hiển thị'], ['hidden', 'Ẩn']] }],
    cols: [
      ['Cửa hàng', (r) => `<td><div class="flex">${r.logo ? `<img class="thumb" src="${esc(r.logo)}" alt="" loading="lazy">` : ''}<div class="store-cell"><b>${esc(r.name || r.slug)}</b><span class="sub">${esc(r.url ? hostOfUrl(r.url) : '/' + r.slug)}</span></div></div></td>`],
      ['Danh mục', (r) => `<td>${esc(r.category_name || '—')}</td>`],
      ['Ưu đãi đang chạy', (r) => `<td class="r"><span class="pill-n">${r.offers_active}</span> <span class="sub">/ ${r.offers_total}</span></td>`, 'r'],
      ['Trạng thái', (r) => `<td>${statusBadge(r.status)}</td>`], ['Nguồn', (r) => `<td class="sub">${SOURCE_LABEL[r.source] || esc(r.source)}</td>`],
    ],
    actions: (r) => `<button class="act pri" data-perf="${r.id}">${icon('chart')} Hiệu quả</button><a class="act" href="${esc(r.open_url)}" target="_blank" rel="noopener">${icon('open')} Mở trang</a>`,
    form: (o) => [{ k: 'name', l: 'Tên cửa hàng', req: 1 }, { k: 'slug', l: 'Slug', hint: 'Phần {slug} trên URL trang cửa hàng' }, { k: 'url', l: 'Website cửa hàng', ph: 'https://insta360.com' },
      { k: 'category_id', l: 'Danh mục', t: 'select', opts: opt(o.categories, '— Không —') }, { k: 'logo', l: 'Logo (URL ảnh)' }, { k: 'status', l: 'Trạng thái', t: 'select', opts: [['active', 'Hiển thị'], ['hidden', 'Ẩn']] },
      { k: 'description', l: 'Mô tả', t: 'content' }],
    csv: [['name', 'Tên'], ['slug', 'Slug'], ['url', 'Website'], ['category_name', 'Danh mục'], ['status', 'Trạng thái'], ['offers_active', 'Ưu đãi đang chạy'], ['open_url', 'Trang']],
  },
  offers: {
    title: 'Mã & ưu đãi', tpl: 'offer', importKind: 'offers',
    filters: (o) => [{ k: 'store_id', opts: opt(o.stores, 'Tất cả cửa hàng') }, { k: 'type', opts: [['', 'Mọi loại'], ['code', 'Mã giảm giá'], ['deal', 'Ưu đãi']] },
      { k: 'event_id', opts: opt(o.promo_events, 'Mọi sự kiện') }, { k: 'status', opts: [['', 'Mọi trạng thái'], ['active', 'Hiển thị'], ['hidden', 'Ẩn']] }],
    cols: [
      ['Ưu đãi', (r) => `<td class="store-cell" style="min-width:220px" title="Mã theo dõi: ${esc(r.okey)}"><b>${esc(r.title || r.okey)}</b><span class="sub">${OFFER_TYPE[r.type] || ''}${r.verified ? ' · ✓ Đã xác minh' : ''}</span></td>`],
      ['Mã', (r) => `<td>${r.code ? `<span class="code-pill" data-copy="${esc(r.code)}" title="Copy mã">${esc(r.code)} ${icon('copy')}</span>` : '<span class="sub">—</span>'}</td>`],
      ['Cửa hàng', (r) => `<td>${esc(r.store_name || '—')}</td>`], ['Giảm', (r) => `<td>${esc(r.discount || '—')}</td>`],
      ['Thời hạn', (r) => `<td class="sub">${range2(r.starts, r.expires)}</td>`], ['Sự kiện', (r) => `<td class="sub">${esc(r.event_name || '—')}</td>`],
      ['Tình trạng', (r) => `<td>${offerState(r)}</td>`], ['Nguồn', (r) => `<td class="sub">${SOURCE_LABEL[r.source] || esc(r.source)}</td>`],
    ],
    form: (o) => [{ k: 'store_id', l: 'Cửa hàng', t: 'select', req: 1, opts: opt(o.stores, '— Chọn cửa hàng —') }, { k: 'title', l: 'Tiêu đề', req: 1, full: 1 },
      { k: 'type', l: 'Loại', t: 'select', opts: [['code', 'Mã giảm giá'], ['deal', 'Ưu đãi']] }, { k: 'code', l: 'Mã giảm giá', ph: 'SAVE10' },
      { k: 'discount', l: 'Mức giảm', ph: '10%, $20...' }, { k: 'url', l: 'Link ưu đãi (affiliate)' }, { k: 'starts', l: 'Bắt đầu', t: 'date' }, { k: 'expires', l: 'Hết hạn', t: 'date' },
      { k: 'event_id', l: 'Sự kiện khuyến mãi', t: 'select', opts: opt(o.promo_events, '— Không —') }, { k: 'status', l: 'Trạng thái', t: 'select', opts: [['active', 'Hiển thị'], ['hidden', 'Ẩn']] },
      { k: 'sort', l: 'Độ ưu tiên', t: 'number', hint: 'Số lớn hiện trước' }, { k: 'okey', l: 'Mã theo dõi', hint: 'Trùng với data-cp-offer trên website. Để trống = tự tạo' },
      { k: 'verified', l: 'Đã xác minh', t: 'bool' }, { k: 'description', l: 'Mô tả', t: 'content' }],
    csv: [['store_name', 'store'], ['title', 'title'], ['type', 'type'], ['code', 'code'], ['discount', 'discount'], ['url', 'url'], ['starts', 'starts'], ['expires', 'expires'], ['event_name', 'event'], ['description', 'description'], ['okey', 'okey']],
  },
  promo_events: {
    title: 'Sự kiện khuyến mãi', tpl: 'event',
    filters: () => [{ k: 'status', opts: [['', 'Mọi trạng thái'], ['active', 'Hiển thị'], ['hidden', 'Ẩn']] }],
    cols: [['Sự kiện', (r) => nameSlug(r.name, r.slug)], ['Thời gian', (r) => `<td>${range2(r.starts, r.ends)}</td>`],
      ['Tình trạng', (r) => { const t = today(); return `<td>${r.status !== 'active' ? '<span class="badge-s">Ẩn</span>' : r.ends && r.ends < t ? '<span class="badge-s r">Đã kết thúc</span>' : r.starts && r.starts > t ? '<span class="badge-s o">Sắp diễn ra</span>' : '<span class="badge-s g">Đang diễn ra</span>'}</td>`; }],
      ['Ưu đãi', (r) => `<td class="r">${fmt(r.offers)}</td>`, 'r']],
    form: () => [{ k: 'name', l: 'Tên sự kiện', req: 1, ph: 'Black Friday 2026' }, { k: 'slug', l: 'Slug' }, { k: 'starts', l: 'Bắt đầu', t: 'date' }, { k: 'ends', l: 'Kết thúc', t: 'date' },
      { k: 'banner', l: 'Banner (URL ảnh)' }, { k: 'status', l: 'Trạng thái', t: 'select', opts: [['active', 'Hiển thị'], ['hidden', 'Ẩn']] }, { k: 'description', l: 'Mô tả', t: 'content' }],
  },
  pages: {
    title: 'Trang tĩnh', tpl: 'page',
    filters: () => [{ k: 'status', opts: [['', 'Mọi trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Bản nháp']] }],
    cols: [['Tiêu đề', (r) => nameSlug(r.title, r.slug)], ['Trạng thái', (r) => `<td>${statusBadge(r.status)}</td>`], ['Cập nhật', (r) => `<td class="sub">${fmtTime(r.updated_at)}</td>`]],
    form: () => [{ k: 'title', l: 'Tiêu đề', req: 1 }, { k: 'slug', l: 'Slug', ph: 'about-us' }, { k: 'meta_title', l: 'Meta title (SEO)' },
      { k: 'status', l: 'Trạng thái', t: 'select', opts: [['published', 'Đã xuất bản'], ['draft', 'Bản nháp']] }, { k: 'meta_description', l: 'Meta description (SEO)', t: 'textarea', full: 1 },
      { k: 'content', l: 'Nội dung (HTML)', t: 'content' }],
  },
  posts: {
    title: 'Bài viết', tpl: 'post',
    filters: (o) => [{ k: 'category_id', opts: opt(o.categories, 'Tất cả danh mục') }, { k: 'store_id', opts: opt(o.stores, 'Tất cả cửa hàng') }, { k: 'status', opts: [['', 'Mọi trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Bản nháp']] }],
    cols: [['Bài viết', (r) => `<td><div class="flex">${r.thumbnail ? `<img class="thumb" src="${esc(r.thumbnail)}" alt="" loading="lazy">` : ''}<div class="store-cell"><b>${esc(r.title)}</b><span class="sub">/${esc(r.slug)}</span></div></div></td>`],
      ['Danh mục', (r) => `<td>${esc(r.category_name || '—')}</td>`], ['Cửa hàng', (r) => `<td>${esc(r.store_name || '—')}</td>`],
      ['Ngày đăng', (r) => `<td class="sub">${r.published_at ? fmtDay(r.published_at) : '—'}</td>`], ['Trạng thái', (r) => `<td>${statusBadge(r.status)}</td>`]],
    form: (o) => [{ k: 'title', l: 'Tiêu đề', req: 1, full: 1 }, { k: 'slug', l: 'Slug' }, { k: 'thumbnail', l: 'Ảnh đại diện (URL)' },
      { k: 'category_id', l: 'Danh mục', t: 'select', opts: opt(o.categories, '— Không —') }, { k: 'store_id', l: 'Cửa hàng liên quan', t: 'select', opts: opt(o.stores, '— Không —') },
      { k: 'published_at', l: 'Ngày đăng', t: 'date', hint: 'Bài hẹn giờ: chỉ hiện từ ngày này' }, { k: 'status', l: 'Trạng thái', t: 'select', opts: [['published', 'Đã xuất bản'], ['draft', 'Bản nháp']] },
      { k: 'excerpt', l: 'Tóm tắt', t: 'textarea', full: 1 }, { k: 'content', l: 'Nội dung (HTML)', t: 'content' }],
  },
  faqs: {
    title: 'Câu hỏi thường gặp', tpl: 'faq',
    filters: (o) => [{ k: 'store_id', opts: opt(o.stores, 'Tất cả cửa hàng') }, { k: 'status', opts: [['', 'Mọi trạng thái'], ['published', 'Đã xuất bản'], ['draft', 'Bản nháp']] }],
    cols: [['Câu hỏi', (r) => `<td class="store-cell"><b>${esc(r.question)}</b><span class="sub">${snip(r.answer)}</span></td>`], ['Cửa hàng', (r) => `<td>${r.store_name ? esc(r.store_name) : '<span class="sub">Câu hỏi chung</span>'}</td>`],
      ['Thứ tự', (r) => `<td class="r">${r.sort}</td>`, 'r'], ['Trạng thái', (r) => `<td>${statusBadge(r.status)}</td>`]],
    form: (o) => [{ k: 'question', l: 'Câu hỏi', req: 1, full: 1 }, { k: 'store_id', l: 'Cửa hàng', t: 'select', opts: opt(o.stores, '— Câu hỏi chung của website —') },
      { k: 'sort', l: 'Thứ tự', t: 'number' }, { k: 'status', l: 'Trạng thái', t: 'select', opts: [['published', 'Đã xuất bản'], ['draft', 'Bản nháp']] }, { k: 'answer', l: 'Trả lời', t: 'content' }],
  },
  templates: {
    title: 'Mẫu nội dung',
    filters: () => [{ k: 'type', opts: [['', 'Mọi loại'], ...TPL_TYPES] }],
    cols: [['Tên mẫu', (r) => `<td><b>${esc(r.name)}</b></td>`], ['Dùng cho', (r) => `<td><span class="badge-s b">${(TPL_TYPES.find((t) => t[0] === r.type) || [, r.type])[1]}</span></td>`], ['Xem trước', (r) => `<td class="sub">${snip(r.content, 120)}</td>`]],
    form: () => [{ k: 'name', l: 'Tên mẫu', req: 1 }, { k: 'type', l: 'Dùng cho', t: 'select', opts: TPL_TYPES },
      { k: 'content', l: 'Nội dung mẫu', t: 'textarea', rows: 12, full: 1, hint: 'Biến thay thế khi chèn: {store} tên cửa hàng, {title} tiêu đề, {code} mã, {discount} mức giảm, {domain} domain, {site} tên website, {year} năm, {month} tháng' }],
  },
};

function fillTpl(content, form) {
  const g = (k) => { const el = form.elements[k]; if (!el) return ''; return el.tagName === 'SELECT' ? (el.value ? el.options[el.selectedIndex].text : '') : el.value; };
  const d = curDomain() || {}, now = new Date();
  const vars = { store: g('store_id') || g('name'), title: g('title') || g('name') || g('question'), code: g('code'), discount: g('discount'), domain: d.host || '', site: d.name || '', year: now.getFullYear(), month: now.getMonth() + 1 };
  return content.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
function fieldHTML(f, row, templates) {
  const v = row ? row[f.k] : undefined;
  const val = v == null ? '' : v;
  const lab = `${esc(f.l)}${f.req ? ' *' : ''}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}`;
  const full = f.full || f.t === 'content' ? 'full' : '';
  if (f.t === 'bool') return `<label class="chk ${full}"><input type="checkbox" name="${f.k}" ${val ? 'checked' : ''}> ${esc(f.l)}</label>`;
  if (f.t === 'select') {
    const cur = val === '' && !row ? f.opts[0][0] : val;
    return `<label class="${full}">${lab}<select name="${f.k}" ${f.req ? 'required' : ''}>${f.opts.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  }
  if (f.t === 'textarea' || f.t === 'content') {
    const tpls = f.t === 'content' ? templates : [];
    return `<label class="${full}"><span class="flex" style="justify-content:space-between">${lab}${tpls.length ? `<span class="tpl-row">Chèn từ mẫu <select data-tpl="${f.k}"><option value="">— chọn —</option>${tpls.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></span>` : ''}</span>
      <textarea name="${f.k}" rows="${f.rows || (f.t === 'content' ? 10 : 3)}">${esc(val)}</textarea></label>`;
  }
  const type = f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : 'text';
  return `<label class="${full}">${lab}<input type="${type}" name="${f.k}" value="${esc(val)}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.req ? 'required' : ''}></label>`;
}
function openForm(name, row, o, done) {
  const def = RV[name], fields = def.form(o, row);
  const templates = def.tpl ? o.templates.filter((t) => t.type === def.tpl) : [];
  openModal(`<div class="m-head"><h2>${row ? 'Sửa' : 'Thêm'} ${esc(def.title.toLowerCase())}</h2><button class="m-close" data-close>×</button></div>
    <form class="m-body form" id="rForm"><div class="fgrid">${fields.map((f) => fieldHTML(f, row, templates)).join('')}</div></form>
    <div class="m-foot"><button class="btn" data-close>Huỷ</button><span style="flex:1"></span><button class="btn primary" id="rSave">${row ? 'Lưu thay đổi' : 'Thêm mới'}</button></div>`);
  const form = $('#rForm');
  $$('[data-tpl]', form).forEach((s) => (s.onchange = () => {
    const t = templates.find((x) => x.id === +s.value); if (!t) return;
    const ta = form.elements[s.dataset.tpl]; const text = fillTpl(t.content, form);
    ta.value = ta.value.trim() ? ta.value + '\n\n' + text : text; s.value = '';
  }));
  const submit = async () => {
    if (!form.reportValidity()) return;
    const body = {};
    for (const f of fields) { const el = form.elements[f.k]; body[f.k] = f.t === 'bool' ? el.checked : el.value; }
    if (!row) body.domain_id = S.domain;
    try {
      await api(`/r/${name}${row ? '/' + row.id : ''}`, { method: row ? 'PUT' : 'POST', body });
      closeModal(); toast(row ? 'Đã lưu' : 'Đã thêm'); done();
    } catch (er) { toast(er.message, 1); }
  };
  $('#rSave').onclick = submit;
  form.onsubmit = (e) => { e.preventDefault(); submit(); };
}
function resourceView(name) {
  return async () => {
    const def = RV[name], view = $('#view');
    if (!S.domain) { view.innerHTML = needDomainHTML(def.title); bindNeedDomain(); return; }
    const R = S.res[name] || (S.res[name] = {}); R.f = R.f || {}; R.page = R.page || 1; R.per = R.per || 20; R.q = R.q || '';
    const o = await api('/options?domain=' + S.domain);
    const filters = def.filters ? def.filters(o) : [];
    const dom = curDomain();
    view.innerHTML = `<div class="page-head"><h1>${esc(def.title)}</h1><span class="sub">${esc(dom.name)} · ${esc(dom.host)}</span><span class="sp"></span>
      <div class="toolbar">${def.csv ? '<button class="btn" id="rCsv">Xuất CSV</button>' : ''}${def.importKind && canEdit() ? `<button class="btn" id="rImp">${icon('upload')} Import CSV</button>` : ''}
      ${canEdit() ? `<button class="btn primary" id="rAdd">+ Thêm ${esc(def.title.toLowerCase())}</button>` : ''}</div></div>
    <div class="card"><div class="card-head toolbar">${filters.map((f) => `<select data-f="${f.k}">${f.opts.map(([v, l]) => `<option value="${esc(v)}" ${String(R.f[f.k] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`).join('')}
      <span class="sp"></span><div class="search">${icon('search')}<input type="text" id="rq" placeholder="Tìm kiếm" value="${esc(R.q)}"></div></div>
      <div class="table-wrap" id="rtbl"></div><div id="rpg"></div></div>`;
    let rows = [];
    const params = (extra = {}) => new URLSearchParams(Object.entries({ domain: S.domain, q: R.q, page: R.page, per: R.per, ...R.f, ...extra }).filter(([, v]) => v !== '' && v != null)).toString();
    async function load() {
      const d = await api(`/r/${name}?` + params());
      if (!d.rows.length && R.page > 1 && d.total) { R.page = 1; return load(); }
      rows = d.rows;
      const acts = (r) => `<td class="acts">${def.actions ? def.actions(r) : ''}${canEdit() ? `<button class="act pri" data-edit="${r.id}">${icon('edit')} Sửa</button><button class="act danger" data-del="${r.id}">${icon('trash')} Xoá</button>` : ''}</td>`;
      $('#rtbl').innerHTML = `<table><thead><tr>${def.cols.map((c) => `<th class="${c[2] || ''}">${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr>${def.cols.map((c) => c[1](r)).join('')}${acts(r)}</tr>`).join('') || `<tr><td colspan="${def.cols.length + 1}" class="empty">Chưa có dữ liệu${canEdit() ? '. Bấm <b>+ Thêm</b> để tạo mới.' : ''}</td></tr>`}</tbody></table>`;
      $('#rpg').innerHTML = pagerHTML(d.total, d.page, d.per);
      bindPager(view, (pg) => { R.page = pg; save(); load(); }, (n) => { R.per = n; R.page = 1; save(); load(); });
      $$('[data-edit]', view).forEach((b) => (b.onclick = async () => { const row = await api(`/r/${name}/${b.dataset.edit}`); openForm(name, row, o, refresh); }));
      $$('[data-del]', view).forEach((b) => (b.onclick = async () => {
        const r = rows.find((x) => x.id === +b.dataset.del);
        const extra = name === 'stores' ? '<br><br>Toàn bộ ưu đãi, câu hỏi thường gặp và thống kê của cửa hàng này cũng sẽ bị xoá.' : name === 'categories' ? '<br><br>Các cửa hàng/bài viết thuộc danh mục này sẽ không còn danh mục.' : '';
        if (!(await confirmBox('Xoá ' + def.title.toLowerCase(), `Xoá <b>${esc(r.name || r.title || r.question)}</b>?${extra}`))) return;
        try { await api(`/r/${name}/${r.id}`, { method: 'DELETE' }); toast('Đã xoá'); refresh(); } catch (er) { toast(er.message, 1); }
      }));
      $$('[data-perf]', view).forEach((b) => (b.onclick = () => openDetail(+b.dataset.perf)));
      $$('[data-copy]', view).forEach((b) => (b.onclick = () => copyText(b.dataset.copy, 'Đã copy mã ' + b.dataset.copy)));
    }
    const refresh = () => resourceView(name)();
    $$('[data-f]', view).forEach((s) => (s.onchange = () => { R.f[s.dataset.f] = s.value; R.page = 1; save(); load(); }));
    $('#rq').oninput = debounce((e) => { R.q = e.target.value; R.page = 1; save(); load(); });
    if ($('#rAdd')) $('#rAdd').onclick = () => openForm(name, null, o, refresh);
    if ($('#rImp')) $('#rImp').onclick = () => openImport(def.importKind, refresh);
    if ($('#rCsv')) $('#rCsv').onclick = async () => {
      const all = [];
      for (let pg = 1; pg < 1000; pg++) { const d = await api(`/r/${name}?` + params({ page: pg, per: 1000 })); all.push(...d.rows); if (all.length >= d.total || !d.rows.length) break; }
      downloadCSV(`${name}_${dom.host}.csv`, [def.csv.map((c) => c[1])].concat(all.map((r) => def.csv.map((c) => r[c[0]]))));
    };
    await load();
  };
}
Object.keys(RV).forEach((n) => (VIEWS[n] = resourceView(n)));

/* ================= Nhân viên ================= */
VIEWS.users = async () => {
  const view = $('#view');
  if (!isAdmin()) { view.innerHTML = '<div class="card empty">Chỉ quản trị viên mới xem được trang này</div>'; return; }
  const users = await api('/users');
  const roleOpts = (cur) => Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
  view.innerHTML = `<div class="page-head"><h1>Nhân viên</h1></div>
  <div class="card"><div class="card-head"><h3>Thêm tài khoản</h3></div><form id="uForm" class="m-body form"><div class="row">
    <label>Tên đăng nhập<input name="username" required></label><label>Họ tên<input name="name"></label>
    <label>Mật khẩu<input name="password" type="password" minlength="6" required></label>
    <label>Quyền<select name="role">${roleOpts('viewer')}</select></label>
    <button class="btn primary">+ Thêm</button></div>
    <div class="hint sub"><b>Quản trị viên</b>: toàn quyền (domain, nhân viên). <b>Biên tập viên</b>: thêm/sửa/xoá danh mục, cửa hàng, ưu đãi, nội dung, import. <b>Nhân viên</b>: chỉ xem số liệu.</div></form></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Quyền</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
  ${users.map((u) => `<tr><td><b>${esc(u.username)}</b>${u.id === ME.id ? ' <span class="badge-s">Bạn</span>' : ''}</td><td>${esc(u.name)}</td>
    <td>${u.id === ME.id ? ROLE_LABEL[u.role] : `<select data-urole="${u.id}" style="height:30px">${roleOpts(u.role)}</select>`}</td><td class="sub">${fmtTime(u.created_at)}</td>
    <td class="acts"><button class="act" data-uname="${u.id}">${icon('edit')} Đổi tên</button><button class="act" data-upw="${u.id}">${icon('key')} Đặt lại mật khẩu</button>${u.id !== ME.id ? `<button class="act danger" data-udel="${u.id}">${icon('trash')} Xoá</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#uForm').onsubmit = async (e) => { e.preventDefault(); try { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Đã thêm'); VIEWS.users(); } catch (er) { toast(er.message, 1); } };
  const small = (title, field, type, val, cb) => {
    openModal(`<div class="m-head"><h2>${title}</h2><button class="m-close" data-close>×</button></div><form class="m-body form" id="uf"><label>${field}<input name="v" type="${type}" ${type === 'password' ? 'minlength="6" required' : ''} value="${esc(val)}"></label><button class="btn primary">Lưu</button></form>`, 'sm');
    $('#uf').onsubmit = async (e) => { e.preventDefault(); try { await cb(e.target.elements.v.value); closeModal(); toast('Đã lưu'); VIEWS.users(); } catch (er) { toast(er.message, 1); } };
  };
  $$('[data-upw]').forEach((b) => (b.onclick = () => small('Đặt lại mật khẩu', 'Mật khẩu mới', 'password', '', (v) => api('/users/' + b.dataset.upw, { method: 'PUT', body: { password: v } }))));
  $$('[data-uname]').forEach((b) => (b.onclick = () => small('Đổi họ tên', 'Họ tên', 'text', users.find((u) => u.id === +b.dataset.uname).name, (v) => api('/users/' + b.dataset.uname, { method: 'PUT', body: { name: v } }))));
  $$('[data-urole]').forEach((s) => (s.onchange = async () => { try { await api('/users/' + s.dataset.urole, { method: 'PUT', body: { role: s.value } }); toast('Đã đổi quyền'); } catch (er) { toast(er.message, 1); } }));
  $$('[data-udel]').forEach((b) => (b.onclick = async () => {
    const u = users.find((x) => x.id === +b.dataset.udel);
    if (!(await confirmBox('Xoá tài khoản', `Xoá tài khoản <b>${esc(u.username)}</b>?`))) return;
    try { await api('/users/' + u.id, { method: 'DELETE' }); toast('Đã xoá'); VIEWS.users(); } catch (er) { toast(er.message, 1); }
  }));
};

/* ================= Hướng dẫn ================= */
/* ================= Biểu đồ ================= */
function lineChart(days) {
  const W = 1000, H = 220, P = { l: 44, r: 12, t: 12, b: 26 };
  const n = days.length; if (!n) return '<div class="empty">Chưa có dữ liệu</div>';
  const max = Math.max(1, ...days.map((d) => Math.max(d.visits, d.clicks, d.copies)));
  const nice = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / nice) * nice;
  const x = (i) => P.l + (n === 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / top);
  const line = (k) => days.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d[k]).toFixed(1)).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(top * f)}" y2="${y(top * f)}" class="g"/><text x="${P.l - 8}" y="${y(top * f) + 4}" text-anchor="end">${fmt(Math.round(top * f))}</text>`).join('');
  const step = Math.max(1, Math.ceil(n / 10));
  const labels = days.map((d, i) => (i % step === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtDay(d.day).slice(0, 5)}</text>` : '').join('');
  const dots = n <= 40 ? days.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.visits)}" r="3" class="d1"><title>${fmtDay(d.day)}: ${fmt(d.visits)} lượt vào, ${fmt(d.clicks)} lượt bấm, ${fmt(d.copies)} copy</title></circle>`).join('') : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Biểu đồ theo ngày">${grid}${labels}
    <path d="${line('copies')}" class="l3"/><path d="${line('clicks')}" class="l2"/><path d="${line('visits')}" class="l1"/>${dots}</svg>`;
}

/* ================= Tên chiến dịch ================= */
async function openCampaigns(done) {
  const rows = await api('/campaigns' + (S.domain ? '?domain=' + S.domain : ''));
  openModal(`<div class="m-head"><h2>Tên chiến dịch</h2><button class="m-close" data-close>×</button></div>
    <div class="m-body"><p class="sub" style="margin-top:0">Google Ads chỉ gửi <b>ID chiến dịch</b> (<code>{campaignid}</code>). Đặt tên ở đây để mọi bảng hiện tên dễ đọc. Để trống = bỏ tên.</p>
    <div class="scroll-box" style="max-height:60vh"><table class="mini-table"><thead><tr><th>ID chiến dịch</th>${!S.domain ? '<th>Domain</th>' : ''}<th class="r">Lượt vào</th><th>Tên</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td><code>${esc(r.cid)}</code></td>${!S.domain ? `<td class="sub">${esc(r.host)}</td>` : ''}<td class="r">${fmt(r.visits)}</td><td><input data-ci="${i}" value="${esc(r.name)}" placeholder="vd: Insta360 UK" style="width:100%"></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có chiến dịch nào trong dữ liệu</td></tr>'}
    </tbody></table></div></div>
    <div class="m-foot"><button class="btn" data-close>Huỷ</button><span style="flex:1"></span><button class="btn primary" id="campSave">Lưu</button></div>`);
  $('#campSave').onclick = async () => {
    const items = $$('[data-ci]').map((el) => { const r = rows[+el.dataset.ci]; return { domain_id: r.domain_id, cid: r.cid, name: el.value.trim() }; })
      .filter((it, i) => it.name !== rows[i].name);
    try { const r = await api('/campaigns', { method: 'POST', body: { items } }); closeModal(); toast('Đã lưu ' + r.saved + ' tên chiến dịch'); done && done(); } catch (er) { toast(er.message, 1); }
  };
}

/* ================= Sao lưu dữ liệu ================= */
VIEWS.backups = async () => {
  const view = $('#view');
  if (!isAdmin()) { view.innerHTML = '<div class="card empty">Chỉ quản trị viên mới xem được trang này</div>'; return; }
  const [b, h] = await Promise.all([api('/backups'), fetch('/api/health').then((r) => r.json()).catch(() => ({}))]);
  const size = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  view.innerHTML = `<div class="page-head"><h1>Sao lưu dữ liệu</h1><span class="sub">Tự động mỗi ngày · giữ ${b.keep} bản</span><span class="sp"></span>
    ${b.alerts ? '<button class="btn" id="tgTest">Gửi thử Telegram</button>' : ''}<button class="btn primary" id="bkNow">Tạo bản sao lưu ngay</button></div>
  <div class="kpis">
    <div class="kpi"><div class="l">Trạng thái</div><div class="v" style="color:${h.ok ? 'var(--green)' : 'var(--red)'}">${h.ok ? 'Hoạt động' : 'Lỗi'}</div><div class="s">Cấu trúc DB v${h.schema || '?'}</div></div>
    <div class="kpi"><div class="l">Lượt vào 1 giờ qua</div><div class="v">${fmt(h.visits_last_hour)}</div><div class="s">Dữ liệu đang được ghi nhận</div></div>
    <div class="kpi"><div class="l">Bản sao lưu gần nhất</div><div class="v" style="font-size:15px">${b.rows[0] ? fmtTime(b.rows[0].ts) : 'Chưa có'}</div></div>
    <div class="kpi"><div class="l">Cảnh báo Telegram</div><div class="v" style="font-size:15px">${b.alerts ? 'Đã bật' : 'Chưa cấu hình'}</div><div class="s">${b.alerts ? '' : 'Đặt TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID'}</div></div>
  </div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>File</th><th>Thời gian</th><th class="r">Dung lượng</th><th></th></tr></thead><tbody>
  ${b.rows.map((r) => `<tr><td><code>${esc(r.name)}</code>${/-\d{6}\.db$/.test(r.name) ? ' <span class="badge-s b">Tạo tay</span>' : ''}</td><td class="sub">${fmtTime(r.ts)}</td><td class="r">${size(r.size)}</td>
    <td class="acts"><a class="act pri" href="/api/backups/${encodeURIComponent(r.name)}" download>${icon('download')} Tải về</a></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có bản sao lưu. Bản đầu tiên tự tạo sau khi khởi động 30 giây.</td></tr>'}
  </tbody></table></div></div>
  <div class="card"><div class="m-body guide">
    <h3>Dữ liệu không bị mất khi nào?</h3>
    <ul><li>File dữ liệu nằm trong thư mục <code>DATA_DIR</code> (Docker: <code>/data</code>). Trên Dokploy phải gắn <b>Volume</b> vào <code>/data</code>, nếu không mỗi lần deploy lại sẽ mất dữ liệu.</li>
    <li>Bản sao lưu nằm cùng volume (<code>/data/backups</code>). Hãy <b>tải về</b> định kỳ hoặc bật Backups của Dokploy để có bản ở ngoài máy chủ.</li>
    <li>Khôi phục: dừng app, thay <code>/data/dashboard.db</code> bằng file sao lưu (xoá <code>dashboard.db-wal</code>, <code>dashboard.db-shm</code> nếu có), rồi khởi động lại.</li></ul>
  </div></div>`;
  $('#bkNow').onclick = async (e) => { e.target.disabled = true; try { const r = await api('/backups', { method: 'POST' }); toast('Đã tạo ' + r.name); VIEWS.backups(); } catch (er) { toast(er.message, 1); e.target.disabled = false; } };
  if ($('#tgTest')) $('#tgTest').onclick = async () => { try { await api('/alerts/test', { method: 'POST' }); toast('Đã gửi tin nhắn thử'); } catch (er) { toast(er.message, 1); } };
};

VIEWS.guide = async () => {
  $('#view').innerHTML = `<div class="page-head"><h1>Hướng dẫn</h1></div><div class="card"><div class="m-body guide">
    <h3>1. Thêm domain</h3><p>Vào <a href="#/domains">Domain</a> → nhập domain (vd <code>example.com</code>), nhóm (vd UK, US) → <b>Thêm domain</b>. Có thể dán nhiều domain một lúc bằng <b>Nhập nhiều domain</b>. Hệ thống tự kiểm tra online, chứng chỉ SSL và ngày hết hạn domain.</p>
    <h3>2. Dán mã nhúng</h3><p>Bấm <b>Mã nhúng</b>, sao chép đoạn <code>&lt;script&gt;</code> và dán vào header chung của website (WordPress: plugin "Insert Headers and Footers" hoặc file header.php của theme).</p>
    <h3>Mọi cú bấm đều được ghi nhận</h3><p>Sau khi dán mã nhúng, <b>mọi nút / link / tab / menu</b> được bấm trên website đều được gửi về (kể cả mở bằng chuột giữa). Tên nút lấy từ chữ trên nút, <code>aria-label</code> hoặc <code>title</code>; muốn đặt tên riêng dùng <code>data-cp-label="Tên"</code>, muốn bỏ qua một vùng dùng <code>data-cp-ignore</code>. Xem ở <a href="#/dashboard">Bảng điều khiển → Nút được bấm nhiều nhất</a> và trong Chi tiết cửa hàng → <b>Theo nút bấm</b>.</p>
    <h3>3. Đánh dấu cửa hàng & ưu đãi</h3><p>Thêm <code>data-cp-store="slug"</code> vào trang cửa hàng và <code>data-cp-offer="mã-theo-dõi"</code> cho mỗi ưu đãi. Nếu URL trang cửa hàng khớp mẫu của domain (mặc định <code>/store/{slug}</code>) thì không cần đánh dấu cửa hàng.</p>
    <h3>4. Gắn tham số cho quảng cáo</h3><p>Google Ads → Cài đặt tài khoản → <b>Hậu tố URL cuối cùng</b>: <code>utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={campaignid}&amp;utm_term={keyword}</code>. Link có <code>gad_source=1</code> hoặc <code>gclid</code> tự được tính là Quảng cáo.</p>
    <h3>5. Quản lý dữ liệu</h3><ul>
      <li><b>Danh mục, Cửa hàng, Mã & ưu đãi, Sự kiện khuyến mãi</b>: chọn domain ở thanh trên cùng, thêm tay hoặc <b>Import CSV</b> (có file mẫu). Cửa hàng/ưu đãi cũng tự xuất hiện khi trang có mã nhúng được truy cập.</li>
      <li><b>Trang tĩnh, Bài viết, Câu hỏi thường gặp</b>: soạn nội dung cho từng domain. <b>Mẫu nội dung</b> giúp chèn nhanh đoạn văn có sẵn với biến <code>{store}</code>, <code>{year}</code>...</li>
      <li>Website đọc nội dung đã xuất bản qua <b>API công khai</b> (xem trong <b>Domain → Mã nhúng</b>).</li>
      <li>Mọi lần import được lưu ở <a href="#/imports">Lịch sử import</a>.</li></ul>
    <h3>6. Phân quyền</h3><p><b>Quản trị viên</b>: toàn quyền. <b>Biên tập viên</b>: sửa dữ liệu & nội dung, import. <b>Nhân viên</b>: chỉ xem.</p>
    <h3>Cách tính chỉ số</h3><ul>
      <li><b>Lượt vào</b>: số lần trang cửa hàng được mở. <b>Vào thẳng</b>: lượt vào từ bên ngoài website.</li>
      <li><b>Kênh</b>: Quảng cáo (<code>gad_source</code>, <code>gclid</code>, <code>msclkid</code> hoặc <code>utm_medium=cpc</code>), Tìm kiếm tự nhiên (từ Google/Bing... không có tham số quảng cáo), Truy cập trực tiếp (không có nguồn), Khác (mạng xã hội, trang khác, email). Kênh được giữ nguyên trong cả phiên.</li>
      <li><b>Tỉ lệ bấm</b> = lượt vào có ít nhất 1 lần bấm / tổng lượt vào.</li>
      <li><b>Ưu đãi đang chạy</b>: ưu đãi đang hiển thị, trong thời hạn, và (nhập tay hoặc xuất hiện trên trang trong 7 ngày gần nhất).</li>
      <li><b>Quốc gia</b>: lấy từ header Cloudflare (<code>CF-IPCountry</code>) hoặc geoip-lite nếu đã cài.</li></ul>
  </div></div>`;
};

boot();
