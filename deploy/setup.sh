#!/usr/bin/env bash
# Cài Domain Manager lên VPS Ubuntu/Debian.
# Dùng:  sudo bash setup.sh digitalpartners.online email@cua-ban.com
set -euo pipefail

DOMAIN="${1:?Thiếu domain. Vd: sudo bash setup.sh digitalpartners.online you@mail.com}"
EMAIL="${2:?Thiếu email (dùng cho chứng chỉ SSL miễn phí Letsencrypt)}"
APP_DIR=/opt/domain-manager
DATA_DIR=/var/lib/domain-manager
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Cài gói hệ thống"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates nginx certbot python3-certbot-nginx rsync

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "==> Cài Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2

# Chuyển dữ liệu từ bản cài cũ (tên cũ coupon-dashboard) nếu có
if [ -d /var/lib/coupon-dashboard ] && [ ! -f "$DATA_DIR/dashboard.db" ]; then
  echo "==> Chuyển dữ liệu từ bản cài cũ"
  pm2 delete coupon-dashboard >/dev/null 2>&1 || true
  mkdir -p "$DATA_DIR" && cp -a /var/lib/coupon-dashboard/. "$DATA_DIR"/
  rm -f /etc/nginx/sites-enabled/coupon-dashboard /etc/nginx/sites-available/coupon-dashboard
fi

echo "==> Chép mã nguồn vào $APP_DIR"
mkdir -p "$APP_DIR" "$DATA_DIR"
rsync -a --delete --exclude data --exclude node_modules --exclude img "$SRC_DIR"/ "$APP_DIR"/

FIRST_RUN=0
if [ ! -f "$DATA_DIR/dashboard.db" ]; then
  FIRST_RUN=1
  ADMIN_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 14)"
else
  ADMIN_PASS="(giữ nguyên mật khẩu cũ)"
fi

cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = { apps: [{
  name: 'domain-manager', script: 'server.js', cwd: '$APP_DIR',
  env: { PORT: 3000, HOST: '127.0.0.1', DATA_DIR: '$DATA_DIR', DASH_TZ: 'Asia/Ho_Chi_Minh',
         ADMIN_USER: 'admin', ADMIN_PASS: '$ADMIN_PASS', NODE_NO_WARNINGS: '1' },
  max_memory_restart: '400M'
}]};
EOF
chmod 600 "$APP_DIR/ecosystem.config.cjs"

echo "==> Khởi động app bằng pm2"
pm2 delete domain-manager >/dev/null 2>&1 || true
pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

echo "==> Cấu hình Nginx cho $DOMAIN"
cat > /etc/nginx/sites-available/domain-manager <<EOF
server {
  listen 80;
  server_name $DOMAIN www.$DOMAIN;
  client_max_body_size 6m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$http_cf_connecting_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 60s;
  }
}
EOF
ln -sf /etc/nginx/sites-available/domain-manager /etc/nginx/sites-enabled/domain-manager
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 'Nginx Full' || true; fi

echo "==> Lấy chứng chỉ SSL"
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect; then
  echo "SSL OK"
else
  echo "!! Chưa lấy được SSL. Kiểm tra bản ghi DNS A trỏ về IP VPS rồi chạy lại:"
  echo "   certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos --redirect"
fi

echo
echo "================================================================"
echo " Xong! Mở: https://$DOMAIN"
if [ "$FIRST_RUN" = 1 ]; then
  echo " Tài khoản: admin   Mật khẩu: $ADMIN_PASS"
  echo " (Hãy lưu lại và đổi mật khẩu sau khi đăng nhập)"
fi
echo " Xem log:   pm2 logs domain-manager"
echo " Cập nhật:  tải bản mới lên rồi chạy lại script này (dữ liệu được giữ nguyên)"
echo "================================================================"
