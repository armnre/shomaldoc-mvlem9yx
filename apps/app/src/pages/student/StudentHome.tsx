import { useCallback, useEffect, useState } from 'react';
import { Award, CheckCircle2, Hourglass, Info, XCircle } from 'lucide-react';
import { thesisDetail, type ThesisDetailOutputType } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Skeleton } from '@project/components/ui/skeleton';
import { useSession } from '../../lib/session';
import { errMsg, fa, jalali, STEP_LABELS } from '../../lib/format';
import { DefenseCard } from '../../components/DefenseCard';
import { CaseHeader, ProcessCards, Timeline, Versions } from '../../components/CaseFile';
import TopicForm from './TopicForm';
import StudentJourney from '../../components/StudentJourney';
import SupervisorPicker from './SupervisorPicker';
import DocumentSubmit from './DocumentSubmit';
import IranDocForm from './IranDocForm';
import ExtensionForm from './ExtensionForm';
import TopicChangeForm from './TopicChangeForm';
import { DefenseChangesCard, GraduationPanel, LockedBanner, TopicChangesCard } from '../../components/CaseExtras';

const Notice = ({ icon: Icon, title, text, tone = 'text-primary' }: { icon: typeof Info; title: string; text: string; tone?: string }) => (
  <Card><CardContent className="flex items-start gap-3 p-6"><Icon className={`mt-0.5 h-6 w-6 shrink-0 ${tone}`} />
    <div><div className="font-bold">{title}</div><p className="text-sm text-muted-foreground">{text}</p></div></CardContent></Card>
);

