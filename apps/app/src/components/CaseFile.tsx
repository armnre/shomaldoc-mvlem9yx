import { FileText, History, Landmark, CalendarClock, Paperclip } from 'lucide-react';
import type { ThesisDetailOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@project/components/ui/tabs';
import { Badge } from '@project/components/ui/badge';
import StatusBadge from './StatusBadge';
import Stepper from './Stepper';
import { ACTION_LABELS, fa, jalali, ROLE_LABELS, STATUS, STEP_LABELS } from '../lib/format';

type D = ThesisDetailOutputType;
type T = NonNullable<D['thesis']>;

const Field = ({ label, value }: { label: string; value: string }) => (
  <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value || '—'}</div></div>
);

export function CaseHeader({ t }: { t: T }) {
  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="font-mono text-xs text-muted-foreground">{t.code}</div>
            <h1 className="text-xl font-bold md:text-2xl">{t.titleFa || 'عنوان ثبت نشده'}</h1>
            {t.titleEn && <p dir="ltr" className="text-right text-sm text-muted-foreground">{t.titleEn}</p>}
          </div>
          <div className="text-left">
            <StatusBadge status={t.status} className="text-sm" />
            {['PROPOSAL_REVIEW', 'EXTENSION_REQUESTED'].includes(t.status) && t.proposalStep && <div className="mt-1 text-xs text-muted-foreground">نزد {STEP_LABELS[t.proposalStep]}</div>}
          </div>
        </div>
        <Stepper status={t.status} />
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Field label="دانشجو" value={t.studentName} />
          <Field label="شماره دانشجویی" value={t.studentNumber && fa(t.studentNumber)} />
          <Field label="گروه آموزشی" value={t.departmentName} />
          <Field label="استاد راهنما" value={t.supervisorName} />
          <Field label="استاد مشاور" value={t.advisorName} />
          <Field label="تاریخ تأیید موضوع" value={t.topicApprovedAt ? jalali(t.topicApprovedAt) : ''} />
          <Field label="تاریخ تصویب پروپوزال" value={t.proposalApprovedAt ? jalali(t.proposalApprovedAt) : ''} />
          <Field label="تاریخ تصویب نهایی" value={t.thesisApprovedAt ? jalali(t.thesisApprovedAt) : ''} />
          <Field label="ترم‌های سپری‌شده / مجاز" value={t.thesisApprovedAt ? `${fa(t.termsUsed)} از ${fa(t.allowedTerms)}` : ''} />
          <Field label="کلیدواژه‌ها" value={t.keywords} />
        </div>
      </CardContent>
    </Card>
  );
}

const KINDS = [
  { key: 'topic', label: 'موضوع' },
  { key: 'literature', label: 'پیشینه تحقیق' },
  { key: 'proposal', label: 'پروپوزال' },
  { key: 'final', label: 'نسخهٔ نهایی' },
];
const REVIEW: Record<string, string> = { submitted: 'در انتظار بررسی', approved: 'تأیید شده', revision: 'نیازمند اصلاح', superseded: 'جایگزین شده' };

