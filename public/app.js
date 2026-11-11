'use strict';
/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);
const fmtDay = (d) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const fmtRange = (f, t) => (f === t ? fmtDay(f) : (f.slice(0, 4) === t.slice(0, 4) ? fmtDay(f).slice(0, 5) : fmtDay(f)) + ' – ' + fmtDay(t));
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('vi-VN') : '—');
let regionNames; try { regionNames = new Intl.DisplayNames(['vi'], { type: 'region' }); } catch { }
const countryName = (c) => { if (!c) return 'Không rõ'; try { return (regionNames ? regionNames.of(c) : c) + ' (' + c + ')'; } catch { return c; } };
const rateBadge = (r) => { const p = Math.round(r * 100); return `<span class="rate ${p >= 40 ? 'g' : p >= 15 ? 'o' : 'b'}">${p}%</span>`; };
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 2600); }
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error('Chưa đăng nhập'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Có lỗi xảy ra');
  return j;
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); } toast('Đã sao chép'); }

const RANGES = [['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['7d', '7 ngày qua'], ['14d', '14 ngày qua'], ['30d', '30 ngày qua'], ['90d', '90 ngày qua'], ['thismonth', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['custom', 'Tuỳ chọn...']];
const CHANNELS = [['all', 'Tất cả các kênh'], ['ads', 'Quảng cáo (Ads)'], ['organic', 'Tìm kiếm tự nhiên'], ['direct', 'Truy cập trực tiếp'], ['other', 'Khác (mạng xã hội, trang khác, email...)']];
const CH_LABEL = { ads: 'Quảng cáo trả phí', organic: 'Tìm kiếm tự nhiên', direct: 'Truy cập trực tiếp', other: 'Khác' };
const DEV_LABEL = { mobile: 'Điện thoại', desktop: 'Máy tính', tablet: 'Máy tính bảng', '': 'Không rõ' };
const OFFER_TYPE = { code: 'Mã giảm giá', deal: 'Ưu đãi' };

const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M15 8l2 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  store: '<path d="M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24">${IC[n]}</svg>`;
const FILTER_SVG = '<svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>';

/* ================= state ================= */
const DEFAULTS = { domain: 0, range: '7d', from: '', to: '', channel: 'all', country: '', active: true, sort: 'visits', dir: 'desc', page: 1, per: 10, q: '', kq: '', kstore: 0, ksort: 'visits', kdir: 'desc', kpage: 1 };
let S = { ...DEFAULTS }; try { Object.assign(S, JSON.parse(localStorage.getItem('dash_state') || '{}')); } catch { }
const save = () => { try { localStorage.setItem('dash_state', JSON.stringify(S)); } catch { } };
let ME = null, DOMAINS = [];
const isAdmin = () => ME && ME.role === 'admin';

function qs(extra = {}) {
  const o = { domain: S.domain || '', range: S.range, channel: S.channel, country: S.country, ...extra };
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
$('#pwBtn').onclick = () => {
  openModal(`<div class="m-head"><h2>Đổi mật khẩu</h2><button class="m-close" data-close>×</button></div>
    <form class="m-body form" id="pwForm"><label>Mật khẩu hiện tại<input type="password" name="old" required></label>
    <label>Mật khẩu mới<input type="password" name="new" minlength="6" required></label>
    <button class="btn primary">Lưu</button></form>`, 'sm');
  $('#pwForm').onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); try { await api('/me/password', { method: 'POST', body: Object.fromEntries(f) }); closeModal(); toast('Đã đổi mật khẩu'); } catch (er) { toast(er.message, 1); } };
};

const NAV = [
  ['dashboard', 'Bảng điều khiển', 'home'], ['performance', 'Hiệu quả cửa hàng', 'chart'], ['keywords', 'Từ khoá', 'key'],
  ['grp', 'Dữ liệu chính'], ['domains', 'Domain', 'globe'], ['stores', 'Cửa hàng', 'store'],
  ['grp', 'Hệ thống'], ['users', 'Nhân viên', 'users', 'admin'], ['guide', 'Hướng dẫn cài đặt', 'book'],
];
function renderNav() {
  const cur = (location.hash.slice(2) || 'performance').split('?')[0];
  $('#nav').innerHTML = NAV.filter((n) => !(n[3] === 'admin' && !isAdmin())).map((n) => n[0] === 'grp' ? `<div class="grp">${n[1]}</div>`
    : `<a href="#/${n[0]}" class="${cur === n[0] ? 'active' : ''}">${icon(n[2])}${n[1]}</a>`).join('');
}
async function loadDomains() {
  DOMAINS = await api('/domains');
  if (S.domain && !DOMAINS.some((d) => d.id === S.domain)) { S.domain = 0; save(); }
  $('#domainSel').innerHTML = `<option value="0">Tất cả domain (${DOMAINS.length})</option>` + DOMAINS.map((d) => `<option value="${d.id}" ${d.id === S.domain ? 'selected' : ''}>${esc(d.name)} – ${esc(d.host)}</option>`).join('');
}
$('#domainSel').onchange = (e) => { S.domain = +e.target.value; S.page = 1; S.kpage = 1; S.kstore = 0; S.country = ''; save(); render(); };

async function boot() {
  try { ME = await api('/me'); } catch { return; }
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#meName').textContent = ME.name || ME.username; $('#meRole').textContent = ME.role === 'admin' ? 'Quản trị viên' : 'Nhân viên (chỉ xem)';
  await loadDomains(); render();
}
window.addEventListener('hashchange', () => { $('#sidebar').classList.remove('open'); render(); });

const VIEWS = {};
async function render() {
  renderNav();
  const name = (location.hash.slice(2) || 'performance').split('?')[0];
  const v = VIEWS[name] || VIEWS.performance;
  try { await v(); } catch (e) { if (e.message !== 'Chưa đăng nhập') $('#view').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}

/* ================= modal ================= */
function openModal(html, size = '') { const b = $('#modalBox'); b.className = 'modal-box ' + size; b.innerHTML = html; $('#modal').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modal').classList.add('hidden'); document.body.style.overflow = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ================= shared filter bar ================= */
async function filtersHTML({ channel = true, country = true } = {}) {
  let countries = [];
  if (country) countries = await api('/countries?' + qs()).catch(() => []);
  const custom = S.range === 'custom' ? `<div class="f"><span>Từ ngày</span><input type="date" id="fFrom" value="${esc(S.from)}"></div><div class="f"><span>Đến ngày</span><input type="date" id="fTo" value="${esc(S.to)}"></div>` : '';
  return `<div class="filters">
    <div class="f"><span>Khoảng thời gian</span><select id="fRange">${RANGES.map(([v, l]) => `<option value="${v}" ${S.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${custom}
    ${channel ? `<div class="f"><span>Kênh</span><select id="fChannel">${CHANNELS.map(([v, l]) => `<option value="${v}" ${S.channel === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    ${country ? `<div class="f"><span>Quốc gia</span><select id="fCountry"><option value="">Tất cả quốc gia</option>${countries.map((c) => `<option value="${esc(c.country || '--')}" ${S.country === (c.country || '--') ? 'selected' : ''}>${esc(countryName(c.country))} · ${fmt(c.visits)}</option>`).join('')}${S.country && !countries.some((c) => (c.country || '--') === S.country) ? `<option value="${esc(S.country)}" selected>${esc(countryName(S.country === '--' ? '' : S.country))}</option>` : ''}</select></div>` : ''}
  </div>`;
}
function bindFilters(rerender) {
  const on = (id, fn) => { const el = $(id); if (el) el.onchange = fn; };
  on('#fRange', (e) => {
    S.range = e.target.value;
    if (S.range === 'custom' && !S.from) { const t = new Date(); S.to = t.toISOString().slice(0, 10); t.setDate(t.getDate() - 7); S.from = t.toISOString().slice(0, 10); }
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
  let nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return `<div class="pager"><span>Đang hiện từ ${from} đến ${to} của ${fmt(total)} ${label}</span><span class="sp"></span>
    <span class="per"><span>Mỗi trang</span><select data-per>${[10, 20, 50, 100].map((n) => `<option ${n === per ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
    <span class="pages"><button data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>${nums.map((n) => n === '…' ? '<button disabled>…</button>' : `<button data-page="${n}" class="${n === page ? 'on' : ''}">${n}</button>`).join('')}<button data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button></span></div>`;
}
function sortTh(label, key, cur, dir, cls = '') { return `<th class="sort ${cls} ${cur === key ? dir : ''}" data-sort="${key}">${label}</th>`; }

/* ================= Dashboard ================= */
VIEWS.dashboard = async () => {
  const view = $('#view');
  const [fh, d] = await Promise.all([filtersHTML(), api('/overview?' + qs())]);
  const k = d.kpi, p = d.prev;
  const delta = (a, b) => { if (!b) return a ? '<span class="delta up">mới</span>' : ''; const x = Math.round(((a - b) * 100) / b); return `<span class="delta ${x >= 0 ? 'up' : 'down'}">${x >= 0 ? '▲' : '▼'} ${Math.abs(x)}%</span>`; };
  const maxDay = Math.max(1, ...d.byDay.map((r) => r.visits));
  const domName = S.domain ? (DOMAINS.find((x) => x.id === S.domain) || {}).name : 'Tất cả domain';
  view.innerHTML = `<h1 class="page">Bảng điều khiển · ${esc(domName)} <span class="sub">${fmtRange(d.from, d.to)}</span></h1>${fh}
  ${!DOMAINS.length ? `<div class="card empty">Chưa có domain nào. <a href="#/domains">Thêm domain đầu tiên →</a></div>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="l">Lượt vào</div><div class="v">${fmt(k.visits)}</div><div class="s">${delta(k.visits, p.visits)} so với kỳ trước</div></div>
    <div class="kpi"><div class="l">Từ Ads</div><div class="v">${fmt(k.ads)}</div><div class="s">${pct(k.ads, k.visits)}% lượt vào</div></div>
    <div class="kpi"><div class="l">Tỉ lệ bấm</div><div class="v">${pct(k.clicked, k.visits)}%</div><div class="s">${fmt(k.clicked)} lượt vào có bấm</div></div>
    <div class="kpi"><div class="l">Lượt bấm</div><div class="v">${fmt(k.clicks)}</div><div class="s">${delta(k.clicks, p.clicks)}</div></div>
    <div class="kpi"><div class="l">Copy mã</div><div class="v">${fmt(k.copies)}</div><div class="s">${delta(k.copies, p.copies)}</div></div>
  </div>
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
    <tbody>${d.byDomain.map((r) => `<tr><td class="store-cell"><b>${esc(r.name)}</b><span class="sub">${esc(r.host)}</span></td><td class="r">${fmt(r.visits)}</td><td class="r">${rateBadge(r.visits ? r.clicked / r.visits : 0)}</td><td class="r">${fmt(r.clicks)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  bindFilters(VIEWS.dashboard);
  $$('[data-detail]', view).forEach((a) => (a.onclick = () => openDetail(+a.dataset.detail)));
};

/* ================= Hiệu quả cửa hàng ================= */
VIEWS.performance = async () => {
  const view = $('#view');
  view.innerHTML = (await filtersHTML()) + `<div class="card">
    <div class="card-head"><span class="sp"></span><div class="search">${icon('search')}<input type="text" id="q" placeholder="Tìm kiếm" value="${esc(S.q)}"></div>
      <button class="icon-btn" id="fbtn" title="Bộ lọc">${FILTER_SVG}<span class="badge">${S.active ? 1 : ''}</span></button></div>
    <div id="applied"></div><div class="table-wrap" id="tbl"></div><div id="pg"></div></div>`;
  bindFilters(VIEWS.performance);
  $('#q').oninput = debounce((e) => { S.q = e.target.value; S.page = 1; save(); load(); });
  $('#fbtn').onclick = () => { S.active = !S.active; S.page = 1; save(); $('#fbtn .badge').textContent = S.active ? 1 : ''; load(); };
  async function load() {
    const d = await api('/stores?' + qs({ q: S.q, active: S.active ? 1 : 0, sort: S.sort, dir: S.dir, page: S.page, per: S.per }));
    if (d.rows.length === 0 && S.page > 1 && d.total) { S.page = 1; return load(); }
    $('#applied').innerHTML = S.active ? `<div class="applied">Bộ lọc đang áp dụng <span class="chip">Chỉ store có lượt truy cập <button id="rmActive">×</button></span><span class="sp" style="flex:1"></span><button class="act" id="rmAll">×</button></div>` : '';
    const showDomain = !S.domain && DOMAINS.length > 1;
    $('#tbl').innerHTML = `<table><thead><tr>
      ${sortTh('Cửa hàng', 'name', S.sort, S.dir)}${showDomain ? sortTh('Domain', 'host', S.sort, S.dir) : ''}${sortTh('Lượt vào', 'visits', S.sort, S.dir)}${sortTh(S.channel === 'ads' || S.channel === 'all' ? 'Từ Ads' : 'Từ Ads', 'ads', S.sort, S.dir)}
      ${sortTh('Tỉ lệ bấm', 'rate', S.sort, S.dir)}${sortTh('Lượt bấm', 'clicks', S.sort, S.dir)}${sortTh('Copy mã', 'copies', S.sort, S.dir)}
      ${sortTh('Quốc gia chính', 'country', S.sort, S.dir)}${sortTh('Ưu đãi đang chạy', 'offers', S.sort, S.dir)}<th></th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr>
        <td class="store-cell"><b>${esc(r.name || r.slug)}</b><span class="sub">${esc(r.url ? r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : r.slug)}</span></td>
        ${showDomain ? `<td class="sub">${esc(r.host)}</td>` : ''}
        <td>${fmt(r.visits)}</td><td>${fmt(r.ads)}<div class="sub">${pct(r.ads, r.visits)}%</div></td>
        <td>${rateBadge(r.rate)}</td><td>${fmt(r.clicks)}</td><td>${fmt(r.copies)}</td>
        <td>${r.country ? esc(countryName(r.country)) : '<span class="sub">—</span>'}</td><td><span class="pill-n">${r.offers}</span></td>
        <td class="acts"><button class="act" data-detail="${r.id}">${icon('search')} Chi tiết</button>
          ${r.page_url ? `<a class="act" href="${esc(r.page_url)}" target="_blank" rel="noopener">${icon('open')} Mở trang</a>` : ''}</td></tr>`).join('')
      || `<tr><td colspan="10" class="empty">${DOMAINS.length ? 'Không có cửa hàng nào trong khoảng thời gian / bộ lọc này' : 'Chưa có domain nào. <a href="#/domains">Thêm domain →</a>'}</td></tr>`}
      </tbody></table>`;
    $('#pg').innerHTML = pagerHTML(d.total, d.page, d.per);
    $$('[data-sort]', view).forEach((th) => (th.onclick = () => { const k = th.dataset.sort; if (S.sort === k) S.dir = S.dir === 'desc' ? 'asc' : 'desc'; else { S.sort = k; S.dir = k === 'name' || k === 'country' || k === 'host' ? 'asc' : 'desc'; } S.page = 1; save(); load(); }));
    $$('[data-detail]', view).forEach((b) => (b.onclick = () => openDetail(+b.dataset.detail)));
    $$('[data-page]', view).forEach((b) => (b.onclick = () => { S.page = +b.dataset.page; save(); load(); }));
    $('[data-per]', view).onchange = (e) => { S.per = +e.target.value; S.page = 1; save(); load(); };
    const rm = () => { S.active = false; S.page = 1; save(); $('#fbtn .badge').textContent = ''; load(); };
    if ($('#rmActive')) { $('#rmActive').onclick = rm; $('#rmAll').onclick = rm; }
  }
  await load();
};

/* ================= Store detail modal ================= */
async function openDetail(id) {
  const F = { range: S.range, from: S.from, to: S.to, channel: S.channel, country: S.country };
  openModal(`<div class="m-head"><h2>Đang tải...</h2><button class="m-close" data-close>×</button></div><div class="m-body"></div>`);
  async function load() {
    const d = await api(`/stores/${id}/detail?` + qs({ domain: '', range: F.range, from: F.from, to: F.to, channel: F.channel, country: F.country }));
    const countries = await api('/countries?' + qs({ domain: d.store.domain_id, range: F.range, from: F.from, to: F.to })).catch(() => []);
    const k = d.kpi, s = d.store;
    const totalPosClicks = d.byPosition.reduce((a, r) => a + r.clicks, 0);
    const tr = (cells) => `<tr>${cells.join('')}</tr>`;
    const td = (v, cls = 'r') => `<td class="${cls}">${v}</td>`;
    const empty = (n) => `<tr><td colspan="${n}" class="empty" style="padding:14px">Chưa có dữ liệu</td></tr>`;
    $('#modalBox').innerHTML = `<div class="m-head"><h2>${esc(s.name || s.slug)} · ${fmtRange(d.from, d.to)} <span class="sub">${esc(s.host)}</span></h2><button class="m-close" data-close>×</button></div>
    <div class="m-body">
      <div class="row" style="align-items:center"><select id="dRange" style="max-width:170px;flex:none">${RANGES.filter((r) => r[0] !== 'custom' || F.range === 'custom').map(([v, l]) => `<option value="${v}" ${F.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="tabs">${CHANNELS.map(([v, l]) => `<button class="tab ${F.channel === v ? 'on' : ''}" data-ch="${v}">${l}</button>`).join('')}</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:12px"><select id="dCountry" style="max-width:220px"><option value="">Tất cả quốc gia</option>${countries.map((c) => `<option value="${esc(c.country || '--')}" ${F.country === (c.country || '--') ? 'selected' : ''}>${esc(countryName(c.country))}</option>`).join('')}</select></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Lượt vào</div><div class="v">${fmt(k.visits)}</div><div class="s">${fmt(k.entries)} lượt vào thẳng trang này</div></div>
        <div class="kpi"><div class="l">Tỉ lệ bấm</div><div class="v">${pct(k.clicked, k.visits)}%</div><div class="s">${fmt(k.clicked)} lượt vào có bấm</div></div>
        <div class="kpi"><div class="l">Lượt bấm</div><div class="v">${fmt(k.clicks)}</div></div>
        <div class="kpi"><div class="l">Copy mã</div><div class="v">${fmt(k.copies)}</div></div>
        <div class="kpi"><div class="l">Ưu đãi đang chạy</div><div class="v">${fmt(k.offers)}</div></div>
      </div>
      <div class="sec-title">Theo vị trí bấm</div>
      <table><thead><tr><th>Vị trí</th><th class="r">Lượt vào có bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th><th class="r">Tỉ trọng lượt bấm</th></tr></thead><tbody>
        ${d.byPosition.map((r) => tr([td(esc(r.position || '(không rõ)'), ''), td(fmt(r.clicked)), td('<b>' + fmt(r.clicks) + '</b>'), td(fmt(r.copies)), td(pct(r.clicks, totalPosClicks) + '%')])).join('') || empty(5)}</tbody></table>
      <div class="sec-title">Theo nguồn</div>
      <table><thead><tr><th>Kênh</th><th>Nguồn</th><th class="r">Lượt vào</th><th class="r">Vào thẳng</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.bySource.map((r) => tr([td(`<span class="tag ${r.channel}">${CH_LABEL[r.channel] || r.channel}</span>`, ''), td(esc(r.source), ''), td('<b>' + fmt(r.visits) + '</b>'), td(fmt(r.entries)), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(7)}</tbody></table>
      <div class="sec-title">Theo quốc gia</div>
      <table><thead><tr><th>Quốc gia</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byCountry.map((r) => tr([td(esc(countryName(r.country)), ''), td('<b>' + fmt(r.visits) + '</b>'), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(5)}</tbody></table>
      <div class="sec-title">Theo chiến dịch và từ khoá <a id="allKw">Xem mọi từ khoá của store này →</a></div>
      <table><thead><tr><th>Chiến dịch</th><th>Từ khoá</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byKeyword.slice(0, 30).map((r) => tr([td(esc(r.campaign || '—'), 'sub'), td(esc(r.keyword), ''), td('<b>' + fmt(r.visits) + '</b>'), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(6)}</tbody></table>
      <div class="sec-title">Theo ưu đãi</div>
      <table><thead><tr><th>Ưu đãi</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byOffer.map((r) => tr([td(`${esc(r.title || r.okey)} <span class="sub">${esc(OFFER_TYPE[r.type] || r.type || '')}</span>`, ''), td('<b>' + fmt(r.clicks) + '</b>'), td(fmt(r.copies))])).join('') || empty(3)}</tbody></table>
      <div class="sec-title">Theo thiết bị</div>
      <table><thead><tr><th>Thiết bị</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byDevice.map((r) => tr([td(DEV_LABEL[r.device] || esc(r.device), ''), td('<b>' + fmt(r.visits) + '</b>'), td(pct(r.clicked, r.visits) + '%'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('') || empty(5)}</tbody></table>
      <div class="sec-title">Theo ngày</div>
      <table><thead><tr><th>Ngày</th><th class="r">Lượt vào</th><th class="r">Tỉ lệ bấm</th><th class="r">Lượt bấm</th><th class="r">Copy mã</th></tr></thead><tbody>
        ${d.byDay.map((r) => tr([td(fmtDay(r.day), ''), td('<b>' + fmt(r.visits) + '</b>'), td(r.visits ? pct(r.clicked, r.visits) + '%' : '—'), td(fmt(r.clicks)), td(fmt(r.copies))])).join('')}</tbody></table>
    </div>
    <div class="m-foot"><button class="btn" data-close>Đóng</button><span style="flex:1"></span>${s.page_url ? `<a class="btn" href="${esc(s.page_url)}" target="_blank" rel="noopener">Mở trang</a>` : ''}</div>`;
    $('#dRange').onchange = (e) => { F.range = e.target.value; load(); };
    $('#dCountry').onchange = (e) => { F.country = e.target.value; load(); };
    $$('[data-ch]').forEach((b) => (b.onclick = () => { F.channel = b.dataset.ch; load(); }));
    $('#allKw').onclick = () => { S.kstore = id; S.kpage = 1; S.domain = s.domain_id; S.range = F.range; S.channel = F.channel; S.country = F.country; save(); $('#domainSel').value = s.domain_id; closeModal(); location.hash = '#/keywords'; render(); };
  }
  try { await load(); } catch (e) { toast(e.message, 1); closeModal(); }
}

/* ================= Từ khoá ================= */
VIEWS.keywords = async () => {
  const view = $('#view');
  const [fh, d, stores] = await Promise.all([filtersHTML(), api('/keywords?' + qs({ store: S.kstore || '' })), api('/stores?' + qs({ active: 1, per: 500, sort: 'name', dir: 'asc' }))]);
  view.innerHTML = `<h1 class="page">Từ khoá <span class="sub">${fmtRange(d.from, d.to)}</span></h1>${fh}
  <div class="card"><div class="card-head"><select id="kStore" style="max-width:260px"><option value="0">Tất cả cửa hàng</option>${stores.rows.map((s) => `<option value="${s.id}" ${s.id === S.kstore ? 'selected' : ''}>${esc(s.name || s.slug)}${!S.domain ? ' – ' + esc(s.host) : ''}</option>`).join('')}</select>
    <span class="sp"></span><div class="search">${icon('search')}<input type="text" id="kq" placeholder="Tìm từ khoá" value="${esc(S.kq)}"></div>
    <button class="btn sm" id="kCsv">Xuất CSV</button></div><div class="table-wrap" id="ktbl"></div><div id="kpg"></div></div>`;
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
      ${pageRows.map((r) => `<tr><td>${esc(r.keyword)}</td><td class="store-cell"><b>${esc(r.store_name || r.slug)}</b>${!S.domain ? `<span class="sub">${esc(r.host)}</span>` : ''}</td><td class="sub">${esc(r.campaign || '—')}</td><td class="r"><b>${fmt(r.visits)}</b></td><td class="r">${rateBadge(r.rate)}</td><td class="r">${fmt(r.clicks)}</td><td class="r">${fmt(r.copies)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có từ khoá. Từ khoá được lấy từ tham số <code>utm_term</code> trên link quảng cáo.</td></tr>'}</tbody></table>`;
    $('#kpg').innerHTML = pagerHTML(rows.length, S.kpage, per, 'từ khoá');
    $$('[data-sort]', view).forEach((th) => (th.onclick = () => { const key = th.dataset.sort; if (S.ksort === key) S.kdir = S.kdir === 'desc' ? 'asc' : 'desc'; else { S.ksort = key; S.kdir = ['keyword', 'store_name', 'campaign'].includes(key) ? 'asc' : 'desc'; } save(); draw(); }));
    $$('[data-page]', view).forEach((b) => (b.onclick = () => { S.kpage = +b.dataset.page; save(); draw(); }));
    $('[data-per]', view).onchange = (e) => { S.per = +e.target.value; S.kpage = 1; save(); draw(); };
    $('#kCsv').onclick = () => {
      const lines = [['Từ khoá', 'Cửa hàng', 'Domain', 'Chiến dịch', 'Lượt vào', 'Tỉ lệ bấm (%)', 'Lượt bấm', 'Copy mã']].concat(rows.map((r) => [r.keyword, r.store_name, r.host, r.campaign, r.visits, Math.round(r.rate * 100), r.clicks, r.copies]));
      const csv = '﻿' + lines.map((l) => l.map((c) => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `tu-khoa_${d.from}_${d.to}.csv`; a.click();
    };
  };
  $('#kq').oninput = debounce((e) => { S.kq = e.target.value; S.kpage = 1; save(); draw(); }, 200);
  draw();
};

/* ================= Domain ================= */
function snippet(d) { return `<script async src="${location.origin}/t.js" data-site="${d.site_key}"></script>`; }
VIEWS.domains = async () => {
  const view = $('#view');
  await loadDomains();
  view.innerHTML = `<h1 class="page">Domain</h1>
  ${isAdmin() ? `<div class="card"><div class="card-head"><h3>Thêm domain mới</h3></div>
    <form id="addDom" class="m-body form"><div class="row">
      <label>Domain<input name="host" placeholder="vd: magiamgia.com" required></label>
      <label>Tên hiển thị<input name="name" placeholder="vd: Site Coupon UK"></label>
      <button class="btn primary">+ Thêm domain</button></div></form></div>` : ''}
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Tên</th><th>Domain</th><th>Trạng thái</th><th class="r">Cửa hàng</th><th class="r">Lượt vào 7 ngày</th><th>Dữ liệu gần nhất</th><th></th></tr></thead><tbody>
  ${DOMAINS.map((d) => {
    const recent = d.last_hit && Date.now() - d.last_hit < 864e5 * 2;
    const st = !d.active ? '<span class="status"><span class="dot"></span>Tạm dừng</span>' : d.last_hit ? `<span class="status"><span class="dot ${recent ? 'on' : 'warn'}"></span>${recent ? 'Đang nhận dữ liệu' : 'Không có dữ liệu mới'}</span>` : '<span class="status"><span class="dot warn"></span>Chờ cài mã</span>';
    return `<tr><td><b>${esc(d.name)}</b></td><td><a href="https://${esc(d.host)}" target="_blank" rel="noopener">${esc(d.host)}</a></td><td>${st}</td><td class="r">${fmt(d.stores)}</td><td class="r">${fmt(d.visits7)}</td><td class="sub">${fmtTime(d.last_hit)}</td>
      <td class="acts"><button class="act" data-snip="${d.id}">${icon('code')} Mã nhúng</button>${isAdmin() ? `<button class="act" data-edit="${d.id}">${icon('edit')} Sửa</button><button class="act danger" data-del="${d.id}">${icon('trash')} Xoá</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">Chưa có domain nào</td></tr>'}</tbody></table></div></div>`;
  const f = $('#addDom');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    try { const d = await api('/domains', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Đã thêm domain'); await VIEWS.domains(); showSnippet(d); }
    catch (er) { toast(er.message, 1); }
  };
  $$('[data-snip]', view).forEach((b) => (b.onclick = () => showSnippet(DOMAINS.find((x) => x.id === +b.dataset.snip))));
  $$('[data-edit]', view).forEach((b) => (b.onclick = () => editDomain(DOMAINS.find((x) => x.id === +b.dataset.edit))));
  $$('[data-del]', view).forEach((b) => (b.onclick = () => {
    const d = DOMAINS.find((x) => x.id === +b.dataset.del);
    openModal(`<div class="m-head"><h2>Xoá domain</h2><button class="m-close" data-close>×</button></div>
      <div class="m-body">Xoá <b>${esc(d.host)}</b> sẽ xoá <b>toàn bộ</b> cửa hàng và dữ liệu thống kê của domain này. Không thể hoàn tác.<br><br>Gõ <code>${esc(d.host)}</code> để xác nhận:<br><input id="delConfirm" style="width:100%;margin-top:8px"></div>
      <div class="m-foot"><button class="btn" data-close>Huỷ</button><span style="flex:1"></span><button class="btn danger" id="delGo">Xoá vĩnh viễn</button></div>`, 'sm');
    $('#delGo').onclick = async () => {
      if ($('#delConfirm').value.trim() !== d.host) return toast('Tên domain không khớp', 1);
      try { await api('/domains/' + d.id, { method: 'DELETE' }); closeModal(); toast('Đã xoá'); VIEWS.domains(); } catch (er) { toast(er.message, 1); }
    };
  }));
};
function showSnippet(d) {
  const code = snippet(d);
  openModal(`<div class="m-head"><h2>Mã nhúng · ${esc(d.host)}</h2><button class="m-close" data-close>×</button></div>
  <div class="m-body guide">
    <p><b>Bước 1.</b> Dán đoạn mã sau vào trước thẻ <code>&lt;/head&gt;</code> trên <b>mọi trang</b> của ${esc(d.host)} (hoặc trong theme/header chung):</p>
    <pre class="code" id="snipCode">${esc(code)}</pre><button class="btn sm" id="cpSnip">Sao chép mã</button>
    <p style="margin-top:16px"><b>Bước 2.</b> Gắn thuộc tính để hệ thống nhận diện cửa hàng và ưu đãi (khuyến nghị):</p>
    <pre class="code">${esc(`<!-- Trang cửa hàng: đặt ở thẻ bao ngoài (body/main) -->
<main data-cp-store="insta360" data-cp-store-name="Insta360" data-cp-store-url="https://insta360.com">

  <!-- Mỗi ưu đãi / mã giảm giá -->
  <div data-cp-offer="insta360-5off" data-cp-type="code" data-cp-title="Insta360 Coupon: 5% OFF with Code">
    <button>Lấy mã</button>   <!-- click tự được ghi nhận -->
  </div>

  <!-- Nút khác cần đếm lượt bấm (tuỳ chọn vị trí) -->
  <a href="..." data-cp-click data-cp-pos="Nút trên trang">Đến cửa hàng</a>
</main>`)}</pre>
    <p>Nếu không gắn <code>data-cp-store</code>, hệ thống tự lấy tên cửa hàng từ URL theo mẫu: <code>${esc(d.store_pattern || '/store/{tên}, /coupons/{tên}, /cua-hang/{tên}...')}</code> (đổi trong mục <b>Sửa</b>).</p>
    <p><b>Copy mã</b> được ghi nhận tự động khi trang dùng <code>navigator.clipboard</code>, <code>execCommand('copy')</code> hoặc người dùng tự bôi đen + Ctrl+C. Có thể gọi thủ công: <code>CPTrack.copy('offer-id')</code>.</p>
    <p><b>Từ khoá & kênh Ads:</b> thêm vào link quảng cáo Google Ads (Final URL suffix): <code>utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={campaignid}&amp;utm_term={keyword}</code>. Link có <code>gad_source</code>/<code>gclid</code> tự được tính là Quảng cáo.</p>
  </div><div class="m-foot"><button class="btn" data-close>Đóng</button></div>`);
  $('#cpSnip').onclick = () => copyText(code);
}
function editDomain(d) {
  openModal(`<div class="m-head"><h2>Sửa domain</h2><button class="m-close" data-close>×</button></div>
  <form class="m-body form" id="edDom">
    <label>Tên hiển thị<input name="name" value="${esc(d.name)}"></label>
    <label>Domain<input name="host" value="${esc(d.host)}"></label>
    <label>Mẫu URL trang cửa hàng (regex, nhóm 1 = tên cửa hàng) <span class="hint">Để trống = mặc định. Vd: <code>^/coupons/([^/]+)</code> hoặc <code>^/([^/]+)-coupon</code></span>
      <input name="store_pattern" value="${esc(d.store_pattern)}" placeholder="^/(?:store|coupons?|cua-hang)/([^/?#]+)"></label>
    <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="active" ${d.active ? 'checked' : ''} style="height:auto"> Đang hoạt động (nhận dữ liệu)</label>
    <label>Site key <span class="hint">Dùng trong mã nhúng, không đổi được</span><input value="${esc(d.site_key)}" readonly></label>
    <button class="btn primary">Lưu</button></form>`, 'sm');
  $('#edDom').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await api('/domains/' + d.id, { method: 'PUT', body: { name: f.get('name'), host: f.get('host'), store_pattern: f.get('store_pattern'), active: f.get('active') === 'on' } }); closeModal(); toast('Đã lưu'); VIEWS.domains(); }
    catch (er) { toast(er.message, 1); }
  };
}

/* ================= Cửa hàng (quản lý) ================= */
VIEWS.stores = async () => {
  const view = $('#view');
  const d = await api('/stores?' + qs({ range: '30d', channel: 'all', country: '', active: 0, per: 500, sort: 'name', dir: 'asc' }));
  view.innerHTML = `<h1 class="page">Cửa hàng <span class="sub">${fmt(d.total)} cửa hàng · tự động thêm khi có lượt truy cập</span></h1>
  <div class="card"><div class="card-head"><span class="sp"></span><div class="search">${icon('search')}<input type="text" id="sq" placeholder="Tìm cửa hàng"></div></div>
  <div class="table-wrap"><table><thead><tr><th>Cửa hàng</th><th>Slug</th><th>Domain</th><th>Website cửa hàng</th><th class="r">Lượt vào 30 ngày</th><th></th></tr></thead><tbody id="sbody"></tbody></table></div></div>`;
  const draw = (q = '') => {
    const rows = d.rows.filter((r) => !q || (r.name + ' ' + r.slug + ' ' + r.url).toLowerCase().includes(q.toLowerCase()));
    $('#sbody').innerHTML = rows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td class="sub">${esc(r.slug)}</td><td class="sub">${esc(r.host)}</td><td>${r.url ? esc(r.url) : '<span class="sub">—</span>'}</td><td class="r">${fmt(r.visits)}</td>
      <td class="acts">${r.page_url ? `<a class="act" href="${esc(r.page_url)}" target="_blank" rel="noopener">${icon('open')} Mở trang</a>` : ''}${isAdmin() ? `<button class="act" data-sedit="${r.id}">${icon('edit')} Sửa</button><button class="act danger" data-sdel="${r.id}">${icon('trash')} Xoá</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có cửa hàng nào. Cửa hàng sẽ tự xuất hiện khi trang có mã nhúng được truy cập.</td></tr>';
    $$('[data-sedit]').forEach((b) => (b.onclick = () => {
      const s = d.rows.find((x) => x.id === +b.dataset.sedit);
      openModal(`<div class="m-head"><h2>Sửa cửa hàng</h2><button class="m-close" data-close>×</button></div>
        <form class="m-body form" id="sForm"><label>Tên cửa hàng<input name="name" value="${esc(s.name)}"></label><label>Website cửa hàng<input name="url" value="${esc(s.url)}" placeholder="https://insta360.com"></label><button class="btn primary">Lưu</button></form>`, 'sm');
      $('#sForm').onsubmit = async (e) => { e.preventDefault(); try { await api('/stores/' + s.id, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('Đã lưu'); VIEWS.stores(); } catch (er) { toast(er.message, 1); } };
    }));
    $$('[data-sdel]').forEach((b) => (b.onclick = () => {
      const s = d.rows.find((x) => x.id === +b.dataset.sdel);
      openModal(`<div class="m-head"><h2>Xoá cửa hàng</h2><button class="m-close" data-close>×</button></div><div class="m-body">Xoá <b>${esc(s.name)}</b> và toàn bộ dữ liệu thống kê của cửa hàng này?</div>
        <div class="m-foot"><button class="btn" data-close>Huỷ</button><span style="flex:1"></span><button class="btn danger" id="sDelGo">Xoá</button></div>`, 'sm');
      $('#sDelGo').onclick = async () => { try { await api('/stores/' + s.id, { method: 'DELETE' }); closeModal(); toast('Đã xoá'); VIEWS.stores(); } catch (er) { toast(er.message, 1); } };
    }));
  };
  $('#sq').oninput = debounce((e) => draw(e.target.value), 150);
  draw();
};

/* ================= Nhân viên ================= */
VIEWS.users = async () => {
  const view = $('#view');
  if (!isAdmin()) { view.innerHTML = '<div class="card empty">Chỉ quản trị viên mới xem được trang này</div>'; return; }
  const users = await api('/users');
  view.innerHTML = `<h1 class="page">Nhân viên</h1>
  <div class="card"><div class="card-head"><h3>Thêm tài khoản</h3></div><form id="uForm" class="m-body form"><div class="row">
    <label>Tên đăng nhập<input name="username" required></label><label>Họ tên<input name="name"></label>
    <label>Mật khẩu<input name="password" type="password" minlength="6" required></label>
    <label>Quyền<select name="role"><option value="viewer">Nhân viên (chỉ xem)</option><option value="admin">Quản trị viên</option></select></label>
    <button class="btn primary">+ Thêm</button></div></form></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Quyền</th><th>Ngày tạo</th><th></th></tr></thead><tbody>
  ${users.map((u) => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td><td>${u.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</td><td class="sub">${fmtTime(u.created_at)}</td>
    <td class="acts"><button class="act" data-upw="${u.id}">${icon('key')} Đặt lại mật khẩu</button>${u.id !== ME.id ? `<button class="act" data-urole="${u.id}" data-role="${u.role}">${icon('users')} ${u.role === 'admin' ? 'Hạ quyền' : 'Lên admin'}</button><button class="act danger" data-udel="${u.id}">${icon('trash')} Xoá</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#uForm').onsubmit = async (e) => { e.preventDefault(); try { await api('/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Đã thêm'); VIEWS.users(); } catch (er) { toast(er.message, 1); } };
  $$('[data-upw]').forEach((b) => (b.onclick = () => {
    openModal(`<div class="m-head"><h2>Đặt lại mật khẩu</h2><button class="m-close" data-close>×</button></div><form class="m-body form" id="rpw"><label>Mật khẩu mới<input name="password" type="password" minlength="6" required></label><button class="btn primary">Lưu</button></form>`, 'sm');
    $('#rpw').onsubmit = async (e) => { e.preventDefault(); try { await api('/users/' + b.dataset.upw, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); closeModal(); toast('Đã đổi mật khẩu'); } catch (er) { toast(er.message, 1); } };
  }));
  $$('[data-urole]').forEach((b) => (b.onclick = async () => { try { await api('/users/' + b.dataset.urole, { method: 'PUT', body: { role: b.dataset.role === 'admin' ? 'viewer' : 'admin' } }); VIEWS.users(); } catch (er) { toast(er.message, 1); } }));
  $$('[data-udel]').forEach((b) => (b.onclick = async () => { if (!confirm('Xoá tài khoản này?')) return; try { await api('/users/' + b.dataset.udel, { method: 'DELETE' }); VIEWS.users(); } catch (er) { toast(er.message, 1); } }));
};

/* ================= Hướng dẫn ================= */
VIEWS.guide = async () => {
  $('#view').innerHTML = `<h1 class="page">Hướng dẫn cài đặt</h1><div class="card"><div class="m-body guide">
    <h3>1. Thêm domain</h3><p>Vào mục <a href="#/domains">Domain</a> → nhập domain (vd <code>magiamgia.com</code>) → <b>Thêm domain</b>.</p>
    <h3>2. Dán mã nhúng</h3><p>Bấm <b>Mã nhúng</b>, sao chép đoạn <code>&lt;script&gt;</code> và dán vào header chung của website (WordPress: Appearance → Theme File Editor → header.php, hoặc plugin "Insert Headers and Footers").</p>
    <h3>3. Đánh dấu cửa hàng & ưu đãi</h3><p>Thêm <code>data-cp-store="slug"</code> vào trang cửa hàng và <code>data-cp-offer="id"</code> cho mỗi ưu đãi. Nếu URL trang cửa hàng có dạng <code>/store/insta360</code>, <code>/coupons/insta360</code>... thì không cần đánh dấu cửa hàng — hệ thống tự nhận.</p>
    <h3>4. Gắn tham số cho quảng cáo</h3><p>Trong Google Ads → Cài đặt tài khoản → <b>Hậu tố URL cuối cùng</b>: <code>utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={campaignid}&amp;utm_term={keyword}</code></p>
    <h3>5. Xem số liệu</h3><p>Mở <a href="#/performance">Hiệu quả cửa hàng</a>. Mục Domain sẽ báo <span class="status"><span class="dot on"></span>Đang nhận dữ liệu</span> khi mã đã chạy đúng.</p>
    <h3>Cách tính chỉ số</h3><ul>
      <li><b>Lượt vào</b>: số lần trang cửa hàng được mở. <b>Vào thẳng</b>: lượt vào từ bên ngoài website (không phải bấm từ trang khác trong site).</li>
      <li><b>Kênh</b>: Quảng cáo (có <code>gad_source</code>, <code>gclid</code>, <code>msclkid</code> hoặc <code>utm_medium=cpc</code>), Tìm kiếm tự nhiên (đến từ Google/Bing... không có tham số quảng cáo), Truy cập trực tiếp (không có nguồn), Khác (mạng xã hội, trang khác, email). Kênh được giữ nguyên trong cả phiên truy cập.</li>
      <li><b>Tỉ lệ bấm</b> = lượt vào có ít nhất 1 lần bấm / tổng lượt vào.</li>
      <li><b>Ưu đãi đang chạy</b>: số ưu đãi (<code>data-cp-offer</code>) xuất hiện trên trang trong 7 ngày gần nhất.</li>
      <li><b>Quốc gia</b>: lấy từ header Cloudflare (<code>CF-IPCountry</code>) hoặc thư viện geoip-lite nếu đã cài.</li></ul>
  </div></div>`;
};

boot();
