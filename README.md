# Domain Manager

Quản lý **nhiều domain** trong một nơi:

- **Thống kê**: Bảng điều khiển, Hiệu quả cửa hàng (lượt vào, từ Ads, tỉ lệ bấm, lượt bấm, copy mã, quốc gia chính, ưu đãi đang chạy), chi tiết theo vị trí bấm / nguồn / quốc gia / chiến dịch & từ khoá / ưu đãi / thiết bị / ngày, trang Từ khoá (xuất CSV).
- **Dữ liệu chính** (riêng cho từng domain): Domain (nhóm, uptime, SSL, ngày hết hạn domain), Danh mục, Cửa hàng, Mã & ưu đãi, Sự kiện khuyến mãi. Import CSV có file mẫu.
- **Nội dung**: Trang tĩnh, Bài viết, Câu hỏi thường gặp, Mẫu nội dung (chèn nhanh với biến `{store}`, `{year}`...). Website đọc qua API công khai.
- **Hệ thống**: Nhân viên (Quản trị viên / Biên tập viên / Nhân viên chỉ xem), Lịch sử import. Domain và Hướng dẫn nằm ở thanh trên cùng (nút quả địa cầu / menu avatar).

## Chạy

Yêu cầu: Node.js ≥ 22.13 (khuyên dùng 24). Không cần `npm install`.

```bash
npm start                      # http://localhost:3000
```

Lần chạy đầu tạo tài khoản `admin / admin123` → đăng nhập và **đổi mật khẩu ngay** (bấm avatar góc trên bên phải → Đổi mật khẩu).
Có thể đặt trước: `ADMIN_USER=... ADMIN_PASS=... npm start`.

Dữ liệu demo: `npm run demo` · xoá demo: `node seed-demo.js --remove`.

> Nâng cấp từ bản cũ (v1): lần chạy đầu tiên bảng dữ liệu cũ (domain, cửa hàng, thống kê) được tạo lại theo cấu trúc mới; tài khoản người dùng được giữ.

## Thêm domain mới

1. Mục **Domain** (nút quả địa cầu cạnh ô chọn domain, hoặc menu avatar) → nhập domain, nhóm → **Thêm domain** (hoặc **Nhập nhiều domain**).
2. Sao chép **Mã nhúng** và dán vào `<head>` của mọi trang:
   ```html
   <script async src="https://DASHBOARD-CUA-BAN/s.js" data-site="SITE_KEY"></script>
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

## Ghi nhận mọi cú bấm

Mã nhúng gửi về **mọi cú bấm** vào phần tử bấm được (nút, link, tab, menu, input submit, label, phần tử có con trỏ bàn tay…), kể cả chuột giữa. Mỗi cú bấm có tên nút (chữ trên nút / `aria-label` / `title`), loại (Ưu đãi, Link ra ngoài, Link nội bộ, Nút), trang và vị trí.
- Đặt tên riêng: `data-cp-label="Tên"`. Bỏ qua một vùng: `data-cp-ignore`.
- Cú bấm đến trước lượt vào (mạng lệch thứ tự) được giữ tạm và gắn lại; mất mạng thì trình duyệt lưu lại và gửi lần sau.
- Xem ở **Bảng điều khiển → Nút được bấm nhiều nhất** (xuất CSV toàn bộ) và **Chi tiết cửa hàng → Theo nút bấm**.
- Mã nhúng cũ (`/t.js`, `/api/collect`) vẫn chạy; nên đổi sang `/s.js` (ít bị trình chặn quảng cáo chặn hơn).

## Thiết bị

Trang **Thiết bị**: lượt vào / tỉ lệ bấm / copy mã theo điện thoại, máy tính, máy tính bảng; hệ điều hành; trình duyệt; tổ hợp thiết bị × HĐH × trình duyệt; thiết bị × kênh; biểu đồ theo ngày; so sánh từng cửa hàng; 100 lượt vào gần nhất. Ô **Thiết bị** trên thanh lọc áp dụng cho mọi trang thống kê và chi tiết cửa hàng.

## IP truy cập & Click tặc

Trang **IP truy cập**: mỗi IP đến từ đâu (quốc gia, vùng, thành phố), số lượt vào, lượt từ quảng cáo, lượt bấm và **vị trí bấm nhiều nhất**. Bấm một IP để xem mọi vị trí đã bấm, nguồn truy cập, thiết bị, nhật ký từng cú bấm và các lượt vào. Xuất CSV được.

- **Click tặc**: một IP bấm **cùng một vị trí** (cùng domain + trang + nút) từ `FRAUD_CLICKS` lần (mặc định 10) trong `FRAUD_MINUTES` phút (mặc định 10) sẽ tự bị đánh dấu, kể cả khi tải lại trang nhiều lần. Có cảnh báo Telegram nếu đã cấu hình.
- Admin / biên tập viên đánh dấu tay **Click tặc** hoặc **An toàn** (IP an toàn không bị tự đánh dấu nữa), hoặc bỏ đánh dấu để hệ thống xét lại.
- IP lấy từ header `CF-Connecting-IP` / `X-Forwarded-For`. Quốc gia từ `CF-IPCountry`; thành phố / vùng cần bật Cloudflare **Rules → Transform Rules → Managed Transforms → Add visitor location headers** (hoặc dùng geoip-lite).
- Chỉ lượt vào từ bản này trở đi mới có IP; dữ liệu cũ không có.

## Kế hoạch từ khoá (giống Keyword Planner)

Trang **Kế hoạch từ khoá**: *Tìm từ khoá mới* (từ khoá gốc / URL) và *Kiểm tra lượng tìm kiếm* (danh sách tới 2.000 từ; mở nhanh từ trang Từ khoá hoặc Chi tiết cửa hàng). Mỗi dòng có thêm lượt vào / tỉ lệ bấm / copy mã của chính bạn. Kết quả lưu đệm 24 giờ.

- Chưa cấu hình: dùng gợi ý tìm kiếm Google (không có lượng tìm kiếm).
- Có cấu hình Google Ads API: lượng tìm TB/tháng, xu hướng 12 tháng, thay đổi 3 tháng / năm, cạnh tranh, giá thầu đầu trang. Biến môi trường:
  `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` (scope `adwords`), `GOOGLE_ADS_CUSTOMER_ID`, tuỳ chọn `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (MCC), `GOOGLE_ADS_CURRENCY`, `GOOGLE_ADS_API_VERSION` (mặc định `v26`), `KW_CACHE_HOURS`.