export default function StudentHome() {
  const { me, token } = useSession();
  const [d, setD] = useState<ThesisDetailOutputType | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { thesisDetail({ token }).then(setD).catch((e) => setError(errMsg(e))); }, [token]);
  useEffect(load, [load]);

  if (!me.eligibleForThesis || !me.departmentId)
    return <Notice icon={Info} title="هنوز امکان ثبت پایان‌نامه ندارید" text="وضعیت اخذ درس پایان‌نامه و گروه آموزشی شما باید توسط مدیر سامانه ثبت شود. پس از آن می‌توانید موضوع خود را ثبت کنید." />;
  if (error) return <p className="text-destructive">{error}</p>;
  if (!d) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-72" /></div>;

  const t = d.thesis;
  const s = t?.status ?? 'NONE';
  const active = (k: string) => d.versions.find((v) => v.kind === k && v.isActive);
  const step = STEP_LABELS[t?.proposalStep ?? ''] ?? '';
  const lastIranDoc = d.iranDoc.find((r) => r.isActive) ?? d.iranDoc[0];
  const waiting: Record<string, string> = {
    WAITING_SUPERVISOR: 'درخواست شما برای استاد راهنما ارسال شده و منتظر پاسخ اوست.',
    GROUP_ASSIGNMENT: 'به دلیل رد مکرر، مدیر گروه استاد راهنمای شما را تعیین خواهد کرد.',
    GROUP_REVIEW: 'موضوع و استاد راهنما در حال بررسی توسط مدیر گروه است.',
    LITERATURE_SUPERVISOR_REVIEW: 'پیشینه تحقیق نزد استاد راهنما در حال بررسی است.',
    PROPOSAL_REVIEW: `پروپوزال نزد ${step} در حال بررسی است.`,
    IRANDOC_REVIEW: 'اطلاعات ایرانداک نزد تحصیلات تکمیلی در حال بررسی است. پس از تأیید، پایان‌نامهٔ شما مصوب می‌شود.',
    SPECIAL_COMMISSION: 'درخواست شما در نوبت بررسی کمیسیون موارد خاص است.',
    EXTENSION_REQUESTED: `درخواست تمدید نزد ${step} در حال بررسی است.`,
    FINAL_SUPERVISOR_REVIEW: 'نسخهٔ نهایی پایان‌نامه نزد استاد راهنما در حال بررسی است.',
    PLAGIARISM_CHECK: 'پایان‌نامهٔ شما در مرحلهٔ همانندجویی توسط تحصیلات تکمیلی است.',
    REVIEWER_ASSIGNMENT: 'مدیر گروه در حال تعیین داوران پایان‌نامهٔ شماست.',
    REVIEWING: 'پایان‌نامهٔ شما نزد داوران در حال بررسی است.',
    DEFENSE_SCHEDULING: 'داوران پایان‌نامه را قابل دفاع دانسته‌اند. زمان دفاع به‌زودی تعیین می‌شود.',
    DEFENSE_SCHEDULED: t?.defenseDate ? `جلسهٔ دفاع شما ${jalali(t.defenseDate, true)} در ${t.defenseLocation} برگزار می‌شود.` : '',
  };

  return (
    <div className="space-y-6">
      {t && <CaseHeader t={t} />}
      <StudentJourney status={s} />
      {['NONE', 'DRAFT', 'SUPERVISOR_REJECTED'].includes(s) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TopicForm thesis={t} onSaved={load} />
          {t ? <SupervisorPicker onDone={load} rejected={s === 'SUPERVISOR_REJECTED'} /> :
            <Notice icon={Info} title="گام بعد: انتخاب استاد راهنما" text="ابتدا پیش‌نویس موضوع را ذخیره کنید." />}
        </div>
      )}
      {s === 'TOPIC_REVISION' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TopicForm thesis={t} onSaved={load} />
          <DocumentSubmit kind="topic" lastComment={active('topic')?.reviewComment} onDone={load} />
        </div>
      )}
      {['LITERATURE_REVIEW', 'LITERATURE_REVISION'].includes(s) && <DocumentSubmit kind="literature" lastComment={active('literature')?.reviewComment} onDone={load} />}
      {['PROPOSAL_DRAFT', 'PROPOSAL_REVISION'].includes(s) && <DocumentSubmit kind="proposal" lastComment={s === 'PROPOSAL_REVISION' ? active('proposal')?.reviewComment : undefined} onDone={load} />}
      {s === 'IRANDOC_PENDING' && <IranDocForm lastComment={lastIranDoc?.reviewStatus === 'rejected' ? lastIranDoc.reviewComment : undefined} onDone={load} />}
      {s === 'EXTENSION_REQUIRED' && t && <ExtensionForm termsUsed={t.termsUsed} allowedTerms={t.allowedTerms} commissionTerm={me.commissionTermThreshold - 1} onDone={load} />}
      {waiting[s] && <Notice icon={Hourglass} title="در انتظار بررسی" text={waiting[s]} />}
      {s === 'THESIS_ACTIVE' && t && (
        <Notice icon={CheckCircle2} title="پایان‌نامهٔ شما مصوب و فعال است"
          text={`ترم ${fa(t.termsUsed)} از ${fa(t.allowedTerms)} ترم مجاز. پس از تکمیل نگارش، نسخهٔ نهایی را از فرم زیر ارسال کنید.`} />
      )}
      {['THESIS_ACTIVE', 'FINAL_REVISION'].includes(s) && <DocumentSubmit kind="final" lastComment={s === 'FINAL_REVISION' ? (active('final')?.reviewComment || 'لطفاً بر اساس نظرات داوران/همانندجویی، نسخهٔ اصلاح‌شده را ارسال کنید.') : undefined} onDone={load} />}
      {d.topicChangeAllowed && t && <TopicChangeForm currentTitle={t.titleFa} onDone={load} />}
      {s === 'DEFENDED' && t && <Notice icon={Award} title="تبریک! دفاع شما با موفقیت ثبت شد" text={`نمره: ${fa(t.defenseScore ?? 0)} — درجه: ${t.defenseGrade}. صورتجلسه از بخش «جلسهٔ دفاع» قابل دریافت است.`} />}
      {s === 'THESIS_COMPLETED' && <Notice icon={Hourglass} title="پایان‌نامه تکمیل شد" text="تحصیلات تکمیلی به‌زودی فرآیند فارغ‌التحصیلی را آغاز می‌کند." />}
      {t && <LockedBanner t={t} />}
      {t && <GraduationPanel thesisId={t.id} status={s} onChange={load} />}
      {['REJECTED', 'CANCELLED'].includes(s) && <Notice icon={XCircle} tone="text-destructive" title="پرونده بسته شده است" text="جزئیات و علت در تاریخچهٔ پرونده ثبت شده است." />}
      {t && <DefenseCard d={d} />}
      {t && <ProcessCards d={d} />}
      {t && <TopicChangesCard items={d.topicChanges} />}
      {t && <DefenseChangesCard items={d.defenseChanges} />}
      {t && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><Versions versions={d.versions} /></div>
          <Timeline items={d.timeline} requests={d.requests} />
        </div>
      )}
    </div>
  );
}
