import { Sparkles } from 'lucide-react';
import { cn } from '@project/components/lib/utils';

export default function DevCredit({ className, tone = 'default' }: { className?: string; tone?: 'default' | 'dark' }) {
  return (
    <a
      href="https://paramistech.ir/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="طراحی و توسعه: پارامیس تک"
      className={cn(
        'group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-all hover:-translate-y-0.5 hover:shadow-md',
        tone === 'dark'
          ? 'border-white/15 bg-white/5 text-white/70 hover:border-sidebar-primary/60 hover:text-white'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-sidebar-primary transition-transform group-hover:rotate-12" />
      <span>طراحی و توسعه</span>
      <span className="font-extrabold tracking-tight text-sidebar-primary">پارامیس تک</span>
    </a>
  );
}
