// Tạo dữ liệu demo: node seed-demo.js   (xoá demo: node seed-demo.js --remove)
import crypto from 'node:crypto';
import { db, dayOf, tx, addDays, todayStr } from './db.js';

const HOSTS = [['Demo Site UK', 'demo-site-uk.com', 'UK'], ['Demo Site US', 'demo-site-us.com', 'US']];
if (process.argv.includes('--remove')) {
  for (const [, h] of HOSTS) db.prepare('DELETE FROM domains WHERE host=?').run(h);
  console.log('Đã xoá dữ liệu demo'); process.exit(0);
}

const CATS = [['Điện tử', 'dien-tu'], ['Thời trang', 'thoi-trang'], ['Phần mềm', 'phan-mem']];
const STORES = [
  ['insta360', 'Insta360', 'https://insta360.com', 0], ['nike', 'Nike', 'https://nike.com', 1], ['adidas', 'Adidas', 'https://adidas.com', 1],
  ['shein', 'Shein', 'https://shein.com', 1], ['temu', 'Temu', 'https://temu.com', 1], ['dji', 'DJI', 'https://dji.com', 0],
  ['anker', 'Anker', 'https://anker.com', 0], ['nordvpn', 'NordVPN', 'https://nordvpn.com', 2], ['samsung', 'Samsung', 'https://samsung.com', 0],
  ['lenovo', 'Lenovo', 'https://lenovo.com', 0], ['asos', 'ASOS', 'https://asos.com', 1], ['ugreen', 'UGREEN', 'https://ugreen.com', 0],
];
const COUNTRIES = ['GB', 'GB', 'GB', 'US', 'US', 'US', 'DE', 'DE', 'CA', 'IN', 'IN', 'PH', 'ES', 'NL', 'BE', 'RO', 'PT', 'TR', 'PK', 'FR'];
const KW = (b) => [`${b} discount code`, `discount ${b}`, `${b} promo`, `${b} promo code`, `${b} coupon`, `coupon code for ${b}`, `${b} voucher`, `promo code for ${b}`];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (n) => Math.floor(Math.random() * n);
const now = Date.now(), t = todayStr();

