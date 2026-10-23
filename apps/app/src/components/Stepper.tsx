import { Check } from 'lucide-react';
import { cn } from '@project/components/lib/utils';
import { fa, STAGES } from '../lib/format';

export default function Stepper({ status }: { status: string }) {
  const idx = STAGES.findIndex((s) => s.statuses.includes(status));
  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto" aria-label="مراحل پرونده">
      {STAGES.map((s, i) => {
        const done = idx > i || status === 'DEFENDED' || (status === 'PROPOSAL_APPROVED' && i <= idx);
        const cur = idx === i && !done;
        return (
          <li key={s.key} className="flex min-w-[110px] flex-1 items-center gap-2">
            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold',
              done && 'border-primary bg-primary text-primary-foreground',
              cur && 'border-primary bg-accent text-primary',
              !done && !cur && 'border-border text-muted-foreground')}>
              {done ? <Check className="h-4 w-4" /> : fa(i + 1)}
            </div>
            <span className={cn('whitespace-nowrap text-xs sm:text-sm', cur ? 'font-bold' : 'text-muted-foreground')}>{s.label}</span>
            {i < STAGES.length - 1 && <div className={cn('mx-1 h-0.5 flex-1', done ? 'bg-primary' : 'bg-border')} />}
          </li>
        );
      })}
    </ol>
  );
}
