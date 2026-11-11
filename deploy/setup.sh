#!/usr/bin/env bash
# Cài Coupon Dashboard lên VPS Ubuntu/Debian.
# Dùng:  sudo bash setup.sh digitalpartners.online email@cua-ban.com
set -euo pipefail

DOMAIN="${1:?Thiếu domain. Vd: sudo bash setup.sh digitalpartners.online you@mail.com}"
EMAIL="${2:?Thiếu email (dùng cho chứng chỉ SSL Let's Encrypt)}"
APP_DIR=/opt/coupon-dashboard
DATA_DIR=/var/lib/coupon-dashboard
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
  name: 'coupon-dashboard', script: 'server.js', cwd: '$APP_DIR',
  env: { PORT: 3000, HOST: '127.0.0.1', DATA_DIR: '$DATA_DIR', DASH_TZ: 'Asia/Ho_Chi_Minh',
         ADMIN_USER: 'admin', ADMIN_PASS: '$ADMIN_PASS', NODE_NO_WARNINGS: '1' },
  max_memory_restart: '400M'
}]};
EOF
chmod 600 "$APP_DIR/ecosystem.config.cjs"

echo "==> Khởi động app bằng pm2"
pm2 delete coupon-dashboard >/dev/null 2>&1 || true
pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

echo "==> Cấu hình Nginx cho $DOMAIN"
cat > /etc/nginx/sites-available/coupon-dashboard <<EOF
server {
  listen 80;
  server_name $DOMAIN www.$DOMAIN;
  client_max_body_size 1m;
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
ln -sf /etc/nginx/sites-available/coupon-dashboard /etc/nginx/sites-enabled/coupon-dashboard
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
echo " Xem log:   pm2 logs coupon-dashboard"
echo " Cập nhật:  tải bản mới lên rồi chạy lại script này (dữ liệu được giữ nguyên)"
echo "================================================================"
