# گزارش ممیزی و وضعیت قابلیت‌ها — branch `feature/masters-programs`

پایه: `main @ 52541f4`. معماری: اپ ZiteJS (`apps/app`) + سرور خودمیزبان Express/PostgreSQL (`server/`). منطق مشترک گردش‌کار و RBAC در `apps/app/src/lib/server.ts` است؛ `allowedActions` منبع واحد UI و enforcement است و `nextActor` مسئول اقدام بعدی را از وضعیت واقعی + ساختار سازمانی استخراج می‌کند.

## نقش‌ها
student, professor, group_manager, graduate_office, finance, reviewer, admin — چندنقشی. «مدیر گروه مسئول پرونده» = کاربر دارای نقش group_manager که `department` او با `department` پرونده یکی است (رابطهٔ موجود؛ چیزی حدس زده نشده). نگاشت رسمی رشته (Programs) → گروه آموزشی در داده‌ها وجود ندارد، پس مسئول از گروهِ ثبت‌شدهٔ پرونده تعیین می‌شود.

## گردش‌کار (STATUS_ORDER)
DRAFT → WAITING_SUPERVISOR → GROUP_REVIEW (تأیید موضوع) → LITERATURE_REVIEW (دانشجو) → **LITERATURE_SUPERVISOR_REVIEW** (استاد راهنما، مرحلهٔ ۱) → **LITERATURE_GROUP_REVIEW** (مدیر گروه، مرحلهٔ ۲، جدید) → PROPOSAL_DRAFT → PROPOSAL_REVIEW (زنجیرهٔ قابل‌تنظیم) → IRANDOC_PENDING → … → DEFENSE_SCHEDULING → … → GRADUATED
برگشت از هر دو مرحلهٔ پیشینه → LITERATURE_REVISION؛ ارسال مجدد همیشه از استاد راهنما شروع می‌شود (نسخهٔ جدید باید هر دو تأیید را بگیرد).

## ارزیابی
| مورد | وضعیت | تست |
|---|---|---|
| فرم اولیه فقط موضوع | پیاده‌سازی‌شده | سبز |
| پیشینه: راهنما ← مدیر گروه، علت برگشت اجباری، نسخه‌ها حفظ | پیاده‌سازی‌شده (این دور) | سبز |
| جلوگیری از پیشینه پیش از تأیید موضوع / پروپوزال پیش از دو تأیید | Backend (status + `topicApprovedAt` + reviewStatus نسخهٔ فعال) | سبز |
| درخواست تکراری/هم‌زمان | قفل advisory تراکنشی به‌ازای پرونده (`withThesisLock`) در `thesisAction` و `submitDocument` | سبز (۳ درخواست هم‌زمان → دقیقاً یک گذار) |
| سقف استاد راهنما/مشاور | تنظیم `maxSupervisors` / `maxAdvisors` فقط admin، اعتبارسنجی و Audit | سبز |
| انتخاب استاد از پروفایل واقعی، جایگاه مستقل، سابقهٔ تغییر | جدول `ThesisCommittee` (غیرفعال‌سازی به‌جای حذف) | سبز |
| فرم پروپوزال چندمرحله‌ای | `ProposalWizard` روی همان فرم پویای قابل‌تعریف توسط admin (فرم موازی ساخته نشد) | Backend سبز؛ UI در E2E/دستی |
| مسئول اقدام بعدی | `nextActor` در `thesisDetail` + کارت در جزئیات و داشبورد | سبز (مرحلهٔ مدیر گروه) |
| تاریخ تصویب پروپوزال | از دور قبل؛ بدون تغییر قاعده | سبز |
| رشته‌های ارشد | از دور قبل؛ اکنون پیش‌شرط ارسال پروپوزال | سبز |
| خطای PDF در workflow.test | علت: مسیر ثابت Chrome. اکنون `CHROMIUM_PATH` یا یافتن خودکار | سبز با Chromium واقعی |
| خطای typecheck فرانت (TopicForm) | ناسازگاری نوع `@hookform/resolvers` با zod محلی؛ resolver ساده جایگزین شد | `tsc` فرانت بدون خطا |
| `install.sh` و `git reset --hard` | جایگزین با توقف در صورت تغییر محلی + `merge --ff-only` | `bash -n` |
