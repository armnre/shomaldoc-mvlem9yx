# استقرار روی سرور فعلی (Plesk، `/opt/shomaldoc`)

> روی Production هیچ دستوری بدون پشتیبان اجرا نکنید. ابتدا همین مراحل را روی staging اجرا کنید.
> توجه: `deploy/install.sh` از `git reset --hard origin/$BRANCH` استفاده می‌کند؛ تغییرات محلی روی سرور را از بین می‌برد (`.env` در git نیست و حفظ می‌شود).

## پیش‌شرط‌ها
- PR ادغام شده و `npm test` روی staging سبز است.
- فضای دیسک: `df -h /opt /var/lib/shomaldoc /var/backups`
- سرویس سالم: `systemctl status shomaldoc.service --no-pager` و `curl -fsS http://127.0.0.1:3080/healthz`

## ۱) پشتیبان
```bash
sudo -u shomaldoc /opt/shomaldoc/server/deploy/backup.sh
ls -lh /var/backups/shomaldoc | tail -n 3
PREV=$(sudo -u shomaldoc git -C /opt/shomaldoc rev-parse HEAD); echo "$PREV" | sudo tee /var/backups/shomaldoc/last-good-commit
```
## ۲) دریافت کد و build (سرویس هنوز در حال اجرا با نسخهٔ قبلی)
```bash
cd /opt/shomaldoc
sudo -u shomaldoc git fetch origin main
sudo -u shomaldoc git merge --ff-only origin/main
sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
cd server && sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
sudo -u shomaldoc HOME=/opt/shomaldoc npm run typecheck
# بررسی وجود متغیرها بدون چاپ مقدار:
sudo -u shomaldoc grep -cE '^(DATABASE_URL|UPLOAD_DIR|PORT)=' .env   # باید 3 باشد
```
## ۳) Migration (افزایشی)
```bash
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npm run migrate'
```
## ۴) واردسازی رشته‌های ارشد (یک‌بار؛ تکرار بی‌خطر)
```bash
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npx tsx --tsconfig tsconfig.json scripts/seed-masters-programs.ts --dry-run'
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npx tsx --tsconfig tsconfig.json scripts/seed-masters-programs.ts'
```
## ۵) build فرانت و فعال‌سازی
```bash
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npm run build:web'
sudo systemctl restart shomaldoc.service
sleep 4; curl -fsS http://127.0.0.1:3080/healthz
journalctl -u shomaldoc.service -n 100 --no-pager
```
بعد: ورود دانشجو/تحصیلات تکمیلی در `https://shomaldoc.shomal.ac.ir/`، ثبت موضوع آزمایشی، مشاهدهٔ کارت تاریخ تصویب.

## Rollback
ستون‌های جدید افزایشی‌اند و نسخهٔ قبلی آن‌ها را نادیده می‌گیرد؛ پس بازگشت کد کافی است:
```bash
cd /opt/shomaldoc
sudo -u shomaldoc git checkout "$(cat /var/backups/shomaldoc/last-good-commit)"
sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
cd server && sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npm run build:web'
sudo systemctl restart shomaldoc.service && curl -fsS http://127.0.0.1:3080/healthz
```
بازیابی دیتابیس از پشتیبان فقط در صورت خرابی داده و با هماهنگی (بازیابی، داده‌های ثبت‌شده پس از پشتیبان را از بین می‌برد).
