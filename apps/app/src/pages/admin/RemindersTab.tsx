import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Play, FlaskConical, Trash2 } from 'lucide-react';
import { reminderRules, runReminders, type ReminderRulesOutputType, type RunRemindersOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { Skeleton } from '@project/components/ui/skeleton';
import { Badge } from '@project/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import { useSession } from '../../lib/session';
import { errMsg, fa, ROLE_LABELS } from '../../lib/format';

type D = ReminderRulesOutputType;
type Rule = D['rules'][number];
const STAGE: Record<string, string> = { notify: 'اعلان', remind: 'یادآوری', escalate: 'ارتقا' };

export default function RemindersTab() {
  const { token } = useSession();
  const [d, setD] = useState<D | null>(null);
  const [res, setRes] = useState<RunRemindersOutputType | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { reminderRules({ token, op: 'list' }).then(setD).catch((e) => toast.error(errMsg(e))); }, [token]);
  useEffect(load, [load]);
  const run = async (dryRun: boolean) => {
    setBusy(true);
    try { const r = await runReminders({ token, dryRun }); setRes(r); toast.success(dryRun ? 'اجرای آزمایشی انجام شد (چیزی ارسال نشد).' : 'اجرای روزانه انجام شد.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (!d) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">قواعد یادآوری و ارتقا</CardTitle>
          <p className="text-sm text-muted-foreground">برای هر وضعیتِ منتظر اقدام: پس از «روز اعلان» به مسئول اعلان، پس از «روز یادآوری» یادآوری، و پس از «روز ارتقا» به نقش بالادست (مدیر گروه ← تحصیلات تکمیلی ← مدیر سیستم) ارجاع می‌شود. هر مرحله برای هر پرونده فقط یک‌بار ارسال می‌شود.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <RuleRow d={d} onSaved={setD} />
          <hr />
          {d.rules.length === 0 && <p className="text-sm text-muted-foreground">هنوز قاعده‌ای تعریف نشده است.</p>}
          {d.rules.map((r) => <RuleRow key={r.id} r={r} d={d} onSaved={setD} />)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اجرای روزانه</CardTitle>
          <p className="text-sm text-muted-foreground">اجرای روزانه روی سرور به‌صورت خودکار توسط زمان‌بند داخلی سرور (هر روز ساعت ۷ صبح به وقت تهران) انجام می‌شود. در صورت نیاز می‌توانید از این‌جا هم اجرا کنید. «اجرای آزمایشی» فقط نتیجه را نشان می‌دهد و چیزی ارسال نمی‌کند.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => run(true)}><FlaskConical className="h-4 w-4" />اجرای آزمایشی</Button>
            <Button disabled={busy} onClick={() => run(false)}><Play className="h-4 w-4" />اجرای روزانه و ارسال</Button>
          </div>
          {res && (res.events.length === 0 ? <p className="text-sm text-muted-foreground">هیچ پرونده‌ای از مهلت عبور نکرده است.</p> : (
            <div className="overflow-x-auto"><Table className="min-w-[560px]">
              <TableHeader><TableRow><TableHead>پرونده</TableHead><TableHead>وضعیت</TableHead><TableHead>روز انتظار</TableHead><TableHead>مرحله</TableHead><TableHead>گیرنده</TableHead><TableHead>نتیجه</TableHead></TableRow></TableHeader>
              <TableBody>{res.events.map((e, i) => (
                <TableRow key={i}><TableCell>{e.code}</TableCell><TableCell>{e.status}</TableCell><TableCell>{fa(e.days)}</TableCell><TableCell>{STAGE[e.stage]}</TableCell><TableCell>{fa(e.recipients)}</TableCell>
                  <TableCell>{e.duplicate ? <Badge variant="outline">قبلاً ارسال شده</Badge> : res.dryRun ? <Badge variant="secondary">ارسال می‌شود</Badge> : <Badge>ارسال شد</Badge>}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({ r, d, onSaved }: { r?: Rule; d: D; onSaved: (d: D) => void }) {
  const { token } = useSession();
  const [v, setV] = useState({ statusKey: r?.statusKey ?? '', notifyAfterDays: String(r?.notifyAfterDays ?? 3), remindAfterDays: String(r?.remindAfterDays ?? 7), escalateAfterDays: String(r?.escalateAfterDays ?? 14), escalateToRole: r?.escalateToRole ?? 'group_manager', isActive: r?.isActive ?? true });
  const n = (s: string) => Number(s) || 0;
  const valid = v.statusKey && n(v.notifyAfterDays) <= n(v.remindAfterDays) && n(v.remindAfterDays) <= n(v.escalateAfterDays);
  const call = async (op: 'save' | 'delete') => {
    try {
      onSaved(await reminderRules({ token, op, id: r?.id, rule: op === 'save' ? { statusKey: v.statusKey, notifyAfterDays: n(v.notifyAfterDays), remindAfterDays: n(v.remindAfterDays), escalateAfterDays: n(v.escalateAfterDays), escalateToRole: v.escalateToRole as 'group_manager', isActive: v.isActive } : undefined }));
      toast.success(op === 'save' ? 'قاعده ذخیره شد.' : 'قاعده حذف شد.');
    } catch (e) { toast.error(errMsg(e)); }
  };
  const num = (k: 'notifyAfterDays' | 'remindAfterDays' | 'escalateAfterDays', ph: string) => (
    <label className="space-y-1 text-[11px] text-muted-foreground lg:space-y-0"><span className="lg:sr-only">{ph}</span>
      <Input dir="ltr" inputMode="numeric" title={ph} placeholder={ph} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/\D/g, '') })} /></label>
  );
  return (
    <div className={`grid grid-cols-3 gap-2 rounded-xl border p-3 lg:grid-cols-[1.6fr_80px_80px_80px_1fr_auto_auto_auto] lg:items-center lg:rounded-none lg:border-0 lg:p-0 ${r ? '' : 'border-dashed bg-muted/30'}`}>
      <div className="col-span-3 lg:col-span-1">
      <Select value={v.statusKey || undefined} onValueChange={(x) => setV({ ...v, statusKey: x })}>
        <SelectTrigger><SelectValue placeholder="وضعیت منتظر اقدام" /></SelectTrigger>
        <SelectContent>{d.statuses.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      </div>
      {num('notifyAfterDays', 'روز اعلان')}{num('remindAfterDays', 'روز یادآوری')}{num('escalateAfterDays', 'روز ارتقا')}
      <div className="col-span-3 lg:col-span-1">
      <Select value={v.escalateToRole} onValueChange={(x) => setV({ ...v, escalateToRole: x })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{['group_manager', 'graduate_office', 'admin'].map((x) => <SelectItem key={x} value={x}>ارتقا به {ROLE_LABELS[x]}</SelectItem>)}</SelectContent>
      </Select>
      </div>
      <label className="flex items-center gap-1.5 text-xs"><Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />فعال</label>
      <Button variant={r ? 'outline' : 'default'} disabled={!valid} onClick={() => call('save')}>{r ? 'ذخیره' : 'افزودن'}</Button>
      {r ? <Button variant="ghost" size="icon" className="justify-self-end lg:justify-self-auto" aria-label="حذف" onClick={() => call('delete')}><Trash2 className="h-4 w-4" /></Button> : <span />}
    </div>
  );
}
