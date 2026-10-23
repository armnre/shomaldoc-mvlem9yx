import { useState } from 'react';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Progress } from '@project/components/ui/progress';
import { cn } from '@project/components/lib/utils';
import { fa, STAGES, STATUS } from '../lib/format';

/** Stage timeline: compact on mobile (expandable), full vertical list on desktop. */
export default function StudentJourney({ status }: { status: string }) {
  const [open, setOpen] = useState(false);
  const idx = Math.max(0, STAGES.findIndex((s) => s.statuses.includes(status)));
  const finished = status === 'GRADUATED';
  const pct = finished ? 100 : Math.round((idx / STAGES.length) * 100);
  const label = STATUS[status]?.label ?? 'ثبت نشده';
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-2 bg-gradient-to-l from-primary to-primary/80 p-4 text-primary-foreground sm:p-5">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><MapPin className="h-5 w-5" />مسیر پایان‌نامه</span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">{fa(pct)}٪</span>
        </CardTitle>
        <div className="text-sm opacity-90">مرحلهٔ {fa(idx + 1)} از {fa(STAGES.length)}: <b>{STAGES[idx]?.label}</b></div>
        <Progress value={pct} className="h-2 bg-white/20" />
        <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-center gap-1 pt-1 text-xs opacity-90 lg:hidden" aria-expanded={open}>
          {open ? 'بستن مراحل' : 'نمایش همهٔ مراحل'}<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </CardHeader>
      <CardContent className={cn('p-4 sm:p-5 lg:block', !open && 'hidden')}>
        <ol className="relative">
          {STAGES.map((s, i) => {
            const done = finished || i < idx;
            const cur = !finished && i === idx;
            return (
              <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
                {i < STAGES.length - 1 && <span className={cn('absolute right-[13px] top-7 h-full w-0.5', done ? 'bg-primary' : 'bg-border')} />}
                <span className={cn('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                  done && 'border-primary bg-primary text-primary-foreground',
                  cur && 'border-sidebar-primary bg-accent text-accent-foreground ring-4 ring-accent',
                  !done && !cur && 'border-border bg-card text-muted-foreground')}>
                  {done ? <Check className="h-3.5 w-3.5" /> : fa(i + 1)}
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className={cn('text-sm', cur ? 'font-bold' : done ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</div>
                  {cur && <div className="mt-0.5 text-xs text-accent-foreground">شما اینجا هستید · {label}</div>}
                  {done && <div className="text-xs text-muted-foreground">تکمیل شده</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
