import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel } from 'lucide-react';
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
  const pending = items.filter((i) => i.verdict === 'pending' && i.thesisStatus === 'REVIEWING').length;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">پایان‌نامه‌های ارجاع‌شده برای داوری</h2>
        <p className="text-sm text-muted-foreground">{fa(pending)} مورد منتظر ثبت نظر شما</p>
      </div>
      {!items.length && (
        <Card><CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
          <Gavel className="h-8 w-8" />هنوز پایان‌نامه‌ای برای داوری به شما ارجاع نشده است.
        </CardContent></Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <Link key={i.reviewId} to={`/thesis/${i.thesisId}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-2 p-4">
                <div className="font-mono text-xs text-muted-foreground">{i.code} · دور {fa(i.round)}</div>
                <div className="font-semibold">{i.titleFa}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={i.thesisStatus} />
                  <Badge variant={i.verdict === 'pending' ? 'outline' : 'secondary'}>{VERDICT[i.verdict]}</Badge>
                  {i.defenseDate && <span className="text-xs text-muted-foreground">دفاع: {jalali(i.defenseDate, true)}</span>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
