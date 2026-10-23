# شمال‌داک — استقرار نیتیو روی Ubuntu (بدون Docker)

این پوشه نسخهٔ خودمیزبان سامانه است: همان endpointهای `apps/app/src/api` روی Express + PostgreSQL محلی اجرا می‌شوند و فرانت‌اند از `apps/app` ساخته می‌شود.

## پیش‌نیازها

| مورد | نسخه |
|---|---|
| Ubuntu | 22.04 یا 24.04 |
| **Node.js** | **فقط 20 یا 22** (سرور با نسخهٔ دیگر اجرا نمی‌شود — در `src/bootstrap.ts` و `engines` چک می‌شود) |
| PostgreSQL | 14 به بالا (نصب محلی) |
| Google Chrome | نسخهٔ پایدار واقعی (برای PDF صورتجلسه و گزارش) |

### ۱) Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # باید v20.x یا v22.x باشد
```

### ۲) PostgreSQL
```bash
sudo apt install -y postgresql postgresql-client
sudo -u postgres psql -c "CREATE USER shomal WITH PASSWORD 'رمز-قوی';"
sudo -u postgres psql -c "CREATE DATABASE shomaldoc OWNER shomal;"
```

### ۳) Google Chrome واقعی (برای PDF)
Chromium نسخهٔ snap در سرویس‌های systemd درست کار نمی‌کند؛ Chrome رسمی را نصب کنید:
```bash
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb fonts-noto-core fonts-vazirmatn || sudo apt install -y ./google-chrome-stable_current_amd64.deb fonts-noto-core
which google-chrome-stable      # → /usr/bin/google-chrome-stable
google-chrome-stable --headless --no-sandbox --dump-dom about:blank | head -1   # تست
```
مسیر را در `.env` بگذارید: `CHROMIUM_PATH=/usr/bin/google-chrome-stable`.
برای نمایش درست فارسی در PDF، فونت وزیرمتن را در `/usr/share/fonts/truetype/vazirmatn/` کپی و `sudo fc-cache -f` را اجرا کنید.

## نصب برنامه
```bash
sudo useradd --system --home /opt/shomaldoc --shell /usr/sbin/nologin shomaldoc
sudo mkdir -p /opt/shomaldoc /var/lib/shomaldoc/uploads /var/backups/shomaldoc
sudo chown -R shomaldoc: /opt/shomaldoc /var/lib/shomaldoc
sudo -u shomaldoc git clone <repo> /opt/shomaldoc
cd /opt/shomaldoc
sudo -u shomaldoc npm ci                 # وابستگی‌های فرانت‌اند (ریشه)
cd server
sudo -u shomaldoc npm ci                 # وابستگی‌های سرور
sudo -u shomaldoc cp .env.example .env   # و مقادیر را ویرایش کنید (chmod 600)
sudo -u shomaldoc npm run migrate        # ساخت جداول + مهاجرت URLهای قدیمی /files/ به /api/_file/
sudo -u shomaldoc npm run build:web      # ساخت فرانت‌اند در server/web-dist
```

### سرویس systemd
```bash
sudo cp deploy/shomaldoc.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now shomaldoc
curl -s http://127.0.0.1:3000/healthz   # {"ok":true,"db":"up",...}
```
`/healthz` وضعیت دیتابیس را برمی‌گرداند و در صورت قطعی DB کد 503 می‌دهد (برای مانیتورینگ).

## Plesk: Reverse proxy و SSL
1. در Plesk: **Websites & Domains → Add Domain** (مثلاً `thesis.shomal.ac.ir`) با «No hosting» یا Hosting عادی.
2. **SSL/TLS Certificates → Let's Encrypt**: گواهی را برای دامنه (و www) صادر کنید و «Redirect from HTTP to HTTPS» را فعال کنید.
3. **Apache & nginx Settings**:
   - تیک «Proxy mode» را بردارید (nginx مستقیم به Node وصل شود).
   - در **Additional nginx directives** این را بگذارید:
```nginx
client_max_body_size 25m;

