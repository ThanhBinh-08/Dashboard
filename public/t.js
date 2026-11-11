/* Coupon Dashboard tracker – nhúng: <script async src="https://DASHBOARD/t.js" data-site="SITE_KEY"></script> */
(function (w, d) {
  'use strict';
  var sc = d.currentScript || (function () { var s = d.querySelectorAll('script[data-site]'); return s[s.length - 1]; })();
  if (!sc || w.__cpTrackLoaded) return; w.__cpTrackLoaded = 1;
  var KEY = sc.getAttribute('data-site'); if (!KEY) return;
  var EP = sc.getAttribute('data-endpoint') || (sc.src.split('/').slice(0, 3).join('/') + '/api/collect');
  var EXTRA = sc.getAttribute('data-click') || '';
  var BASE = '[data-cp-click],[data-cp-copy],[data-cp-offer] a,[data-cp-offer] button,a[data-cp-offer],button[data-cp-offer]';
  var SEL = EXTRA ? BASE + ',' + EXTRA : BASE;

  function rid() { var a = ''; for (var i = 0; i < 3; i++) a += Math.random().toString(36).slice(2, 8); return a + Date.now().toString(36); }
  function store(t, k, v) { try { var s = w[t]; if (v === undefined) return s.getItem(k); s.setItem(k, v); } catch (e) { } return null; }
  function host(u) { var m = /^https?:\/\/([^\/?#:]+)/i.exec(u || ''); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }
  function txt(el, n) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n || 150) : ''; }
  function closest(el, s) { while (el && el.nodeType !== 1) el = el.parentNode; return el && el.closest ? el.closest(s) : null; }

  var vid = store('localStorage', 'cp_vid'); if (!vid) { vid = rid(); store('localStorage', 'cp_vid', vid); }
  var here = location.hostname.toLowerCase().replace(/^www\./, '');
  var ref = d.referrer || '';
  var internal = host(ref) === here;
  var land = null; try { land = JSON.parse(store('sessionStorage', 'cp_land') || 'null'); } catch (e) { }
  if (!internal || !land) { land = { u: location.href, r: internal ? '' : ref }; store('sessionStorage', 'cp_land', JSON.stringify(land)); }
  var VISIT = rid();

  function send(o) {
    o.k = KEY; o.v = VISIT; var b = JSON.stringify(o);
    try { if (navigator.sendBeacon && navigator.sendBeacon(EP, new Blob([b], { type: 'text/plain' }))) return; } catch (e) { }
    try { fetch(EP, { method: 'POST', body: b, keepalive: true, mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } }); }
    catch (e) { try { var x = new XMLHttpRequest(); x.open('POST', EP, true); x.setRequestHeader('Content-Type', 'text/plain'); x.send(b); } catch (e2) { } }
  }
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

  var sent = false;
  function pv() { if (sent) return; sent = true; send({ t: 'pv', u: location.href, r: ref, l: land, vid: vid, s: storeInfo(), o: allOffers() }); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', pv); else pv();

  var last = null, lastCopy = 0;
  function posOf(el) { var p = closest(el, '[data-cp-pos]'); if (p) return p.getAttribute('data-cp-pos'); return closest(el, '[data-cp-offer]') ? 'Danh sách ưu đãi' : 'Nút trên trang'; }
  function ev(t, offer, pos) {
    if (t === 'copy') { var n = Date.now(); if (n - lastCopy < 800) return; lastCopy = n; }
    send({ t: t, of: offer ? offer.id : '', ot: offer ? offer.title : '', ty: offer ? offer.type : '', p: pos || '' });
  }
  d.addEventListener('click', function (e) {
    var el = closest(e.target, SEL); if (!el) return;
    var o = offerOf(el); last = { o: o, p: posOf(el), t: Date.now() };
    ev('click', o, last.p);
    if (el.hasAttribute('data-cp-copy')) ev('copy', o, last.p);
  }, true);

  function onCopy(fromEl) {
    var o = fromEl ? offerOf(fromEl) : null, p = fromEl ? posOf(fromEl) : '';
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
    click: function (offerId, pos) { ev('click', offerId ? { id: String(offerId), title: '', type: '' } : null, pos || 'Nút trên trang'); },
    copy: function (offerId, pos) { ev('copy', offerId ? { id: String(offerId), title: '', type: 'code' } : null, pos || ''); }
  };
})(window, document);
