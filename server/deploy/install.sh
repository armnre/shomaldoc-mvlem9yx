#!/usr/bin/env bash
# نصب/به‌روزرسانی یک‌مرحله‌ای شمال‌داک روی Ubuntu 24.04 + Plesk
# اجرا (با root):  sudo bash install.sh
# متغیرهای قابل تغییر: DOMAIN, PORT, REPO, BRANCH, DB_PASS
set -euo pipefail
DOMAIN="${DOMAIN:-shomaldoc.shomal.ac.ir}"
PORT="${PORT:-3080}"
REPO="${REPO:-https://github.com/armnre/shomaldoc-mvlem9yx.git}"
BRANCH="${BRANCH:-main}"
APP=/opt/shomaldoc
DATA=/var/lib/shomaldoc
log(){ echo -e "\n\033[1;34m==> $*\033[0m"; }
[ "$(id -u)" = 0 ] || { echo "با sudo اجرا کنید"; exit 1; }

log "پیش‌نیازها (Node 22, git, Chrome)"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v google-chrome-stable >/dev/null; then
  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y /tmp/chrome.deb || echo "⚠ نصب Chrome ناموفق بود؛ خروجی PDF تا نصب آن کار نمی‌کند."
fi

log "کاربر سیستمی و پوشه‌ها"
id shomaldoc >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin shomaldoc
mkdir -p "$APP" "$DATA/uploads" /var/backups/shomaldoc
chown -R shomaldoc: "$APP" "$DATA" /var/backups/shomaldoc

log "دریافت کد از گیت‌هاب ($BRANCH)"
if [ -d "$APP/.git" ]; then
  # Never discard local server changes: stop if the tree is dirty, and only fast-forward.
  if [ -n "$(sudo -u shomaldoc git -C "$APP" status --porcelain --untracked-files=no)" ]; then
    echo "توقف: تغییرات محلی در $APP وجود دارد (git status). ابتدا آن‌ها را بررسی و در صورت نیاز git stash کنید." >&2
    exit 1
  fi
  sudo -u shomaldoc git -C "$APP" fetch origin "$BRANCH"
  if ! sudo -u shomaldoc git -C "$APP" merge --ff-only "origin/$BRANCH"; then
    echo "توقف: شاخهٔ محلی با origin/$BRANCH واگرا شده است؛ ادغام دستی لازم است (هیچ تغییری حذف نشد)." >&2
    exit 1
  fi
else
  sudo -u shomaldoc git clone --depth 1 -b "$BRANCH" "$REPO" "$APP"
fi

log "پایگاه دادهٔ PostgreSQL"
if [ ! -f "$APP/server/.env" ]; then
  DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='shomal'" | grep -q 1 \
    && sudo -u postgres psql -c "ALTER ROLE shomal WITH LOGIN PASSWORD '$DB_PASS'" \
    || sudo -u postgres psql -c "CREATE ROLE shomal WITH LOGIN PASSWORD '$DB_PASS'"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='shomaldoc'" | grep -q 1 \
    || sudo -u postgres createdb -O shomal shomaldoc
  sed -e "s#postgres://shomal:CHANGE_ME@#postgres://shomal:$DB_PASS@#" \
      -e "s#^PORT=.*#PORT=$PORT#" \
      -e "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMAIN#" \
      "$APP/server/.env.example" > "$APP/server/.env"
  chown shomaldoc: "$APP/server/.env"; chmod 600 "$APP/server/.env"
  echo "✔ .env ساخته شد. SMTP و پیامک را بعداً در $APP/server/.env تنظیم کنید."
fi

log "نصب وابستگی‌ها، مهاجرت و ساخت فرانت‌اند"
cd "$APP"
sudo -u shomaldoc HOME="$APP" npm ci --no-audit --no-fund
cd server
sudo -u shomaldoc HOME="$APP" npm ci --no-audit --no-fund
sudo -u shomaldoc HOME="$APP" bash -c 'set -a; . ./.env; set +a; npm run migrate && npm run build:web'

log "سرویس systemd"
cp deploy/shomaldoc.service /etc/systemd/system/shomaldoc.service
systemctl daemon-reload
systemctl enable shomaldoc >/dev/null
systemctl restart shomaldoc
sleep 4
curl -fsS "http://127.0.0.1:$PORT/healthz" && echo || { journalctl -u shomaldoc -n 40 --no-pager; exit 1; }

log "پشتیبان‌گیری شبانه (۲:۰۰)"
echo "0 2 * * * shomaldoc $APP/server/deploy/backup.sh >> /var/log/shomaldoc-backup.log 2>&1" > /etc/cron.d/shomaldoc-backup
chmod 644 /etc/cron.d/shomaldoc-backup
touch /var/log/shomaldoc-backup.log && chown shomaldoc: /var/log/shomaldoc-backup.log

log "پایان ✔"
cat <<EOF
مرحلهٔ آخر در Plesk (یک‌بار):
 1) Websites & Domains → $DOMAIN → SSL/TLS → Let's Encrypt (+ Redirect HTTP→HTTPS)
 2) Apache & nginx Settings → «Proxy mode» را خاموش و در Additional nginx directives:
      client_max_body_size 25m;
      location / { proxy_pass http://127.0.0.1:$PORT; proxy_http_version 1.1;
        proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme; proxy_read_timeout 120s; }
 3) https://$DOMAIN را باز کنید و حساب نخستین مدیر سیستم را بسازید.
به‌روزرسانی‌های بعدی: همین اسکریپت را دوباره اجرا کنید.
EOF
