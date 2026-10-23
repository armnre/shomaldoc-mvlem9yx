import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Clock, Gavel } from 'lucide-react';
import { myReviews, type MyReviewsOutputType } from 'zitejs/api';
import { Card, CardContent } from '@project/components/ui/card';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import StatusBadge from './StatusBadge';
import { VERDICT } from './DefenseCard';
import { useSession } from '../lib/session';
import { errMsg, fa, jalali } from '../lib/format';

/** Reviewer inbox. `hideWhenEmpty` lets professors see it only when they have assignments. */
export default function ReviewerInbox({ hideWhenEmpty }: { hideWhenEmpty?: boolean }) {
  const { token } = useSession();
  const [items, setItems] = useState<MyReviewsOutputType['items'] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { myReviews({ token }).then((r) => setItems(r.items)).catch((e) => setError(errMsg(e))); }, [token]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) return hideWhenEmpty ? null : <Skeleton className="h-32" />;
  if (!items.length && hideWhenEmpty) return null;
  const isPending = (i: (typeof items)[number]) => i.verdict === 'pending' && i.thesisStatus === 'REVIEWING';
  const todo = items.filter(isPending);
  const done = items.filter((i) => !isPending(i));
  const Item = ({ i, hot }: { i: (typeof items)[number]; hot?: boolean }) => (
    <Link to={`/thesis/${i.thesisId}`} className="group block">
      <Card className={`h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md ${hot ? 'border-2 border-sidebar-primary/60' : ''}`}>
        <CardContent className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="font-mono text-[11px] text-muted-foreground">{i.code} · دور {fa(i.round)}</div>
            <div className="line-clamp-2 font-semibold">{i.titleFa}</div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={i.thesisStatus} />
              <Badge variant={i.verdict === 'pending' ? 'outline' : 'secondary'}>{VERDICT[i.verdict]}</Badge>
              {i.defenseDate && <span className="text-xs text-muted-foreground">دفاع: {jalali(i.defenseDate, true)}</span>}
            </div>
            {hot && <div className="text-xs font-medium text-primary">برای مطالعه و ثبت نظر کلیک کنید</div>}
          </div>
          <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">کارتابل داوری</h2>
          <p className="text-sm text-muted-foreground">پایان‌نامه‌های ارجاع‌شده به شما برای داوری</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 font-semibold text-accent-foreground"><Clock className="h-3.5 w-3.5" />{fa(todo.length)} منتظر نظر</span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />{fa(done.length)} انجام‌شده</span>
        </div>
      </div>
      {!items.length && (
        <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <Gavel className="h-8 w-8" />هنوز پایان‌نامه‌ای برای داوری به شما ارجاع نشده است.
        </CardContent></Card>
      )}
      {todo.length > 0 && <div className="grid gap-3 md:grid-cols-2">{todo.map((i) => <Item key={i.reviewId} i={i} hot />)}</div>}
      {done.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">داوری‌های پیشین</h3>
          <div className="grid gap-3 md:grid-cols-2">{done.map((i) => <Item key={i.reviewId} i={i} />)}</div>
        </div>
      )}
    </section>
  );
}
