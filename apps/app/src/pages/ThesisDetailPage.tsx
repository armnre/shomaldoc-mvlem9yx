import { useSession } from '../lib/session';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Hourglass } from 'lucide-react';
import { OWNER } from '../components/NextStepCard';
import { thesisDetail, type ThesisDetailOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import ApprovalDateCard from '../components/ApprovalDateCard';
import { CaseHeader, ProcessCards, Timeline, Versions } from '../components/CaseFile';
import ActionPanel from '../components/ActionPanel';
import NextActorCard from '../components/NextActorCard';
import { DefenseChangesCard, GraduationPanel, LockedBanner, TopicChangesCard } from '../components/CaseExtras';
import { DefenseCard, ReviewForm } from '../components/DefenseCard';
import { errMsg } from '../lib/format';

export default function ThesisDetailPage() {
  const { token } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState<ThesisDetailOutputType | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    thesisDetail({ token,  thesisId: id }).then(setD).catch((e) => setError(errMsg(e)));
  }, [id, token]);
  useEffect(load, [load]);

  if (error) return <p className="py-12 text-center text-destructive">{error}</p>;
  if (!d) return <div className="space-y-4"><Skeleton className="h-56" /><Skeleton className="h-64" /></div>;
  if (!d.thesis) return <p className="py-12 text-center text-muted-foreground">پرونده یافت نشد.</p>;
  const t = d.thesis;
  return (
    <div className="space-y-5 sm:space-y-6">
      <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> بازگشت
      </button>
      <CaseHeader t={t} />
      <LockedBanner t={t} />
      {!d.allowedActions.length && OWNER[t.status] && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <Hourglass className="h-5 w-5 shrink-0 text-primary" />
          <span>در حال حاضر اقدامی از سوی شما لازم نیست؛ پرونده نزد <b>{OWNER[t.status]}</b> است.</span>
        </div>
      )}
      <ActionPanel thesisId={t.id} departmentId={t.departmentId} supervisorId={t.supervisorId} actions={d.allowedActions} onDone={load} />
      {(() => { const mine = d.reviews.find((r) => r.mine && r.verdict === 'pending'); return mine && t.status === 'REVIEWING' ? <ReviewForm reviewId={mine.id} onDone={load} /> : null; })()}
      <ApprovalDateCard t={t} canEdit={d.canSetApprovalDate} onDone={load} />
      <DefenseCard d={d} />
      <GraduationPanel thesisId={t.id} status={t.status} onChange={load} />
      <TopicChangesCard items={d.topicChanges} />
      <DefenseChangesCard items={d.defenseChanges} />
      <NextActorCard d={d} />
      <ProcessCards d={d} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">شرح مسئله و اهداف</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm leading-7">
              <p className="whitespace-pre-wrap">{t.problemStatement || '—'}</p>
              <p className="whitespace-pre-wrap">{t.objectives || '—'}</p>
              {t.programName && <p className="text-muted-foreground">رشته/گرایش: {t.programName}</p>}
            </CardContent>
          </Card>
          <Versions versions={d.versions} />
        </div>
        <Timeline items={d.timeline} requests={d.requests} />
      </div>
    </div>
  );
}
