# شمال‌داک — نسخهٔ مستقل (Node.js + PostgreSQL)

این پوشه همان سامانهٔ `apps/app` را بدون وابستگی به پلتفرم Zite روی سرور اوبونتو اجرا می‌کند.

- **API:** Express؛ هر فایل `apps/app/src/api/*.ts` به‌صورت خودکار مسیر `POST /api/<نام>` می‌شود (منطق کسب‌وکار یکسان و تک‌منبع است).
- **پایگاه داده:** PostgreSQL. اسکیما از مدل داده تولید می‌شود: `db/schema.sql` (۲۴ جدول + ۱۶ جدول ارتباطی).
- **فرانت‌اند:** همان React اپ، با `npm run build:web` در `web-dist` ساخته و توسط همین سرور ارائه می‌شود.
- **فایل‌ها:** روی دیسک (`UPLOAD_DIR`) و از مسیر `/files/...` ارائه می‌شوند. صورتجلسهٔ PDF با Chromium ساخته می‌شود.

## نصب سریع با Docker (پیشنهادی)
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx git
sudo git clone https://github.com/armnre/shomaldoc-mvlem9yx.git /opt/shomaldoc
cd /opt/shomaldoc/server
cp .env.example .env && nano .env        # رمز پایگاه داده و PUBLIC_URL را تنظیم کنید
sudo docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```
سپس nginx:
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/shomaldoc   # server_name را ویرایش کنید
sudo ln -s /etc/nginx/sites-available/shomaldoc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx   # HTTPS
```
با اولین بازکردن سامانه، صفحهٔ «راه‌اندازی مدیر سیستم» نمایش داده می‌شود.

## نصب بدون Docker
```bash
sudo apt install -y postgresql nodejs npm chromium fonts-vazirmatn
sudo -u postgres psql -c "CREATE USER shomal WITH PASSWORD 'CHANGE_ME';" -c "CREATE DATABASE shomaldoc OWNER shomal;"
cd /opt/shomaldoc && npm ci --ignore-scripts
cd server && npm install --ignore-scripts && cp .env.example .env   # DATABASE_URL=postgres://shomal:CHANGE_ME@localhost/shomaldoc
npm run migrate && npm run build:web
sudo cp deploy/shomaldoc.service /etc/systemd/system/ && sudo systemctl enable --now shomaldoc
```

## کارهای زمان‌بندی‌شده و پشتیبان‌گیری
- یادآوری روزانه و کنترل پایان ترم: `deploy/cron.sh` (نمونهٔ crontab داخل فایل).
- پشتیبان روزانهٔ پایگاه داده و فایل‌ها: `deploy/backup.sh`.

## توسعه
```bash
npm run dev           # API با بارگذاری مجدد
npm run schema        # پس از تغییر مدل داده، اسکیما را دوباره تولید کنید
npm run migrate       # اعمال اسکیما (idempotent)
```

## امنیت
رمزها با هش و نمک ذخیره می‌شوند، نشست‌ها توکنی و قابل ابطال‌اند، قفل حساب پس از تلاش‌های ناموفق، کنترل نقش در سمت سرور برای همهٔ عملیات، کوئری‌های پارامتری، محدودیت نوع/حجم فایل و هدرهای امنیتی HTTP.
