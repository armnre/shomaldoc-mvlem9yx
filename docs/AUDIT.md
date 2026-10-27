# گزارش ممیزی و وضعیت قابلیت‌ها — branch `feature/masters-programs`

پایه: `main @ 52541f4`. معماری: اپ ZiteJS (`apps/app`) + سرور خودمیزبان Express/PostgreSQL (`server/`). منطق مشترک گردش‌کار و RBAC در `apps/app/src/lib/server.ts` (`allowedActions` منبع واحد UI و enforcement است).

## نقش‌ها (از کد)
student, professor, group_manager, graduate_office, finance, reviewer, admin — چندنقشی.

## گردش‌کار واقعی (STATUS_ORDER)
DRAFT → WAITING_SUPERVISOR (استاد راهنما) → GROUP_REVIEW (مدیر گروه: تأیید موضوع) → LITERATURE_REVIEW (دانشجو) → LITERATURE_SUPERVISOR_REVIEW (استاد راهنما) → PROPOSAL_DRAFT (دانشجو) → PROPOSAL_REVIEW (زنجیرهٔ قابل‌تنظیم: supervisor/group_manager/graduate_office) → IRANDOC_PENDING → … → DEFENSE_SCHEDULING (تحصیلات تکمیلی) → …

## ارزیابی
| مورد | وضعیت پیش از این branch | اقدام |
|---|---|---|
| فرم اولیه فقط موضوع | ناقص: Backend شرح مسئله/اهداف را الزامی می‌کرد | اصلاح شد (Backend + UI) — آماده تست، تست خودکار سبز |
| قفل مراحل بعد پیش از تأیید موضوع | موجود و enforce در Backend (`submitDocument` بر اساس status) | تست رگرسیون اضافه شد |
| پیشینه تحقیق نسخه‌بندی‌شده، برگشت با علت اجباری | موجود (`newVersion`، `NEEDS_COMMENT`) — تأییدکننده در کد «استاد راهنما» است نه مدیر گروه | تغییری داده نشد؛ نیازمند تصمیم دانشگاه (بخش G) |
| پروپوزال: نسخه‌بندی، زنجیرهٔ تأیید، مسئول مرحله (`proposalStep`)، NextStepCard | موجود | بدون تغییر |
| ثبت دستی تاریخ تصویب | وجود نداشت (فقط زمان خودکار تأیید) | پیاده‌سازی شد — تست خودکار سبز |
| رشته/گرایش کارشناسی ارشد + فیلتر | جدول Programs بود؛ داده و فیلتر نبود | پیاده‌سازی شد — تست خودکار سبز |
| چند استاد راهنما/مشاور | فقط یک `supervisorId` و یک `advisorId`؛ هیچ قاعدهٔ تعداد در کد | پیاده‌سازی نشد — نیاز به سقف مصوب دانشگاه |
| فرم پروپوزال چندمرحله‌ای | فرم پویا (`DynamicForm`، FormFields قابل‌تنظیم توسط مدیر) | بدون تغییر در این branch |
| Typecheck سرور | ۲ فایل خطا داشت (`z.record` تک‌آرگومانی) | اصلاح شد؛ `tsc` سرور بدون خطا |
| فایل‌ها | آپلود با نام تصادفی، دانلود از مسیر احراز هویت‌شده `/api/_file/:key` | بدون تغییر |