const ins = (table, o) => { const k = Object.keys(o); return Number(db.prepare(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(() => '?').join(',')})`).run(...k.map((x) => o[x])).lastInsertRowid); };
const visitQ = db.prepare(`INSERT INTO visits(id,domain_id,store_id,visitor,ts,day,path,channel,source,medium,campaign,keyword,country,device,browser,os,entry,clicks,copies,referrer)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const evQ = db.prepare('INSERT INTO events(visit_id,domain_id,store_id,ts,type,offer,position,target) VALUES(?,?,?,?,?,?,?,?)');

tx(() => {
  for (const [name, host, group] of HOSTS) {
    db.prepare('DELETE FROM domains WHERE host=?').run(host);
    const dom = ins('domains', { name, host, site_key: crypto.randomBytes(9).toString('base64url'), store_path: '/store/{slug}', category: group, note: 'Dữ liệu demo', active: 1, created_at: now });
    const cats = CATS.map(([n, s], i) => ins('categories', { domain_id: dom, name: n, slug: s, sort: i, created_at: now, updated_at: now }));
    const bf = ins('promo_events', { domain_id: dom, name: 'Black Friday 2026', slug: 'black-friday-2026', starts: addDays(t, -3), ends: addDays(t, 20), status: 'active', created_at: now, updated_at: now });
    ins('promo_events', { domain_id: dom, name: 'Giáng sinh 2026', slug: 'giang-sinh-2026', starts: addDays(t, 30), ends: addDays(t, 45), status: 'active', created_at: now, updated_at: now });
    ins('pages', { domain_id: dom, title: 'Giới thiệu', slug: 'about-us', content: `<p>${name} tổng hợp mã giảm giá mới nhất.</p>`, status: 'published', created_at: now, updated_at: now });
    ins('pages', { domain_id: dom, title: 'Chính sách bảo mật', slug: 'privacy-policy', content: '<p>...</p>', status: 'published', created_at: now, updated_at: now });
    ins('templates', { domain_id: dom, name: 'Mô tả cửa hàng chuẩn', type: 'store', content: 'Tổng hợp mã giảm giá {store} mới nhất tháng {month}/{year}, được kiểm tra hằng ngày trên {site}.', created_at: now, updated_at: now });
    ins('templates', { domain_id: dom, name: 'Mô tả mã giảm giá', type: 'offer', content: 'Dùng mã {code} để được giảm {discount} khi mua tại {store}.', created_at: now, updated_at: now });
    ins('faqs', { domain_id: dom, question: 'Mã giảm giá có miễn phí không?', answer: 'Có, mọi mã trên website đều miễn phí.', sort: 0, status: 'published', created_at: now, updated_at: now });
    for (const [slug, sname, url, ci] of STORES) {
      if (Math.random() < 0.2) continue;
      const sid = ins('stores', { domain_id: dom, slug, name: sname, url, category_id: cats[ci], description: `Mã giảm giá ${sname} mới nhất.`, status: 'active', page_url: `https://${host}/store/${slug}`, source: 'manual', created_at: now, updated_at: now });
      const offers = [[`${slug}-5off`, `${sname} Coupon: 5% OFF with Code`, 'code', 'SAVE5', '5%'], [`${slug}-10off`, `Apply This ${sname} Promo Code for 10% OFF`, 'code', 'TAKE10', '10%'], [`${slug}-ship`, 'Free Shipping on Orders Over $50', 'deal', '', 'Free ship']].slice(0, 1 + rnd(3));
      offers.forEach((o, i) => ins('offers', { domain_id: dom, store_id: sid, okey: o[0], title: o[1], type: o[2], code: o[3], discount: o[4], expires: addDays(t, 10 + rnd(60)), event_id: i === 0 ? bf : null, verified: 1, status: 'active', source: 'manual', last_seen: now, created_at: now, updated_at: now }));
      ins('faqs', { domain_id: dom, store_id: sid, question: `Làm sao dùng mã ${sname}?`, answer: 'Copy mã, mở trang cửa hàng và dán ở bước thanh toán.', sort: 0, status: 'published', created_at: now, updated_at: now });
      if (Math.random() < 0.4) ins('posts', { domain_id: dom, title: `Cách tiết kiệm khi mua ${sname}`, slug: `tiet-kiem-${slug}`, excerpt: `Mẹo săn ưu đãi ${sname}.`, content: '<p>...</p>', category_id: cats[ci], store_id: sid, status: 'published', published_at: addDays(t, -rnd(30)), created_at: now, updated_at: now });
      const pop = 2 + rnd(25), quality = 0.05 + Math.random() * 0.6, mainC = pick(COUNTRIES);
      for (let day = 0; day < 45; day++) {
        const n = Math.max(0, Math.round(pop * (0.5 + Math.random())));
        for (let i = 0; i < n; i++) {
          const ts = now - day * 864e5 - rnd(864e5);
          const r = Math.random(); const channel = r < 0.6 ? 'ads' : r < 0.8 ? 'organic' : r < 0.92 ? 'direct' : 'other';
          const source = channel === 'ads' ? (Math.random() < 0.9 ? 'google' : 'bing') : channel === 'organic' ? 'google' : channel === 'direct' ? '(direct)' : pick(['facebook.com', 'reddit.com', 'newsletter']);
          const clicks = Math.random() < quality ? 1 + rnd(2) : 0, copies = clicks && Math.random() < 0.8 ? clicks : 0;
          const vid = crypto.randomBytes(8).toString('hex'), mobile = Math.random() < 0.7;
          visitQ.run(vid, dom, sid, vid, ts, dayOf(ts), `/store/${slug}`, channel, source, channel === 'ads' ? 'cpc' : '', channel === 'ads' ? pick(['2201345', '2201346']) : '',
            channel === 'ads' ? pick(KW(slug)) : '', Math.random() < 0.5 ? mainC : pick(COUNTRIES), mobile ? 'mobile' : 'desktop', mobile ? 'Safari' : 'Chrome', mobile ? 'iOS' : 'Windows',
            Math.random() < 0.85 ? 1 : 0, clicks, copies, '');
          for (let c = 0; c < clicks; c++) {
            const o = pick(offers); const pos = Math.random() < 0.8 ? 'Danh sách ưu đãi' : 'Nút trên trang';
            evQ.run(vid, dom, sid, ts + 5000, 'click', o[0], pos, '');
            if (c < copies) evQ.run(vid, dom, sid, ts + 6000, 'copy', o[0], pos, '');
          }
        }
      }
    }
  }
});
console.log('Đã tạo dữ liệu demo cho:', HOSTS.map((h) => h[1]).join(', '), '\nXoá demo: node seed-demo.js --remove');
