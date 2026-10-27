# تغییرات این branch

## API جدید
- `listMastersPrograms({token})` → دانشکده ← رشته ← گرایش؛ فقط `degree = کارشناسی ارشد` و `isActive != false`.
- `setThesisProgram({token, thesisId, faculty, major, programId})` — فقط دانشجوی صاحب پرونده، فقط در وضعیت‌های پیش از تصویب پروپوزال (`PROGRAM_EDITABLE`). اعتبارسنجی: وجود، فعال بودن، مقطع ارشد، تطابق دانشکده و رشته. ثبت در AuditLog.
- `setProposalApprovalDate({token, thesisId, approvalDate: 'YYYY-MM-DD', reason?})` — فقط `graduate_office` یا `admin`؛ فقط از IRANDOC_PENDING تا DEFENSE_SCHEDULING (قبل از زمان‌بندی دفاع). تاریخ معتبر تقویمی، نه در آینده، نه پیش از تأیید موضوع. اصلاح تاریخ ثبت‌شده علت اجباری دارد. ذخیره در `proposalApprovedAt` (نیمه‌شب تهران) — همان فیلدی که بررسی حداقل فاصلهٔ دفاع در `thesisAction` می‌خواند؛ زمان ثبت جداگانه در `approvalDateSetAt` و ثبت‌کننده در `approvalDateSetById`. AuditLog: «ثبت/اصلاح تاریخ تصویب پروپوزال» با مقدار قبلی.

## API تغییرکرده
- `saveThesisDraft`: فقط `titleFa` الزامی (۵ تا ۳۰۰ نویسه)؛ بقیه اختیاری (سازگار با کلاینت‌های قدیمی).
- `requestSupervisor`: فقط موضوع الزامی است.
- `thesisDetail`: فیلدهای جدید `approvalDateSetAt, approvalDateSetBy, programId, programFaculty, programMajor, canSetApprovalDate, canSetProgram`.
- `adminSettings`, `submitDocument`: اصلاح `z.record` برای سازگاری با zod نصب‌شده (رفع خطای typecheck).

## UI
- `TopicForm`: فقط موضوع (و عنوان انگلیسی اختیاری) با توضیح مرحله.
- `ProgramPicker` (داشبورد دانشجو): انتخاب آبشاری؛ حالت «این رشته گرایش ندارد».
- `ApprovalDateCard` (جزئیات پرونده؛ و فقط‌خواندنی در داشبورد دانشجو): تاریخ رسمی، ثبت‌کننده، زمان ثبت؛ فرم با JalaliDatePicker برای نقش مجاز.

## Migration (افزایشی، در `server/db/schema.sql`، اجرا با `npm run migrate`)
```sql
ALTER TABLE "Theses"   ADD COLUMN IF NOT EXISTS "approvalDateSetById" text;
ALTER TABLE "Theses"   ADD COLUMN IF NOT EXISTS "approvalDateSetAt" timestamptz;
ALTER TABLE "Programs" ADD COLUMN IF NOT EXISTS "faculty" text;
```
هیچ ستونی حذف یا تغییر نوع نمی‌دهد. داده‌های موجود دست نمی‌خورند. `meta.json` و `.zite/db.ts` هم‌زمان به‌روز شدند (`python3 server/scripts/gen-schema.py`).

---
# دور دوم: گردش‌کار پیشینه، هیئت استادان، فرم مرحله‌ای

## گردش‌کار
- وضعیت جدید `LITERATURE_GROUP_REVIEW`. اقدام‌های جدید `literature_gm_approve` و `literature_gm_revision` (فقط مدیر گروهِ گروه پرونده). `literature_approve` (استاد راهنما) دیگر مرحله را نهایی نمی‌کند و نسخه را `supervisor_approved` می‌کند؛ مدیر گروه فقط روی نسخه‌ای با این وضعیت اقدام می‌کند.
- علت برگشت در هر دو مرحله اجباری است (`NEEDS_COMMENT`)، در `DocumentVersions.reviewComment` و AuditLog ذخیره و به دانشجو نمایش داده می‌شود.
- `submitDocument`: پیشینه فقط پس از `topicApprovedAt`. پروپوزال فقط وقتی نسخهٔ فعال پیشینه `approved` (تأیید مدیر گروه) باشد و رشته انتخاب شده باشد.
- قفل هم‌زمانی: `withThesisLock` (روی سرور: `pg_advisory_xact_lock`).
- `nextActor`: مسئول، افراد، اقدام مورد انتظار و محل انجام، از status + `proposalStep` + گروه پرونده.
- پرونده‌های قدیمی: پرونده‌ای که پیش از استقرار در `PROPOSAL_DRAFT` یا بعد از آن است دست نمی‌خورد. پرونده‌ای که در `LITERATURE_SUPERVISOR_REVIEW` است با تأیید استاد راهنما وارد مرحلهٔ مدیر گروه می‌شود.

