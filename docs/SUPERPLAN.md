# SUPERPLAN — Domain Manager

Mục tiêu: **mọi cú bấm vào bất kỳ nút nào** trên domain đang theo dõi đều được ghi nhận, dữ liệu trả về **đầy đủ** (không bị cắt), và **không bao giờ mất** (deploy lại, nâng cấp, sự cố).

Trạng thái: `[x]` xong · `[ ]` chưa làm · `(cấu hình)` = việc làm trên Dokploy / Cloudflare / Google Ads, không phải code.

---

## Giai đoạn 1 — An toàn dữ liệu (không mất)

| # | Nhiệm vụ | Trạng thái |
|---|---|---|
| 1.1 | Bỏ `DROP TABLE` khi nâng cấp cấu trúc DB. Bảng cũ (nếu có) được **đổi tên** `*_legacy_<thời gian>` thay vì xoá | [x] |
| 1.2 | Cơ chế nâng cấp từng bước (migration): chỉ thêm bảng/cột, không bao giờ xoá dữ liệu | [x] |
| 1.3 | Sao lưu tự động hằng ngày bằng `VACUUM INTO` (an toàn khi DB đang chạy chế độ WAL), giữ `BACKUP_KEEP` bản (mặc định 14) trong `DATA_DIR/backups` | [x] |
| 1.4 | Trang **Sao lưu dữ liệu** (admin, trong menu avatar): xem danh sách, tạo bản sao lưu ngay, tải về | [x] |
| 1.5 | `GET /api/health` + `HEALTHCHECK` trong Dockerfile để Dokploy biết app còn sống | [x] |
| 1.6 | Ghi dữ liệu xuống đĩa an toàn khi tắt container (`SIGTERM` → checkpoint WAL → đóng DB) | [x] |
| 1.7 | (cấu hình) Dokploy → Advanced → **Volumes**: volume tên `domain-manager-data` gắn vào `/data` | [ ] |
| 1.8 | (cấu hình) Dokploy → Environment: `ADMIN_USER`, `ADMIN_PASS`, `DASH_TZ`, `BACKUP_KEEP` | [ ] |
| 1.9 | (cấu hình) Sao lưu ra ngoài VPS: tải bản sao lưu định kỳ hoặc dùng tính năng Backups của Dokploy cho volume | [ ] |

## Giai đoạn 2 — Ghi nhận mọi cú bấm

| # | Nhiệm vụ | Trạng thái |
|---|---|---|
| 2.1 | `t.js` bắt **mọi phần tử bấm được**: `a`, `button`, `input[type=submit/button/...]`, `[role=button/link/tab/menuitem]`, `summary`, `label`, `select`, `[onclick]`, `[data-cp-click]`, và phần tử có con trỏ hình bàn tay; cả **chuột giữa** (mở tab mới) | [x] |
| 2.2 | Mỗi cú bấm gửi kèm: **tên nút** (text / aria-label / title / value / alt), loại (`offer` ưu đãi · `outbound` link ra ngoài · `internal` link nội bộ · `button` nút), thẻ HTML, đích đến, vị trí | [x] |
| 2.3 | Mã lượt vào được tạo **ngay khi script tải**, nên các cú bấm sớm (trước khi trang tải xong) vẫn gắn được vào lượt vào | [x] |
| 2.4 | Server **không bỏ** cú bấm đến trước lượt vào (do mạng gửi lệch thứ tự): lưu tạm vào `pending_events`, gắn lại khi lượt vào tới | [x] |
| 2.5 | Hàng đợi gửi lại ở trình duyệt: gửi lỗi (mất mạng) thì lưu `localStorage`, gửi lại ở lần tải trang sau / khi có mạng | [x] |
| 2.6 | Nâng giới hạn chống spam từ 50 lên 300 cú bấm mỗi lượt vào | [x] |
| 2.7 | Chi tiết cửa hàng: bảng mới **Theo nút bấm** (tên nút, loại, lượt bấm, số lượt vào có bấm) | [x] |
| 2.8 | Bảng điều khiển: **Nút được bấm nhiều nhất** trên toàn domain (cả trang chủ, trang không phải cửa hàng) + xuất CSV toàn bộ | [x] |
| 2.9 | Endpoint trung tính chống trình chặn quảng cáo: script `/s.js`, nhận dữ liệu `/e` (đường cũ `/t.js`, `/api/collect` vẫn chạy) | [x] |

