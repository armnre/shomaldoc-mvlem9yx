import { cn } from '@project/components/lib/utils';
import { STATUS } from '../lib/format';

const TONES = {
  gray: 'bg-muted text-muted-foreground',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

export default function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS[status] ?? { label: status || '—', tone: 'gray' as const };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[s.tone], className)}>
      {s.label}
    </span>
  );
}
