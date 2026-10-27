import type { ThesisDetailOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { ACTION_LABELS, STATUS, jalali } from '../lib/format';

type D = ThesisDetailOutputType;
const ORD = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];

/** Current status, last action, who acts next (derived server-side from status + org structure) and the supervisor/advisor committee with history. */
export default function NextActorCard({ d }: { d: D }) {
  const t = d.thesis;
  if (!t) return null;
  const last = d.timeline[0];
  const n = d.nextActor;
  const active = d.committee.filter((c) => c.isActive);
  const removed = d.committee.filter((c) => !c.isActive);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">وضعیت گردش‌کار و هیئت استادان</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-2">
        <dl className="space-y-2">
          <div><dt className="text-muted-foreground">وضعیت فعلی</dt><dd className="font-semibold">{STATUS[t.status]?.label ?? t.status}</dd></div>
          {last && <div><dt className="text-muted-foreground">آخرین اقدام</dt><dd>{ACTION_LABELS[last.action] ?? last.action} — {last.actorName || 'سامانه'} ({jalali(last.at, true)}){last.comment && <span className="block text-xs text-muted-foreground">توضیح/علت: {last.comment}</span>}</dd></div>}
          {n ? (
            <div className={n.isMe ? 'rounded-md border border-primary/40 bg-accent p-2' : ''}>
              <dt className="text-muted-foreground">مسئول اقدام بعدی</dt>
              <dd className="font-semibold">{n.roleLabel}{n.people.length ? `: ${n.people.join('، ')}` : ''}{n.isMe && ' (شما)'}</dd>
              <dd>اقدام مورد انتظار: {n.expected}</dd>
              <dd className="text-xs text-muted-foreground">محل انجام: {n.where}</dd>
            </div>
          ) : <div className="text-muted-foreground">اقدام بعدی تعریف نشده (پرونده بسته است).</div>}
        </dl>
        <div className="space-y-2">
          <div className="text-muted-foreground">استادان (سقف فعلی: {d.committeeLimits.maxSupervisors} راهنما، {d.committeeLimits.maxAdvisors} مشاور)</div>
          <ul className="space-y-1">
            {active.map((c) => <li key={c.id}>{c.role === 'supervisor' ? 'راهنمای' : 'مشاور'} {ORD[c.position - 1] ?? c.position}: <b>{c.name}</b>{c.assignedBy && <span className="text-xs text-muted-foreground"> — ثبت: {c.assignedBy}</span>}</li>)}
            {!active.length && <li className="text-muted-foreground">هنوز تعیین نشده</li>}
          </ul>
          {removed.length > 0 && (
            <details className="text-xs text-muted-foreground"><summary>سابقهٔ تغییر استادان ({removed.length})</summary>
              <ul className="mt-1 space-y-1">{removed.map((c) => <li key={c.id}>{c.role === 'supervisor' ? 'راهنما' : 'مشاور'}: {c.name} — حذف توسط {c.removedBy} ({jalali(c.removedAt, true)})</li>)}</ul>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