## Giai đoạn 3 — Dữ liệu đầy đủ (không bị cắt)

| # | Nhiệm vụ | Trạng thái |
|---|---|---|
| 3.1 | Chi tiết: bỏ giới hạn 30 từ khoá; nguồn / quốc gia / từ khoá / ưu đãi trả đủ (tối đa 5.000 dòng, bảng cuộn) | [x] |
| 3.2 | Trang Từ khoá: tối đa 100.000 dòng (trước 5.000) | [x] |
| 3.3 | Xuất CSV dữ liệu chính lấy **toàn bộ** (tự lấy từng trang), không còn dừng ở 1.000 dòng | [x] |
| 3.4 | Khoảng thời gian tuỳ chọn tối đa ~5 năm (trước 400 ngày) | [x] |
| 3.5 | **Tên chiến dịch**: đặt tên cho ID chiến dịch Google Ads (`{campaignid}`) ngay trong trang Từ khoá; mọi bảng hiện tên thay vì số | [x] |
| 3.6 | (cấu hình) Cloudflare: bật Proxy (đám mây cam) + **IP Geolocation** cho domain dashboard để có quốc gia | [ ] |
| 3.7 | (cấu hình) Google Ads → Hậu tố URL cuối cùng: `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}` | [ ] |
| 3.8 | (cấu hình) Website: dán mã nhúng mới (`/s.js`) vào header chung **mọi trang**; gắn `data-cp-store`, `data-cp-offer` | [ ] |

## Giai đoạn 4 — Cảnh báo

| # | Nhiệm vụ | Trạng thái |
|---|---|---|
| 4.1 | Gửi Telegram khi domain sập / sống lại, SSL < 14 ngày, domain < 30 ngày, domain ngừng nhận dữ liệu 24 giờ (chỉ gửi khi trạng thái **thay đổi**, không spam) | [x] |
| 4.2 | (cấu hình) Tạo bot với @BotFather → `TELEGRAM_BOT_TOKEN`, lấy `TELEGRAM_CHAT_ID`, đặt vào Environment | [ ] |

## Giai đoạn 5 — Trực quan

| # | Nhiệm vụ | Trạng thái |
|---|---|---|
| 5.1 | Biểu đồ đường Lượt vào / Lượt bấm / Copy mã theo ngày trên Bảng điều khiển | [x] |

## Để sau (chưa làm)

- Lọc theo thiết bị / trình duyệt trên các trang thống kê.
- Nhật ký thao tác (ai sửa / xoá gì).
- Khôi phục từ bản sao lưu ngay trên giao diện (hiện khôi phục bằng cách thay file — xem README).
- Kết nối Google Ads API để lấy chi phí, chuyển đổi.

---

## Kiểm tra sau khi deploy

1. `https://DASHBOARD/api/health` trả `{"ok":true,...}`.
2. Menu avatar → **Sao lưu dữ liệu** → **Tạo bản sao lưu ngay** → có file mới.
3. Thêm 1 cửa hàng thử → Redeploy trên Dokploy → cửa hàng **vẫn còn** (volume đúng).
4. Mở 1 trang trên website đã nhúng mã, bấm vài nút bất kỳ → Bảng điều khiển → **Nút được bấm nhiều nhất** có tên các nút vừa bấm.
5. Có quốc gia ở cột Quốc gia chính (Cloudflare đã bật Geolocation).
