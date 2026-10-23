import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listReviewerCandidates, type ListReviewerCandidatesOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Checkbox } from '@project/components/ui/checkbox';
import { Badge } from '@project/components/ui/badge';
import JalaliDatePicker from './JalaliDatePicker';
import { useSession } from '../lib/session';
import { errMsg } from '../lib/format';

export type Stage4Values = {
  similarity: string;
  reviewers: { id: string; type: 'internal' | 'external' }[];
  defenseDate?: Date;
  defenseLocation: string;
  score: string;
  gapException: boolean;
};
export const EMPTY_STAGE4: Stage4Values = { similarity: '', reviewers: [], defenseLocation: '', score: '', gapException: false };

export function stage4Valid(action: string, v: Stage4Values) {
  const num = (s: string, max: number) => s.trim() !== '' && Number(s) >= 0 && Number(s) <= max;
  if (action.startsWith('plagiarism_')) return num(v.similarity, 100);
  if (action === 'assign_reviewers') return v.reviewers.length > 0;
  if (action === 'schedule_defense' || action === 'reschedule_defense') return !!v.defenseDate && v.defenseLocation.trim().length > 1;
  if (action === 'record_defense') return num(v.score, 20);
  return true;
}

export default function Stage4Fields({ action, thesisId, v, set }: { action: string; thesisId: string; v: Stage4Values; set: (v: Stage4Values) => void }) {
  if (action.startsWith('plagiarism_'))
    return (
      <div className="space-y-2">
        <Label htmlFor="sim">درصد همانندی گزارش‌شده</Label>
        <Input id="sim" type="number" min={0} max={100} step="0.1" dir="ltr" value={v.similarity} onChange={(e) => set({ ...v, similarity: e.target.value })} />
        <p className="text-xs text-muted-foreground">پیوست فایل گزارش همانندجویی الزامی است.</p>
      </div>
    );
  if (action === 'assign_reviewers') return <ReviewerPicker thesisId={thesisId} v={v} set={set} />;
  if (action === 'schedule_defense' || action === 'reschedule_defense')
    return (
      <div className="space-y-3">
        <div className="space-y-2"><Label>تاریخ و ساعت دفاع</Label><JalaliDatePicker withTime min={new Date()} value={v.defenseDate} onChange={(d) => set({ ...v, defenseDate: d })} /></div>
        <div className="space-y-2"><Label htmlFor="loc">محل برگزاری</Label><Input id="loc" value={v.defenseLocation} onChange={(e) => set({ ...v, defenseLocation: e.target.value })} placeholder="مثلاً: سالن جلسات دانشکده" /></div>
        <label className="flex items-start gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          <Checkbox checked={v.gapException} onCheckedChange={(c) => set({ ...v, gapException: !!c })} />
          <span>استثنای حداقل فاصلهٔ تصویب پروپوزال تا دفاع (فقط تحصیلات تکمیلی/مدیر سیستم؛ شرح مجوز در توضیحات الزامی است و در رویدادها ثبت می‌شود)</span>
        </label>
      </div>
    );
  if (action === 'record_defense')
    return (
      <div className="space-y-2">
        <Label htmlFor="sc">نمرهٔ نهایی دفاع (از ۲۰)</Label>
        <Input id="sc" type="number" min={0} max={20} step="0.25" dir="ltr" value={v.score} onChange={(e) => set({ ...v, score: e.target.value })} />
        <p className="text-xs text-muted-foreground">نمرهٔ کمتر از ۱۲ به معنای عدم قبولی است و پرونده برای اصلاح و دفاع مجدد برمی‌گردد. در صورت قبولی، صورتجلسهٔ PDF صادر می‌شود.</p>
      </div>
    );
  return null;
}

function ReviewerPicker({ thesisId, v, set }: { thesisId: string; v: Stage4Values; set: (v: Stage4Values) => void }) {
  const { token } = useSession();
  const [people, setPeople] = useState<ListReviewerCandidatesOutputType['people']>([]);
  useEffect(() => { listReviewerCandidates({ token, thesisId }).then((r) => setPeople(r.people)).catch((e) => toast.error(errMsg(e))); }, [thesisId, token]);
  const toggle = (id: string, on: boolean, same: boolean) =>
    set({ ...v, reviewers: on ? [...v.reviewers, { id, type: same ? 'internal' : 'external' }] : v.reviewers.filter((r) => r.id !== id) });
  return (
    <div className="space-y-2">
      <Label>داوران (داخلی: هم‌گروه، خارجی: سایر گروه‌ها / داوران مدعو)</Label>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
        {people.length === 0 && <p className="p-2 text-sm text-muted-foreground">موردی یافت نشد.</p>}
        {people.map((p) => {
          const on = v.reviewers.some((r) => r.id === p.id);
          return (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <Checkbox checked={on} onCheckedChange={(c) => toggle(p.id, !!c, p.sameDepartment)} />
              <span className="flex-1">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.department}</span>
              <Badge variant="outline">{p.sameDepartment ? 'داخلی' : 'خارجی'}</Badge>
            </label>
          );
        })}
      </div>
    </div>
  );
}
