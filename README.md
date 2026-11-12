# Domain Manager

Quản lý **nhiều domain** trong một nơi:

- **Thống kê**: Bảng điều khiển, Hiệu quả cửa hàng (lượt vào, từ Ads, tỉ lệ bấm, lượt bấm, copy mã, quốc gia chính, ưu đãi đang chạy), chi tiết theo vị trí bấm / nguồn / quốc gia / chiến dịch & từ khoá / ưu đãi / thiết bị / ngày, trang Từ khoá (xuất CSV).
- **Dữ liệu chính** (riêng cho từng domain): Domain (nhóm, uptime, SSL, ngày hết hạn domain), Danh mục, Cửa hàng, Mã & ưu đãi, Sự kiện khuyến mãi. Import CSV có file mẫu.
- **Nội dung**: Trang tĩnh, Bài viết, Câu hỏi thường gặp, Mẫu nội dung (chèn nhanh với biến `{store}`, `{year}`...). Website đọc qua API công khai.
- **Hệ thống**: Nhân viên (Quản trị viên / Biên tập viên / Nhân viên chỉ xem), Lịch sử import, Hướng dẫn.

## Chạy

Yêu cầu: Node.js ≥ 22.13 (khuyên dùng 24). Không cần `npm install`.

```bash
npm start                      # http://localhost:3000
```

Lần chạy đầu tạo tài khoản `admin / admin123` → đăng nhập và **đổi mật khẩu ngay** (góc dưới sidebar).
Có thể đặt trước: `ADMIN_USER=... ADMIN_PASS=... npm start`.

Dữ liệu demo: `npm run demo` · xoá demo: `node seed-demo.js --remove`.

> Nâng cấp từ bản cũ (v1): lần chạy đầu tiên bảng dữ liệu cũ (domain, cửa hàng, thống kê) được tạo lại theo cấu trúc mới; tài khoản người dùng được giữ.

## Thêm domain mới

1. Mục **Domain** → nhập domain, nhóm → **Thêm domain** (hoặc **Nhập nhiều domain**).
2. Sao chép **Mã nhúng** và dán vào `<head>` của mọi trang:
   ```html
   <script async src="https://DASHBOARD-CUA-BAN/t.js" data-site="SITE_KEY"></script>
   ```
3. (Khuyên dùng) đánh dấu cửa hàng & ưu đãi trong theme:
   ```html
   <main data-cp-store="insta360" data-cp-store-name="Insta360" data-cp-store-url="https://insta360.com">
     <div data-cp-offer="insta360-5off" data-cp-type="code" data-cp-title="5% OFF with Code">
       <button>Lấy mã</button>
     </div>
     <a href="..." data-cp-click data-cp-pos="Nút trên trang">Đến cửa hàng</a>
   </main>
   ```
   Nếu không đánh dấu, cửa hàng được nhận theo đường dẫn của domain (mặc định `/store/{slug}`, đổi trong **Domain → Sửa**).
   `data-cp-offer` trùng với **Mã theo dõi** của ưu đãi trong mục Mã & ưu đãi.
4. Google Ads → Hậu tố URL cuối cùng: `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}`. Link có `gad_source` / `gclid` tự được tính là Quảng cáo.

Copy mã được ghi nhận tự động (`navigator.clipboard`, `execCommand('copy')`, Ctrl+C). Gọi thủ công: `CPTrack.click('offer-id')`, `CPTrack.copy('offer-id')`.

## API công khai (cho website)

Chỉ trả nội dung đã xuất bản / đang hiển thị, dạng JSON, có CORS:

```
GET /api/public/{SITE_KEY}/stores              ?category={slug}
GET /api/public/{SITE_KEY}/stores/{slug}       (kèm offers, faqs)
GET /api/public/{SITE_KEY}/offers              ?store={slug}
GET /api/public/{SITE_KEY}/categories
GET /api/public/{SITE_KEY}/events              /events/{slug}
GET /api/public/{SITE_KEY}/pages               /pages/{slug}
GET /api/public/{SITE_KEY}/posts               /posts/{slug}
GET /api/public/{SITE_KEY}/faqs                ?store={slug}
```

## Triển khai lên VPS

```bash
sudo bash deploy/setup.sh digitalpartners.online email@cua-ban.com
```

Script cài Node 24, pm2, Nginx, SSL; dữ liệu nằm ở `/var/lib/domain-manager`. Chạy lại script để cập nhật (dữ liệu giữ nguyên).

- **Quốc gia**: đặt sau Cloudflare (header `CF-IPCountry`) **hoặc** `npm install geoip-lite`.
- Biến môi trường: `PORT`, `HOST`, `DATA_DIR`, `DASH_TZ` (mặc định `Asia/Ho_Chi_Minh`), `MONITOR=0` (tắt kiểm tra uptime/SSL), `UPTIME_MINUTES` (mặc định 10).
- Sao lưu: copy file `dashboard.db` trong `DATA_DIR`.

## Cấu trúc

| File | Vai trò |
|---|---|
| `server.js` | HTTP server, đăng nhập & phân quyền, API, nhận dữ liệu theo dõi (`/api/collect`) |
| `db.js` | Cơ sở dữ liệu SQLite (có sẵn trong Node) |
| `stats.js` | Truy vấn thống kê |
| `resources.js` | CRUD dữ liệu & nội dung, import CSV, API công khai |
| `monitor.js` | Kiểm tra online, SSL, ngày hết hạn domain (RDAP) |
| `public/t.js` | Script nhúng vào các website |
| `public/app.js`, `index.html`, `style.css` | Giao diện |
| `seed-demo.js` | Tạo / xoá dữ liệu demo |
