/* Domain Manager tracker – nhúng: <script async src="https://DASHBOARD/s.js" data-site="SITE_KEY"></script>
   Ghi nhận: lượt xem trang, MỌI cú bấm vào phần tử bấm được (nút, link, tab, menu...), copy mã. */
(function (w, d) {
  'use strict';
  var sc = d.currentScript || (function () { var s = d.querySelectorAll('script[data-site]'); return s[s.length - 1]; })();
  if (!sc || w.__dmTrack) return; w.__dmTrack = 1;
  var KEY = sc.getAttribute('data-site'); if (!KEY) return;
  var ORIGIN = sc.src.split('/').slice(0, 3).join('/');
  var EP = sc.getAttribute('data-endpoint') || (ORIGIN + '/e');
  var EXTRA = sc.getAttribute('data-click') || '';
  // Mọi phần tử bấm được
  var CLICKABLE = 'a,button,summary,label,select,option,area,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=switch],[role=checkbox],[role=radio],'
    + 'input[type=button],input[type=submit],input[type=reset],input[type=image],input[type=checkbox],input[type=radio],input[type=file],'
    + '[onclick],[data-cp-click],[data-cp-copy],[data-cp-offer],[data-toggle],[data-bs-toggle],[tabindex]:not([tabindex="-1"])' + (EXTRA ? ',' + EXTRA : '');

  function rid() { var a = ''; for (var i = 0; i < 3; i++) a += Math.random().toString(36).slice(2, 8); return a + Date.now().toString(36); }
  function store(t, k, v) { try { var s = w[t]; if (v === undefined) return s.getItem(k); if (v === null) s.removeItem(k); else s.setItem(k, v); } catch (e) { } return null; }
  function host(u) { var m = /^https?:\/\/([^\/?#:]+)/i.exec(u || ''); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }
  function clean(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 150); }
  function txt(el, n) { return el ? clean(el.innerText || el.textContent, n) : ''; }
  function closest(el, s) { while (el && el.nodeType !== 1) el = el.parentNode; try { return el && el.closest ? el.closest(s) : null; } catch (e) { return null; } }

  var vid = store('localStorage', 'cp_vid'); if (!vid) { vid = rid(); store('localStorage', 'cp_vid', vid); }
  var here = location.hostname.toLowerCase().replace(/^www\./, '');
  // Mã lượt vào có ngay khi script tải: cú bấm sớm (trước khi trang tải xong) vẫn được gắn đúng lượt vào
  var VISIT = rid(), lastUrl = '', firstPv = true;

  // ----- gửi dữ liệu, có hàng đợi gửi lại khi mất mạng -----
  var QK = 'cp_q';
  function queue(b) { try { var q = JSON.parse(store('localStorage', QK) || '[]'); q.push(b); store('localStorage', QK, JSON.stringify(q.slice(-100))); } catch (e) { } }
  function post(b) {
    try { if (navigator.sendBeacon && navigator.sendBeacon(EP, new Blob([b], { type: 'text/plain' }))) return; } catch (e) { }
    try {
      fetch(EP, { method: 'POST', body: b, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } })['catch'](function () { queue(b); });
    } catch (e) {
      try { var x = new XMLHttpRequest(); x.open('POST', EP, true); x.setRequestHeader('Content-Type', 'text/plain'); x.onerror = function () { queue(b); }; x.send(b); } catch (e2) { queue(b); }
    }
  }
  function flush() {
    if (navigator.onLine === false) return;
    var q; try { q = JSON.parse(store('localStorage', QK) || '[]'); } catch (e) { q = []; }
    if (!q.length) return; store('localStorage', QK, null);
    for (var i = 0; i < q.length; i++) post(q[i]);
  }
  function send(o) {
    o.k = KEY; o.v = o.v || VISIT; var b = JSON.stringify(o);
    if (navigator.onLine === false) return queue(b);
    post(b);
  }
  w.addEventListener('online', flush);

  function meta(n) { var x = d.querySelector('meta[name="' + n + '"]'); return x ? x.getAttribute('content') || '' : ''; }
  function storeInfo() {
    var el = d.querySelector('[data-cp-store]');
    return {
      slug: (el && el.getAttribute('data-cp-store')) || meta('cp:store'),
      name: (el && el.getAttribute('data-cp-store-name')) || meta('cp:store-name') || txt(d.querySelector('h1'), 80),
      url: (el && el.getAttribute('data-cp-store-url')) || meta('cp:store-url')
    };
  }
  function offerOf(el) {
    var o = closest(el, '[data-cp-offer]'); if (!o) return null;
    return {
      id: o.getAttribute('data-cp-offer') || '',
      title: o.getAttribute('data-cp-title') || txt(o.querySelector('h2,h3,h4,[class*=title]') || o, 150),
      type: o.getAttribute('data-cp-type') || (o.hasAttribute('data-cp-code') ? 'code' : '')
    };
  }
  function allOffers() { var r = [], l = d.querySelectorAll('[data-cp-offer]'); for (var i = 0; i < l.length && i < 100; i++) { var o = offerOf(l[i]); if (o && o.id) r.push(o); } return r; }

  // ----- lượt xem trang (hỗ trợ cả website dạng SPA) -----
  function pv(ref) {
    if (location.href === lastUrl) return; lastUrl = location.href;
    if (!firstPv) VISIT = rid(); firstPv = false;
    var internal = host(ref) === here;
    var land = null; try { land = JSON.parse(store('sessionStorage', 'cp_land') || 'null'); } catch (e) { }
    if (!internal || !land) { land = { u: location.href, r: internal ? '' : ref }; store('sessionStorage', 'cp_land', JSON.stringify(land)); }
    send({ t: 'pv', u: location.href, r: ref, l: land, vid: vid, s: storeInfo(), o: allOffers() });
  }
  function start() { pv(d.referrer || ''); setTimeout(flush, 1500); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
  function spa() { var prev = lastUrl; setTimeout(function () { if (location.href !== prev) pv(prev); }, 300); }
  try {
    var ps = history.pushState; history.pushState = function () { var r = ps.apply(this, arguments); spa(); return r; };
    var rs = history.replaceState; history.replaceState = function () { var r = rs.apply(this, arguments); spa(); return r; };
    w.addEventListener('popstate', spa);
  } catch (e) { }

  // ----- MỌI cú bấm -----
  var last = null, lastCopy = 0, lastClickEl = null, lastClickT = 0;
  function findClickable(t) {
    var el = closest(t, CLICKABLE);
    if (el) return el;
    // phần tử tự làm nút bằng JS (div/span có con trỏ hình bàn tay)
    for (var x = t, i = 0; x && x.nodeType === 1 && i < 6 && x !== d.body; x = x.parentNode, i++) {
      try { if (w.getComputedStyle(x).cursor === 'pointer') return x; } catch (e) { return null; }
    }
    return null;
  }
  function labelOf(el) {
    var l = el.getAttribute('data-cp-label') || el.getAttribute('aria-label') || '';
    if (!l && el.tagName === 'INPUT') l = el.value || el.getAttribute('name') || el.type;
    if (!l && el.tagName === 'SELECT') l = el.getAttribute('name') || el.id || 'select';
    if (!l) l = txt(el, 120);
    if (!l) l = el.getAttribute('title') || '';
    if (!l) { var img = el.querySelector && el.querySelector('img[alt],svg title'); if (img) l = img.getAttribute ? (img.getAttribute('alt') || txt(img)) : ''; }
    if (!l) l = el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : el.tagName.toLowerCase());
    return clean(l, 120);
  }
  function posOf(el) {
    var p = closest(el, '[data-cp-pos]'); if (p) return p.getAttribute('data-cp-pos');
    if (closest(el, '[data-cp-offer]')) return 'Danh sách ưu đãi';
    if (closest(el, 'header,nav,[role=navigation]')) return 'Menu / đầu trang';
    if (closest(el, 'footer')) return 'Chân trang';
    if (el.tagName === 'A' && host(el.href) && host(el.href) !== here) return 'Link ra ngoài';
    if (closest(el, 'aside')) return 'Cột bên';
    return 'Nút trên trang';
  }
  function ev(t, offer, pos, extra) {
    if (t === 'copy') { var n = Date.now(); if (n - lastCopy < 800) return; lastCopy = n; }
    var o = { t: t, of: offer ? offer.id : '', ot: offer ? offer.title : '', ty: offer ? offer.type : '', p: pos || '', pg: clean(location.pathname, 300) };
    if (extra) for (var k in extra) o[k] = extra[k];
    send(o);
  }
  function onClick(e) {
    if (e.type === 'auxclick' && e.button !== 1) return; // chỉ chuột giữa (mở tab mới)
    var t = (e.composedPath && e.composedPath()[0]) || e.target;
    var el = findClickable(t); if (!el || closest(el, '[data-cp-ignore]')) return;
    var now = Date.now();
    if (el === lastClickEl && now - lastClickT < 400) return; // bỏ cú bấm lặp do label->input
    var lab = closest(t, 'label'); if (lab && el !== lab && now - lastClickT < 400 && lastClickEl === lab) return;
    lastClickEl = el; lastClickT = now;
    var o = offerOf(el);
    var a = closest(el, 'a[href]');
    var href = a ? a.href : '';
    var outbound = !!(href && host(href) && host(href) !== here && /^https?:/i.test(href));
    var kind = o ? 'offer' : outbound ? 'outbound' : (a && /^https?:/i.test(href)) ? 'internal' : 'button';
    var target = outbound ? host(href) : (a && href ? clean(href.replace(/^https?:\/\/[^\/]+/i, ''), 200) : '');
    last = { o: o, p: posOf(el), t: now };
    ev('click', o, last.p, { kd: kind, lb: labelOf(el), tag: el.tagName.toLowerCase(), tg: target });
    if (el.hasAttribute('data-cp-copy')) ev('copy', o, last.p);
  }
  d.addEventListener('click', onClick, true);
  d.addEventListener('auxclick', onClick, true);

  // ----- copy mã -----
  function onCopy(fromEl) {
    var o = fromEl ? offerOf(fromEl) : null, p = fromEl && closest(fromEl, '*') ? posOf(closest(fromEl, '*')) : '';
    if (!o && last && Date.now() - last.t < 15000) { o = last.o; p = last.p; }
    ev('copy', o, p);
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      var ow = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = function () { onCopy(); return ow.apply(null, arguments); };
    }
  } catch (e) { }
  try {
    var oe = d.execCommand;
    d.execCommand = function (c) { if (String(c).toLowerCase() === 'copy') onCopy(); return oe.apply(d, arguments); };
  } catch (e) { }
  d.addEventListener('copy', function () { var s = w.getSelection && w.getSelection(); onCopy(s && s.anchorNode); });

  w.CPTrack = {
    click: function (offerId, pos, label) { ev('click', offerId ? { id: String(offerId), title: '', type: '' } : null, pos || 'Nút trên trang', { kd: offerId ? 'offer' : 'button', lb: clean(label || '', 120) }); },
    copy: function (offerId, pos) { ev('copy', offerId ? { id: String(offerId), title: '', type: 'code' } : null, pos || ''); }
  };
})(window, document);