## Không mất dữ liệu

- **Dokploy / Docker**: dữ liệu nằm ở `/data`. Bắt buộc gắn **Volume** (Advanced → Volumes: tên `domain-manager-data`, mount path `/data`), nếu không mỗi lần deploy lại sẽ mất dữ liệu.
- Nâng cấp phiên bản **không bao giờ xoá dữ liệu** (chỉ thêm bảng / cột).
- **Sao lưu tự động** mỗi ngày vào `/data/backups` (giữ `BACKUP_KEEP` bản, mặc định 14). Admin: menu avatar → **Sao lưu dữ liệu** để tạo ngay / tải về. Nên tải về định kỳ hoặc bật Backups của Dokploy.
- Khôi phục: dừng app → thay `/data/dashboard.db` bằng file sao lưu (xoá `dashboard.db-wal`, `dashboard.db-shm`) → khởi động lại.
- `GET /api/health` để kiểm tra app (Dockerfile có sẵn HEALTHCHECK).

## Cảnh báo Telegram

Tạo bot với @BotFather, lấy token; nhắn cho bot rồi lấy chat id (vd qua `https://api.telegram.org/bot<TOKEN>/getUpdates`). Đặt `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` (nhiều chat cách nhau dấu phẩy). Báo khi domain sập / sống lại, SSL < 14 ngày, domain < 30 ngày, ngừng nhận dữ liệu 24 giờ — chỉ khi trạng thái thay đổi. Gửi thử ở trang Sao lưu dữ liệu.

## Triển khai lên VPS

```bash
sudo bash deploy/setup.sh digitalpartners.online email@cua-ban.com
```

Script cài Node 24, pm2, Nginx, SSL; dữ liệu nằm ở `/var/lib/domain-manager`. Chạy lại script để cập nhật (dữ liệu giữ nguyên).

- **Quốc gia**: đặt sau Cloudflare (header `CF-IPCountry`) **hoặc** `npm install geoip-lite`.
- Biến môi trường: `PORT`, `HOST`, `DATA_DIR`, `DASH_TZ` (mặc định `Asia/Ho_Chi_Minh`), `MONITOR=0` (tắt kiểm tra uptime/SSL), `UPTIME_MINUTES` (mặc định 10), `BACKUP_KEEP` (mặc định 14), `BACKUP=0` (tắt sao lưu tự động), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_USER`, `ADMIN_PASS` (chỉ dùng lần chạy đầu).
- Sao lưu: xem mục **Không mất dữ liệu** ở trên (đừng copy riêng `dashboard.db` khi app đang chạy — dùng bản trong `backups/`).

## Cấu trúc

| File | Vai trò |
|---|---|
| `server.js` | HTTP server, đăng nhập & phân quyền, API, nhận dữ liệu theo dõi (`/api/collect`) |
| `db.js` | Cơ sở dữ liệu SQLite (có sẵn trong Node) |
| `stats.js` | Truy vấn thống kê |
| `resources.js` | CRUD dữ liệu & nội dung, import CSV, API công khai |
| `monitor.js` | Kiểm tra online, SSL, ngày hết hạn domain (RDAP) |
| `public/t.js` | Script nhúng vào các website (phục vụ ở `/s.js` và `/t.js`) |
| `backup.js` | Sao lưu tự động |
| `alerts.js` | Cảnh báo Telegram |
| `docs/SUPERPLAN.md` | Kế hoạch tổng, trạng thái từng nhiệm vụ |
| `public/app.js`, `index.html`, `style.css` | Giao diện |
| `seed-demo.js` | Tạo / xoá dữ liệu demo |
