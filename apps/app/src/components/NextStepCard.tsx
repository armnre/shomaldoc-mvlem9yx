import { ArrowLeftCircle, Hourglass, PartyPopper, UserRound, XCircle } from 'lucide-react';
import { Card, CardContent } from '@project/components/ui/card';
import { cn } from '@project/components/lib/utils';
import { STATUS } from '../lib/format';

const STUDENT_TODO: Record<string, string> = {
  NONE: 'موضوع پایان‌نامه را ثبت و استاد راهنما را انتخاب کنید.',
  DRAFT: 'پیش‌نویس موضوع را تکمیل و برای استاد راهنما ارسال کنید.',
  SUPERVISOR_REJECTED: 'استاد قبلی درخواست را نپذیرفت؛ استاد راهنمای دیگری انتخاب کنید.',
  TOPIC_REVISION: 'موضوع را مطابق نظر مدیر گروه اصلاح و دوباره ارسال کنید.',
  LITERATURE_REVIEW: 'فایل پیشینهٔ تحقیق را بارگذاری کنید.',
  LITERATURE_REVISION: 'پیشینه را طبق علت برگشت (استاد راهنما یا مدیر گروه) اصلاح و دوباره ارسال کنید.',
  PROPOSAL_DRAFT: 'فرم و فایل پروپوزال را تکمیل و ارسال کنید.',
  PROPOSAL_REVISION: 'پروپوزال را طبق نظرات اصلاح و دوباره ارسال کنید.',
  IRANDOC_PENDING: 'کد رهگیری و فایل ثبت ایرانداک را وارد کنید.',
  EXTENSION_REQUIRED: 'مهلت مجاز تمام شده؛ درخواست تمدید ثبت کنید.',
  THESIS_ACTIVE: 'پس از اتمام نگارش، نسخهٔ نهایی پایان‌نامه را ارسال کنید.',
  FINAL_REVISION: 'نسخهٔ نهایی را طبق نظرات اصلاح و دوباره ارسال کنید.',
};
export const OWNER: Record<string, string> = {
  WAITING_SUPERVISOR: 'استاد راهنما', GROUP_ASSIGNMENT: 'مدیر گروه', GROUP_REVIEW: 'مدیر گروه',
  LITERATURE_SUPERVISOR_REVIEW: 'استاد راهنما', LITERATURE_GROUP_REVIEW: 'مدیر گروه', PROPOSAL_REVIEW: 'زنجیرهٔ تأیید پروپوزال', IRANDOC_REVIEW: 'تحصیلات تکمیلی',
  SPECIAL_COMMISSION: 'کمیسیون موارد خاص', EXTENSION_REQUESTED: 'زنجیرهٔ تأیید تمدید', FINAL_SUPERVISOR_REVIEW: 'استاد راهنما',
  PLAGIARISM_CHECK: 'تحصیلات تکمیلی', REVIEWER_ASSIGNMENT: 'مدیر گروه', REVIEWING: 'داوران',
  DEFENSE_SCHEDULING: 'تحصیلات تکمیلی', DEFENSE_SCHEDULED: 'هیئت داوران (جلسهٔ دفاع)', DEFENDED: 'تحصیلات تکمیلی',
  THESIS_COMPLETED: 'تحصیلات تکمیلی', GRADUATION_PROCESS: 'واحدهای تسویه',
};

/** Hero card: what the student must do now, or who the case is waiting on. */
export default function NextStepCard({ status }: { status: string }) {
  const todo = STUDENT_TODO[status];
  const closed = ['REJECTED', 'CANCELLED'].includes(status);
  const done = status === 'GRADUATED';
  const Icon = done ? PartyPopper : closed ? XCircle : todo ? ArrowLeftCircle : Hourglass;
  const title = done ? 'فارغ‌التحصیلی شما ثبت شد' : closed ? 'پرونده بسته شده است' : todo ? 'اقدام بعدی شما' : 'منتظر اقدام دیگران';
  const text = done ? 'تمام مراحل با موفقیت به پایان رسید. تبریک!' : closed ? 'علت در تاریخچهٔ پرونده ثبت شده است.'
    : todo ?? `پرونده نزد «${OWNER[status] ?? 'مسئول مربوط'}» است؛ پس از اقدام، از طریق اعلان باخبر می‌شوید.`;
  return (
    <Card className={cn('border-2', todo ? 'border-sidebar-primary/60 bg-accent/40' : closed ? 'border-destructive/40' : 'border-primary/20')}>
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', todo ? 'bg-sidebar-primary text-primary' : closed ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold">{title}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{STATUS[status]?.label ?? 'ثبت نشده'}</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
          {!todo && !closed && !done && OWNER[status] && (
            <p className="flex items-center gap-1 text-xs text-foreground/70"><UserRound className="h-3.5 w-3.5" />مسئول فعلی: {OWNER[status]}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