location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```
4. در `.env`: `TRUST_PROXY_HOPS=1` (فقط nginx پلسک جلوی Node است) و `FORCE_HSTS=true`. Node فقط روی `127.0.0.1` گوش می‌دهد؛ پورت 3000 را در فایروال باز نکنید.
5. اگر بدون Plesk هستید، `deploy/nginx.conf` نمونهٔ معادل است.

## ایمیل و پیامک
- **ایمیل:** `SMTP_HOST/PORT/USER/PASS/FROM` را تنظیم کنید؛ ارسال با nodemailer انجام و وضعیت واقعی (`sent` / `failed` + متن خطا) در «لاگ اعلان‌ها» ثبت می‌شود.
- **پیامک:** `SMS_PROVIDER=kavenegar` و `KAVENEGAR_API_KEY` (و در صورت نیاز `KAVENEGAR_SENDER`). provider از طریق interface `SmsProvider` در `src/notify.ts` قابل تعویض است.
- اگر تنظیمات هر کانال خالی باشد، فقط همان کانال در حالت «لاگی» (`logged`) می‌ماند. وضعیت هنگام بالا آمدن سرور در لاگ چاپ می‌شود: `journalctl -u shomaldoc | grep notify`.

## زمان‌بندی داخلی (بدون توکن)
`runReminders` (پیش‌فرض هر روز 07:00) و `runTermControl` (هر روز 03:30) با **node-cron داخل خود سرور** و منطقهٔ زمانی تهران اجرا می‌شوند؛ هیچ توکن نشست مدیر لازم نیست. زمان‌ها با `CRON_REMINDERS` و `CRON_TERM` قابل تغییرند.
اجرای دستی: `sudo -u shomaldoc deploy/cron.sh reminders` یا `deploy/cron.sh term`.

## پشتیبان‌گیری (pg_dump محلی + tar آپلودها)
```bash
sudo install -m 750 deploy/backup.sh /usr/local/bin/shomaldoc-backup
echo '0 2 * * * root /usr/local/bin/shomaldoc-backup >> /var/log/shomaldoc-backup.log 2>&1' | sudo tee /etc/cron.d/shomaldoc-backup
```
خروجی: `db-<تاریخ>.sql.gz` و `uploads-<تاریخ>.tgz` در `BACKUP_DIR`، با حذف خودکار نسخه‌های قدیمی‌تر از `BACKUP_KEEP_DAYS`. روش بازیابی در سرآیند اسکریپت آمده است. توصیه: پوشهٔ پشتیبان را روزانه به سرور دیگری `rsync` کنید.

## امنیت
- فایل‌ها هرگز به‌صورت استاتیک سرو نمی‌شوند؛ دانلود فقط از `/api/_file/<key>` با نشست معتبر و بررسی `canView` پروندهٔ مربوط (فایل ← رکورد ← پرونده).
- آپلود فقط با نشست معتبر؛ نوع فایل با magic bytes (PDF/DOC/DOCX/JPG/PNG) بررسی می‌شود و باید با پسوند بخواند.
- rate limit روی ورود و آپلود؛ هدرهای CSP، HSTS، X-Frame-Options، nosniff.
- رمزها با PBKDF2-SHA256 و ۶۰۰ هزار تکرار؛ هش‌های قدیمی هنگام اولین ورود موفق خودکار ارتقا می‌یابند.
- ورودی نامعتبر همیشه با 400 و پیام فارسی رد می‌شود و به endpoint نمی‌رسد.

## توسعه و تست
```bash
npm run typecheck     # tsc strict برای سرور + همهٔ endpointها
npm test              # Vitest: workflow کامل، قوانین PRD، 403 برای هر نقش، امنیت فایل، ایمیل/پیامک
npm run test:e2e      # Playwright: مسیر کامل از ثبت موضوع تا فارغ‌التحصیلی (نیاز به Chrome و build:web)
```
تست‌ها به یک PostgreSQL نیاز دارند (`TEST_DATABASE_URL` / `E2E_DATABASE_URL`)؛ دیتابیس تست هر بار از نو ساخته می‌شود.
