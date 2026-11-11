# Coupon Dashboard – quản lý nhiều domain

Dashboard theo dõi hiệu quả cửa hàng (lượt vào, từ Ads, tỉ lệ bấm, copy mã, quốc gia, từ khoá, ưu đãi, thiết bị, theo ngày) cho **nhiều website coupon**.
Thêm domain mới → dán 1 dòng mã nhúng → xong.

## Chạy

Yêu cầu: Node.js ≥ 22.13 (khuyên dùng 24). Không cần `npm install`.

```bash
npm start                      # http://localhost:3000
```

Lần chạy đầu tạo tài khoản `admin / admin123` → đăng nhập và **đổi mật khẩu ngay** (nút "Đổi mật khẩu" ở góc dưới sidebar).
Có thể đặt trước: `ADMIN_USER=... ADMIN_PASS=... npm start`.

Dữ liệu demo để xem thử: `npm run demo` · xoá demo: `node seed-demo.js --remove`.

## Thêm domain mới

1. Mục **Domain** → nhập domain → **Thêm domain**.
2. Sao chép mã nhúng và dán vào `<head>` của mọi trang trên website đó:
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
   Nếu không đánh dấu, cửa hàng được nhận theo URL (`/store/{slug}`, `/coupons/{slug}`, `/cua-hang/{slug}`...). Mẫu URL đổi được trong **Domain → Sửa**.
4. Google Ads → Hậu tố URL cuối cùng: `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}`.

Copy mã được ghi nhận tự động (`navigator.clipboard`, `execCommand('copy')`, Ctrl+C). Gọi thủ công nếu cần: `CPTrack.click('offer-id')`, `CPTrack.copy('offer-id')`.

## Triển khai lên server

- Chạy sau Nginx/Caddy với **HTTPS** (bắt buộc, vì các site coupon dùng https sẽ chặn script từ http).
- **Quốc gia**: đặt dashboard sau Cloudflare (header `CF-IPCountry`) **hoặc** chạy `npm install geoip-lite` để tra theo IP.
- Biến môi trường: `PORT`, `DATA_DIR` (thư mục chứa `dashboard.db`), `DASH_TZ` (mặc định `Asia/Ho_Chi_Minh`).
- Chạy nền: `pm2 start server.js --name dashboard`.
- Sao lưu: copy file `data/dashboard.db`.

## Cấu trúc

| File | Vai trò |
|---|---|
| `server.js` | API, đăng nhập, nhận dữ liệu theo dõi (`/api/collect`) |
| `db.js` | Cơ sở dữ liệu SQLite (có sẵn trong Node) |
| `public/t.js` | Script nhúng vào các website |
| `public/app.js`, `index.html`, `style.css` | Giao diện dashboard |
| `seed-demo.js` | Tạo / xoá dữ liệu demo |
