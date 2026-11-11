// Tạo dữ liệu demo: node seed-demo.js   (xoá demo: node seed-demo.js --remove)
import crypto from 'node:crypto';
import { db, dayOf, tx } from './db.js';

const HOSTS = [['Demo Coupon UK', 'demo-coupon.co.uk'], ['Demo Deals US', 'demo-deals.com']];
if (process.argv.includes('--remove')) {
  for (const [, h] of HOSTS) db.prepare('DELETE FROM domains WHERE host=?').run(h);
  console.log('Đã xoá dữ liệu demo'); process.exit(0);
}

const STORES = [
  ['insta360', 'Insta360', 'https://insta360.com', 'insta360'], ['nike', 'Nike', 'https://nike.com', 'nike'], ['adidas', 'Adidas', 'https://adidas.com', 'adidas'],
  ['shein', 'Shein', 'https://shein.com', 'shein'], ['temu', 'Temu', 'https://temu.com', 'temu'], ['dji', 'DJI', 'https://dji.com', 'dji'],
  ['anker', 'Anker', 'https://anker.com', 'anker'], ['nordvpn', 'NordVPN', 'https://nordvpn.com', 'nordvpn'], ['samsung', 'Samsung', 'https://samsung.com', 'samsung'],
  ['lenovo', 'Lenovo', 'https://lenovo.com', 'lenovo'], ['asos', 'ASOS', 'https://asos.com', 'asos'], ['ugreen', 'UGREEN', 'https://ugreen.com', 'ugreen'],
];
const COUNTRIES = ['GB', 'GB', 'GB', 'US', 'US', 'US', 'DE', 'DE', 'CA', 'IN', 'IN', 'PH', 'ES', 'NL', 'BE', 'RO', 'PT', 'TR', 'PK', 'FR'];
const KW = (b) => [`${b} discount code`, `discount ${b}`, `${b} promo`, `${b} promo code`, `${b} coupon`, `coupon code for ${b}`, `${b} voucher`, `promo code for ${b}`];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (n) => Math.floor(Math.random() * n);

tx(() => {
  for (const [name, host] of HOSTS) {
    db.prepare('DELETE FROM domains WHERE host=?').run(host);
    const dom = Number(db.prepare('INSERT INTO domains(name,host,site_key,store_pattern,active,created_at) VALUES(?,?,?,?,1,?)')
      .run(name, host, crypto.randomBytes(9).toString('base64url'), '', Date.now()).lastInsertRowid);
    for (const [slug, sname, url, kw] of STORES) {
      if (Math.random() < 0.2) continue;
      const sid = Number(db.prepare('INSERT INTO stores(domain_id,slug,name,url,page_url,created_at) VALUES(?,?,?,?,?,?)')
        .run(dom, slug, sname, url, `https://${host}/store/${slug}`, Date.now()).lastInsertRowid);
      const offers = [[`${slug}-5off`, `${sname} Coupon: 5% OFF with Code`, 'code'], [`${slug}-10off`, `Apply This ${sname} Promo Code for 10% OFF`, 'code'], [`${slug}-ship`, `Free Shipping on Orders Over $50`, 'deal']].slice(0, 1 + rnd(3));
      for (const o of offers) db.prepare('INSERT INTO offers(store_id,okey,title,type,last_seen) VALUES(?,?,?,?,?)').run(sid, o[0], o[1], o[2], Date.now());
      const pop = 2 + rnd(25), quality = 0.05 + Math.random() * 0.6, mainC = pick(COUNTRIES);
      for (let day = 0; day < 45; day++) {
        const n = Math.max(0, Math.round(pop * (0.5 + Math.random())));
        for (let i = 0; i < n; i++) {
          const ts = Date.now() - day * 864e5 - rnd(864e5);
          const r = Math.random(); const channel = r < 0.6 ? 'ads' : r < 0.8 ? 'organic' : r < 0.92 ? 'direct' : 'other';
          const source = channel === 'ads' ? (Math.random() < 0.9 ? 'google' : 'bing') : channel === 'organic' ? 'google' : channel === 'direct' ? '(direct)' : pick(['facebook.com', 'reddit.com', 'newsletter']);
          const keyword = channel === 'ads' ? pick(KW(kw)) : '';
          const clicks = Math.random() < quality ? 1 + rnd(2) : 0, copies = clicks && Math.random() < 0.8 ? clicks : 0;
          const vid = crypto.randomBytes(8).toString('hex');
          db.prepare(`INSERT INTO visits(id,domain_id,store_id,visitor,ts,day,channel,source,medium,campaign,keyword,country,device,entry,clicks,copies,url,referrer)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(vid, dom, sid, vid, ts, dayOf(ts), channel, source, channel === 'ads' ? 'cpc' : '',
            channel === 'ads' ? pick(['2201345', '2201346']) : '', keyword, Math.random() < 0.5 ? mainC : pick(COUNTRIES), Math.random() < 0.7 ? 'mobile' : 'desktop',
            Math.random() < 0.85 ? 1 : 0, clicks, copies, `https://${host}/store/${slug}`, '');
          for (let c = 0; c < clicks; c++) {
            const o = pick(offers); const pos = Math.random() < 0.8 ? 'Danh sách ưu đãi' : 'Nút trên trang';
            db.prepare('INSERT INTO events(visit_id,store_id,ts,type,offer,position) VALUES(?,?,?,?,?,?)').run(vid, sid, ts + 5000, 'click', o[0], pos);
            if (c < copies) db.prepare('INSERT INTO events(visit_id,store_id,ts,type,offer,position) VALUES(?,?,?,?,?,?)').run(vid, sid, ts + 6000, 'copy', o[0], pos);
          }
        }
      }
    }
  }
});
console.log('Đã tạo dữ liệu demo cho:', HOSTS.map((h) => h[1]).join(', '), '\nXoá demo: node seed-demo.js --remove');
