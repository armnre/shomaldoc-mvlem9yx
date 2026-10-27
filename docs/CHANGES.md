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