## هیئت استادان و سقف تعداد
- تنظیمات جدید (`adminSettings`، فقط admin): `maxSupervisors` (۱ تا ۵، شامل راهنمای اول) و `maxAdvisors` (۰ تا ۵). پیش‌فرض ۱/۱ فقط بازتاب مدل موجود (یک `supervisorId` و یک `advisorId`) است و **قانون دانشگاه نیست**. مقدار مصوب را admin وارد می‌کند. هر تغییر در AuditLog ثبت می‌شود.
- جدول جدید `ThesisCommittee`: یک ردیف برای هر جایگاه (نقش، ترتیب، ثبت‌کننده و زمان، حذف‌کننده و زمان). ردیف‌ها حذف نمی‌شوند و فقط غیرفعال می‌شوند. راهنمای اول همان `Theses.supervisorId` است و `advisorId` برای سازگاری با گزارش‌ها و صورتجلسه همان مشاور اول باقی می‌ماند.
- اعتبارسنجی Backend: سقف تعداد، استاد فعال با نقش professor در همان گروه، بدون تکرار، دانشجو نمی‌تواند استاد خود باشد.
- رفتار هنگام تغییر سقف: سقف فقط هنگام **نوشتن** (ارسال یا ارسال مجدد پروپوزال، `set_advisor`، `group_approve_topic`) اعمال می‌شود. پرونده‌های تأییدشده و پرونده‌های در حال بررسی (`PROPOSAL_REVIEW`) دست نمی‌خورند. اگر پرونده‌ای برگشت بخورد و استادانش از سقف جدید بیشتر باشند، دانشجو باید پیش از ارسال مجدد تعداد را کم کند.

## API
- جدید `saveProposalDraft({token, draft})`: ذخیرهٔ پیش‌نویس فرم (پاسخ‌ها، استادان، فایل‌ها، مرحله) فقط در `PROPOSAL_DRAFT`/`PROPOSAL_REVISION`. چیزی ارسال نمی‌شود.
- `submitDocument`: ورودی‌های اختیاری `coSupervisorIds` و `advisorIds`.
- `thesisDetail`: `committee` (با سابقه)، `committeeLimits`، `proposalDraft` (فقط برای صاحب پرونده) و `nextActor`.
- `listTheses` و `runReminders`: صندوق و یادآور مدیر گروه شامل `LITERATURE_GROUP_REVIEW` شد.

## UI
- `ProposalWizard`: هشت مرحله (دانشجو، راهنمای اول، راهنماهای دیگر\*، مشاوران\*، پژوهش (فرم پویا)، دانشکده/رشته/گرایش، فایل، مرور و ارسال). \* فقط وقتی سقف اجازه دهد. اعتبارسنجی هر مرحله پیش از ادامه انجام می‌شود. ذخیره هم روی سرور است و هم در localStorage، و با رفت‌وبرگشت یا خطای شبکه از دست نمی‌رود. دکمهٔ ارسال در برابر کلیک تکراری قفل می‌شود.
- `ProfessorSlot`: مؤلفهٔ مشترک جایگاه استاد.
- `NextActorCard`: وضعیت، آخرین اقدام و علت، مسئول بعدی، اقدام مورد انتظار، محل انجام، و هیئت استادان با سابقه.
- تنظیم سقف استادان در «تنظیمات سامانه».

## Migration (افزایشی)
```sql
ALTER TABLE "Theses" ADD COLUMN IF NOT EXISTS "proposalDraft" text;
CREATE TABLE IF NOT EXISTS "ThesisCommittee" (id uuid PK, "thesisId" text, "professorId" text, "committeeRole" text,
  "position" double precision, "isActive" boolean, "assignedById" text, "assignedAt" timestamptz,
  "removedById" text, "removedAt" timestamptz, "note" text, "label" text, created, created_at, updated_at);
```
مقدار وضعیت جدید در ستون متنی `status` ذخیره می‌شود و تغییر ساختاری ندارد.
