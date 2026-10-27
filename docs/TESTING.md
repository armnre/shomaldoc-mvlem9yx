# اجرای تست‌ها
```bash
# PostgreSQL محلی روی 5433 با کاربر shomal (دیتابیس shomaldoc_test توسط تست‌ها Drop/Create می‌شود — هرگز به Production اشاره نکنید)
cd server && npm ci && npm run typecheck && npx vitest run
CHROMIUM_PATH=/usr/bin/google-chrome-stable npx vitest run test/workflow.test.ts   # نیازمند Chrome برای PDF صورتجلسه
npm run test:e2e   # Playwright
```
## نتایج اجرای واقعی در محیط توسعه (27 Oct 2026)
- `tsc -p server/tsconfig.json`: بدون خطا (پیش از این branch: ۱۳ خطا در adminSettings/submitDocument).
- `npm run build:web`: موفق.
- vitest: **32 موفق / 1 ناموفق** از 33. ناموفق: `workflow.test.ts > full workflow` به دلیل نبود Chrome برای تولید PDF در محیط توسعه (`Browser was not found` / `Failed to launch`) — همین تست پیش از تغییرات هم با همین علت شکست می‌خورد. باید روی staging با Chrome اجرا شود.
- `test/stages.test.ts` (جدید، 11 تست، همه سبز): فرم فقط‌موضوع، قفل پیشینه پیش از تأیید موضوع، RBAC تاریخ تصویب (دانشجو/راهنما/مدیر گروه → 403)، تاریخ نامعتبر/آینده/پیش از موضوع → 400، ثبت جداگانهٔ زمان ثبت، علت اجباری اصلاح، AuditLog، قفل پس از زمان‌بندی دفاع، seed با dry-run و idempotent (37/21/28)، فیلتر آبشاری، رد مقطع/دانشکده/رشتهٔ نامعتبر و پرونده متعلق به دیگری.
- اجرا نشده: Playwright E2E و بررسی تصویری 360/412/768/1024/1440 (مرورگر قابل اجرا در محیط توسعه موجود نبود). `tsc` فرانت‌اند یک خطای از پیش موجود zodResolver/zod دارد که با نسخهٔ قبلی TopicForm هم رخ می‌دهد (ناسازگاری نسخهٔ نصب‌شده؛ build تحت تأثیر نیست).
