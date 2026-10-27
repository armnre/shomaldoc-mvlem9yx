# اجرای تست‌ها
```bash
# PostgreSQL روی 5433 با نقش shomal. دیتابیس‌های shomaldoc_test و shomaldoc_e2e توسط تست‌ها Drop/Create می‌شوند؛ هرگز به Production اشاره ندهید.
cd server && npm ci && npm run typecheck && npx vitest run
npx tsc -p ../apps/app/tsconfig.app.json --noEmit        # typecheck فرانت
npm run build:web
# PDF: Chrome/Chromium در مسیرهای معمول خودکار پیدا می‌شود؛ در غیر این صورت CHROMIUM_PATH=/path/to/chrome
PW_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e     # Playwright با Chromium سیستم (یا npx playwright install chromium)
```

## نتایج اجرای واقعی (محیط توسعه، 27 Oct 2026، PostgreSQL 15 + Chromium سیستم)
| بررسی | نتیجه |
|---|---|
| `tsc` سرور | بدون خطا |
| `tsc` فرانت (`apps/app/tsconfig.app.json`) | بدون خطا (خطای قبلی zodResolver در TopicForm رفع شد) |
| `npm run build:web` | موفق (فقط هشدار حجم chunk) |
| vitest (۶ فایل) | **45 از 45 موفق** |
| Playwright `full-flow.spec.ts` | **1 از 1 موفق** (۳۸ ثانیه): کلیک واقعی هر نقش، از جمله دو مرحلهٔ پیشینه |

تست‌ها بر اساس فایل:
- `literature-committee.test.ts` (جدید، ۱۲ تست):
  - قفل پیشینه پیش از تأیید موضوع
  - رد تأیید مدیر گروه پیش از تأیید راهنما
  - علت برگشت اجباری برای هر دو نقش و نمایش آن به دانشجو
  - ارجاع به مدیر گروه و `nextActor`
  - قفل پروپوزال پیش از هر دو تأیید
  - شروع ارسال مجدد از راهنما و حفظ نسخه‌ها (v1..v3)
  - رد نقش‌های غیرمجاز
  - سه درخواست هم‌زمان که فقط یک گذار ایجاد می‌کنند
  - AuditLog هر دو مرحله
  - تغییر سقف فقط توسط admin، با اعتبارسنجی و Audit
  - پیش‌نویس سمت سرور و رد آن برای دانشجوی دیگر
  - اعمال سقف، پروفایل واقعی، عدم تکرار، رشتهٔ الزامی
  - دسترسی عضو هیئت و رد دسترسی دانشجوی دیگر
  - سازگاری پروندهٔ در حال بررسی هنگام کاهش سقف و حفظ سابقهٔ حذف استاد
- `workflow.test.ts`: کل مسیر تا فارغ‌التحصیلی، شامل تولید PDF صورتجلسه با Chromium واقعی. علت خطای قبلی مسیر ثابت `/usr/bin/google-chrome-stable` بود که اکنون یافتن خودکار جایگزین آن شده است. تست حذف یا غیرفعال نشد.
- `stages.test.ts`، `rbac.test.ts`، `security.test.ts`، `notify.test.ts`: تست‌های رگرسیون قبلی. موارد پوشش‌داده‌شده شامل تاریخ تصویب، فیلتر رشته‌ها، دانلود فایل خصوصی بدون مجوز و دسترسی به پروندهٔ دیگران است.

## اجرا‌نشده
- بررسی تصویری دستی فرم مرحله‌ای روی موبایل. Playwright فرم پروپوزال را از راه API ارسال می‌کند، نه با کلیک روی فرم مرحله‌ای.
- اجرا روی staging با داده‌های واقعی دانشگاه.
