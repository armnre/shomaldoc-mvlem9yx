# گزارش ممیزی اولیه — 2026-10-27

- Branch پایه: main @ 52541f4b2928773b0a10e6ef43ad39d95d0504b0
- معماری: اپ ZiteJS (`apps/app`) به‌همراه سرور خودمیزبان Express + PostgreSQL (`server/`)، با schema افزایشی در `server/db/schema.sql` و اجرای migration با `npm run migrate`
- تست‌ها: vitest (`server/test`: workflow, rbac, security, notify) و Playwright (`server/e2e/full-flow.spec.ts`)
- استقرار: `server/deploy/install.sh`، `shomaldoc.service` و `backup.sh`
- قابلیت‌هایی که از قبل وجود دارند: TopicForm، SupervisorPicker، IranDocForm، DocumentSubmit (نسخه‌بندی پیشینه و پروپوزال)، NextStepCard، Stepper، JalaliDatePicker، بررسی فاصلهٔ تصویب تا دفاع در thesisAction، و AuditLogs

## تحویل این branch
- داده‌های کارشناسی ارشد به‌همراه seed idempotent (به `docs/MASTERS_PROGRAMS.md` مراجعه کنید)

## باقی‌مانده (نیازمند اجرای تست روی محیط دارای PostgreSQL)
بازبینی فرم موضوع، پروپوزال چندمرحله‌ای با چند مشاور، ثبت دستی تاریخ تصویب و فیلتر دانشکده→رشته→گرایش در UI. این موارد روی کد واقعی و قوانین فعلی `lib/server.ts` انجام می‌شوند و پیش از ادغام باید `npm test`، `npm run typecheck` و `npm run test:e2e` اجرا شوند.
