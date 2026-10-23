import { useSession } from '../lib/session';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { thesisDetail, type ThesisDetailOutputType } from 'zitejs/api';
import { Skeleton } from '@project/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { CaseHeader, ProcessCards, Timeline, Versions } from '../components/CaseFile';
import ActionPanel from '../components/ActionPanel';
import { DefenseCard, ReviewForm } from '../components/DefenseCard';
import { errMsg } from '../lib/format';

export default function ThesisDetailPage() {
  const { token } = useSession();
  const { id } = useParams();
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
    <div className="space-y-6">
      <Link to={d.reviews.some((r) => r.mine) && !d.allowedActions.length ? "/" : "/theses"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> بازگشت به فهرست
      </Link>
      <CaseHeader t={t} />
      <ActionPanel thesisId={t.id} departmentId={t.departmentId} supervisorId={t.supervisorId} actions={d.allowedActions} onDone={load} />
      {(() => { const mine = d.reviews.find((r) => r.mine && r.verdict === 'pending'); return mine && t.status === 'REVIEWING' ? <ReviewForm reviewId={mine.id} onDone={load} /> : null; })()}
      <DefenseCard d={d} />
      <ProcessCards d={d} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">شرح مسئله و اهداف</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm leading-7">
              <p className="whitespace-pre-wrap">{t.problemStatement || '—'}</p>
              <p className="whitespace-pre-wrap">{t.objectives || '—'}</p>
            </CardContent>
          </Card>
          <Versions versions={d.versions} />
        </div>
        <Timeline items={d.timeline} requests={d.requests} />
      </div>
    </div>
  );
}