export function Versions({ versions }: { versions: D['versions'] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> نسخه‌های مدارک</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="topic">
          <TabsList className="flex-wrap">{KINDS.map((k) => <TabsTrigger key={k.key} value={k.key}>{k.label}</TabsTrigger>)}</TabsList>
          {KINDS.map((k) => {
            const list = versions.filter((v) => v.kind === k.key);
            return (
              <TabsContent key={k.key} value={k.key} className="space-y-3">
                {list.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">نسخه‌ای ثبت نشده است.</p>}
                {list.map((v) => (
                  <details key={v.id} open={v.isActive} className="rounded-lg border p-3">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold">نسخه {fa(v.versionNumber)}</span>
                      {v.isActive && <Badge>فعال</Badge>}
                      <Badge variant="outline">{REVIEW[v.reviewStatus] ?? v.reviewStatus}</Badge>
                      <span className="text-muted-foreground">— {v.submittedBy}</span>
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-7">{v.content}</pre>
                    {v.reviewComment && <div className="mt-2 rounded-md bg-accent p-2 text-sm text-accent-foreground">نظر بررسی‌کننده: {v.reviewComment}</div>}
                    {v.files.map((f) => (
                      <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-primary underline">{f.name}</a>
                    ))}
                  </details>
                ))}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function Timeline({ items, requests }: { items: D['timeline']; requests: D['requests'] }) {
  const RS: Record<string, string> = { pending: 'در انتظار', accepted: 'پذیرفته', rejected: 'رد شده', withdrawn: 'لغو شده' };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> تاریخچه پرونده</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {requests.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted-foreground">درخواست‌های استاد راهنما</div>
            {requests.map((r) => (
              <div key={r.id} className="flex justify-between gap-2 text-sm">
                <span>{r.professorName}</span>
                <span className="text-muted-foreground">{RS[r.status] ?? r.status}{r.reason ? ` — ${r.reason}` : ''}</span>
              </div>
            ))}
          </div>
        )}
        <ol className="relative space-y-4 border-r pr-4">
          {items.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -right-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="text-sm font-medium">{ACTION_LABELS[e.action] ?? e.action}</div>
              <div className="text-xs text-muted-foreground">
                {e.actorName || '—'} ({ROLE_LABELS[e.role] ?? e.role}) · {jalali(e.at, true)}
              </div>
              {e.to && e.from !== e.to && <div className="text-xs text-muted-foreground">{STATUS[e.from]?.label ?? e.from ?? ''} ← {STATUS[e.to]?.label ?? e.to}</div>}
              {e.comment && <div className="mt-1 text-sm">{e.comment}</div>}
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-muted-foreground">رویدادی ثبت نشده است.</li>}
        </ol>
      </CardContent>
    </Card>
  );
}

const FileLinks = ({ files }: { files: { url: string; name: string }[] }) => (
  <div className="flex flex-wrap gap-2">
    {files.map((f) => (
      <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:bg-muted">
        <Paperclip className="h-3 w-3" />{f.name}
      </a>
    ))}
  </div>
);
const RV: Record<string, string> = { submitted: 'در انتظار بررسی', approved: 'تأیید شده', rejected: 'رد شده' };
const EX: Record<string, string> = { commission: 'در انتظار کمیسیون', in_review: 'در حال بررسی', approved: 'تأیید شده', rejected: 'رد شده' };

export function ProcessCards({ d }: { d: D }) {
  if (!d.iranDoc.length && !d.extensions.length) return null;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {d.iranDoc.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4" /> ایرانداک</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {d.iranDoc.map((r) => (
              <div key={r.id} className={`space-y-2 rounded-lg border p-3 text-sm ${r.isActive ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>کد پیگیری: <b dir="ltr">{fa(r.trackingCode)}</b></span>
                  <Badge variant={r.reviewStatus === 'rejected' ? 'destructive' : 'outline'}>{RV[r.reviewStatus] ?? r.reviewStatus}</Badge>
                </div>
                <div className="text-muted-foreground">تاریخ ثبت: {jalali(r.registeredOn)}</div>
                {r.reviewComment && <div className="rounded-md bg-accent p-2 text-accent-foreground">{r.reviewComment}</div>}
                <FileLinks files={[...r.receipt, ...r.certificate]} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {d.extensions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> تمدید و کمیسیون</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {d.extensions.map((e) => (
              <div key={e.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">درخواست تمدید (ترم {fa(e.termNumber)}){e.needsCommission && ' — نیازمند کمیسیون'}</span>
                  <Badge variant={e.status === 'rejected' ? 'destructive' : e.status === 'approved' ? 'default' : 'outline'}>{EX[e.status] ?? e.status}</Badge>
                </div>
                <p className="whitespace-pre-wrap">{e.reason}</p>
                <div className="text-xs text-muted-foreground">مسیر تأیید: {e.chain.split(',').filter(Boolean).map((x) => STEP_LABELS[x] ?? x).join(' ← ')}</div>
                {e.commissionNotes && <div className="rounded-md bg-accent p-2 text-accent-foreground">کمیسیون: {e.commissionNotes}</div>}
                {e.decisions && <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground">{fa(e.decisions)}</pre>}
                <FileLinks files={[...e.documents, ...e.commissionFiles]} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
