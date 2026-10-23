import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { cn } from '@project/components/lib/utils';
import { fromJalali, JMONTHS, monthLength, toJalali } from '../lib/jalali';
import { fa, jalali } from '../lib/format';

const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** Jalali date (and optional time) picker. Value/onChange use JS Date; callers store ISO. */
export default function JalaliDatePicker({ value, onChange, withTime, placeholder = 'انتخاب تاریخ', min }: {
  value?: Date; onChange: (d: Date | undefined) => void; withTime?: boolean; placeholder?: string; min?: Date;
}) {
  const init = toJalali(value ?? new Date());
  const [view, setView] = useState({ y: init.jy, m: init.jm });
  const [open, setOpen] = useState(false);
  const sel = value ? toJalali(value) : null;
  const today = toJalali(new Date());
  const firstDow = (fromJalali(view.y, view.m, 1).getDay() + 1) % 7; // Saturday = 0
  const len = monthLength(view.y, view.m);
  const shift = (n: number) => setView(({ y, m }) => { const t = y * 12 + (m - 1) + n; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; });
  const pick = (d: number) => {
    const dt = fromJalali(view.y, view.m, d);
    if (value && withTime) dt.setHours(value.getHours(), value.getMinutes());
    else if (withTime) dt.setHours(10, 0);
    onChange(dt);
    if (!withTime) setOpen(false);
  };
  const setTime = (t: string) => {
    const [h, mi] = t.split(':').map(Number);
    const dt = new Date(value ?? fromJalali(view.y, view.m, 1));
    dt.setHours(h || 0, mi || 0, 0, 0);
    onChange(dt);
  };
  const minDay = min ? new Date(min.getFullYear(), min.getMonth(), min.getDate()) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-start gap-2 font-normal', !value && 'text-muted-foreground')}>
          <CalendarDays className="h-4 w-4" />{value ? jalali(value.toISOString(), withTime) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" dir="rtl" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(-1)} aria-label="ماه قبل"><ChevronRight className="h-4 w-4" /></Button>
          <div className="flex items-center gap-1 text-sm font-semibold">
            {JMONTHS[view.m - 1]}
            <Input type="number" dir="ltr" className="h-7 w-20 text-center" value={view.y} onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) || v.y }))} aria-label="سال" />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(1)} aria-label="ماه بعد"><ChevronLeft className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEK.map((w) => <div key={w} className="py-1 text-muted-foreground">{w}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: len }, (_, i) => i + 1).map((d) => {
            const isSel = sel && sel.jy === view.y && sel.jm === view.m && sel.jd === d;
            const isToday = today.jy === view.y && today.jm === view.m && today.jd === d;
            const disabled = !!minDay && fromJalali(view.y, view.m, d) < minDay;
            return (
              <button key={d} type="button" disabled={disabled} onClick={() => pick(d)}
                className={cn('h-8 rounded-md text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30',
                  isToday && 'border border-primary', isSel && 'bg-primary text-primary-foreground hover:bg-primary')}>
                {fa(d)}
              </button>
            );
          })}
        </div>
        {withTime && (
          <div className="mt-3 flex items-center gap-2 border-t pt-3 text-sm">
            ساعت:
            <Input type="time" dir="ltr" className="h-8" value={value ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` : '10:00'} onChange={(e) => setTime(e.target.value)} />
            <Button size="sm" onClick={() => setOpen(false)}>تأیید</Button>
          </div>
        )}
        <div className="mt-2 flex justify-between">
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => { const t = toJalali(new Date()); setView({ y: t.jy, m: t.jm }); }}>امروز</Button>
          {value && <Button variant="link" size="sm" className="h-auto p-0 text-destructive" onClick={() => onChange(undefined)}>پاک کردن</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
