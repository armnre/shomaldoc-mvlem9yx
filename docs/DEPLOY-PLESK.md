# استقرار روی سرور (Ubuntu 24.04 + Plesk Obsidian، `/opt/shomaldoc`)

> این راهنما **روی Production اجرا نشده** است. ابتدا کامل روی staging اجرا کنید.
> مقادیر مطابق کد: سرویس `shomaldoc.service`، پورت `127.0.0.1:3080`، فایل محیطی `/opt/shomaldoc/server/.env`، Health Check در `/healthz`، دیتابیس `shomaldoc` با نقش `shomal` (از `DATABASE_URL` در `.env`). تفاوتی با مشخصات اعلام‌شده دیده نشد.
> برای تولید PDF صورتجلسه، Chrome یا Chromium باید نصب باشد. اگر در مسیرهای معمول نیست، `CHROMIUM_PATH` را در `.env` تنظیم کنید.

## ۰) وضعیت فعلی
```bash
systemctl status shomaldoc.service --no-pager
curl -fsS http://127.0.0.1:3080/healthz
cd /opt/shomaldoc && sudo -u shomaldoc git log --oneline -1 && sudo -u shomaldoc git status --short
df -h /opt /var/backups
```
اگر `git status` تغییر محلی نشان می‌دهد، **ادامه ندهید** تا بررسی شود (`git diff`). در صورت نیاز `git stash push -m "server-local-$(date +%F)"` بزنید. `deploy/install.sh` دیگر `reset --hard` نمی‌زند و در این حالت متوقف می‌شود.

## ۱) پشتیبان (دیتابیس + فایل‌ها + نسخهٔ کد)
```bash
sudo -u shomaldoc /opt/shomaldoc/server/deploy/backup.sh
ls -lh /var/backups/shomaldoc | tail -n 3
sudo -u shomaldoc git -C /opt/shomaldoc rev-parse HEAD | sudo tee /var/backups/shomaldoc/last-good-commit
sudo cp /opt/shomaldoc/server/.env /var/backups/shomaldoc/env-$(date +%F)   # فقط روی سرور؛ هرگز وارد git نشود
```

## ۲) دریافت کد بدون حذف تغییرات محلی
```bash
cd /opt/shomaldoc
sudo -u shomaldoc git fetch origin main
sudo -u shomaldoc git merge --ff-only origin/main    # اگر خطا داد: واگرایی؛ ادغام دستی، نه reset
```

## ۳) وابستگی‌ها (با lockfile)، Typecheck و Build
```bash
sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
cd server && sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
sudo -u shomaldoc HOME=/opt/shomaldoc npm run typecheck
sudo -u shomaldoc grep -cE '^(DATABASE_URL|UPLOAD_DIR|PORT)=' .env     # باید 3 باشد (بدون چاپ مقدار)
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npm run build:web'
```
سرویس تا اینجا با نسخهٔ قبلی در حال اجراست.

## ۴) Migration (فقط افزایشی)
```bash
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npm run migrate'
sudo -u postgres psql -d shomaldoc -c '\d "ThesisCommittee"' | head
```
این دور: ستون `Theses.proposalDraft` و جدول `ThesisCommittee`. دور قبل: `approvalDateSetById/At` و `Programs.faculty`. هیچ ستونی حذف یا تغییر نوع نمی‌دهد.

## ۵) واردسازی رشته‌های ارشد (ابتدا dry-run)
```bash
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npx tsx --tsconfig tsconfig.json scripts/seed-masters-programs.ts --dry-run'
# خروجی باید «37 inserted» (اجرای اول) یا «0 inserted, 37 already» باشد. فقط پس از تأیید:
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npx tsx --tsconfig tsconfig.json scripts/seed-masters-programs.ts'
```

## ۶) راه‌اندازی و بررسی
```bash
sudo systemctl restart shomaldoc.service
sleep 4; curl -fsS http://127.0.0.1:3080/healthz
journalctl -u shomaldoc.service -n 100 --no-pager
```
بررسی دستی این موارد:
- ورود هر نقش.
- دیده‌شدن پرونده‌ای با وضعیت «بررسی پیشینه توسط مدیر گروه» در کارتابل مدیر گروه.
- کارت «وضعیت گردش‌کار و هیئت استادان» در جزئیات پرونده.
- مقدار سقف استادان در «تنظیمات سامانه». **مقدار مصوب دانشگاه را admin وارد کند.**

## Rollback
**کد:** Migrationهای این branch افزایشی‌اند. نسخهٔ قبلی ستون `proposalDraft` و جدول `ThesisCommittee` را نادیده می‌گیرد، پس بازگشت کد بدون بازگشت دیتابیس امن است. این موارد را در نظر بگیرید:
- اگر پرونده‌ای در وضعیت `LITERATURE_GROUP_REVIEW` باشد، کد قدیمی آن را نمی‌شناسد و اقدامی برایش نشان نمی‌دهد. پیش از Rollback آن‌ها را پیدا کنید:
  `SELECT id,"thesisCode" FROM "Theses" WHERE status='LITERATURE_GROUP_REVIEW';`
  تصمیم برای این پرونده‌ها با تحصیلات تکمیلی است، مثلاً بازگرداندن به `LITERATURE_SUPERVISOR_REVIEW` با ثبت در صورتجلسه.
- راهنمای دوم و مشاوران دوم به بعد در `ThesisCommittee` می‌مانند ولی در کد قدیمی نمایش داده نمی‌شوند (مشاور اول در `advisorId` هست).
```bash
cd /opt/shomaldoc
sudo -u shomaldoc git checkout "$(cat /var/backups/shomaldoc/last-good-commit)"
sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
cd server && sudo -u shomaldoc HOME=/opt/shomaldoc npm ci --no-audit --no-fund
sudo -u shomaldoc HOME=/opt/shomaldoc bash -c 'set -a; . ./.env; set +a; npm run build:web'
sudo systemctl restart shomaldoc.service && curl -fsS http://127.0.0.1:3080/healthz
```
**دیتابیس:** بازیابی از پشتیبان فقط در صورت خرابی داده و با هماهنگی انجام شود، چون داده‌های ثبت‌شده پس از پشتیبان از بین می‌روند. در این branch هیچ Migration مخربی وجود ندارد. اگر در آینده Migration مخرب اضافه شود، باید دستور بازگشت جداگانه داشته باشد و پیش از اجرا پشتیبان گرفته شود.
