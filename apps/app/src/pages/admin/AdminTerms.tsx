import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, Play, Plus } from 'lucide-react';
import { academicTerms, runTermControl, type AcademicTermsOutputType, type RunTermControlOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Badge } from '@project/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { DatePicker } from '@project/components/ui/date-picker';
import { Skeleton } from '@project/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@project/components/ui/alert-dialog';
import { useSession } from '../../lib/session';
import { errMsg, fa, jalali } from '../../lib/format';

const iso = (d?: Date) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');

export default function AdminTerms() {
  const { token, role } = useSession();
  const [terms, setTerms] = useState<AcademicTermsOutputType['terms'] | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState<Date>();
  const [end, setEnd] = useState<Date>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunTermControlOutputType | null>(null);
  const load = useCallback((save?: { name: string; startDate: string; endDate: string }) =>
    academicTerms({ token, save }).then((r) => setTerms(r.terms)), [token]);
  useEffect(() => { load().catch((e) => toast.error(errMsg(e))); }, [load]);

  if (!['admin', 'graduate_office'].includes(role)) return <p className="text-muted-foreground">دسترسی به این بخش مجاز نیست.</p>;
  const add = async () => {
    setBusy(true);
    try {
      await load({ name, startDate: iso(start), endDate: iso(end) });
      setName(''); setStart(undefined); setEnd(undefined);
      toast.success('ترم ثبت شد.');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const run = async () => {
    setBusy(true);
    try {
      const r = await runTermControl({ token });
      setResult(r);
      await load();
      toast.success(r.processedTerms.length ? `${fa(r.processedTerms.length)} ترم پردازش شد.` : 'ترم پایان‌یافتهٔ پردازش‌نشده‌ای وجود ندارد.');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ترم‌های تحصیلی و کنترل پایان ترم</h1>
          <p className="text-sm text-muted-foreground">پس از پایان هر ترم، کنترل ترم را اجرا کنید تا پرونده‌های نیازمند تمدید شناسایی شوند.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="outline" disabled={busy}><Play className="ml-1 h-4 w-4" />اجرای کنترل ترم</Button></AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>اجرای کنترل پایان ترم</AlertDialogTitle>
              <AlertDialogDescription>برای هر ترم پایان‌یافته، یک ترم به پایان‌نامه‌های مصوب افزوده می‌شود و پرونده‌هایی که به سقف ترم مجاز رسیده‌اند به وضعیت «نیازمند تمدید» می‌روند. این عملیات برای هر ترم فقط یک‌بار انجام می‌شود.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2"><AlertDialogCancel>انصراف</AlertDialogCancel><AlertDialogAction onClick={run}>اجرا</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {result && result.flagged.length > 0 && (
        <Card className="border-destructive/30"><CardContent className="space-y-1 p-4 text-sm">
          <div className="font-semibold">پرونده‌های نیازمند تمدید:</div>
          {result.flagged.map((f) => <div key={f.code} className="font-mono">{f.code} — ترم {fa(f.termsUsed)} از {fa(f.allowedTerms)}</div>)}
        </CardContent></Card>
      )}
      {role === 'admin' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" />تعریف ترم</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5"><Label htmlFor="tn">عنوان</Label><Input id="tn" placeholder="نیمسال اول ۱۴۰۵-۱۴۰۶" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>شروع</Label><DatePicker value={start} onChange={setStart} /></div>
            <div className="space-y-1.5"><Label>پایان</Label><DatePicker value={end} onChange={setEnd} /></div>
            <Button onClick={add} disabled={busy || name.trim().length < 3 || !start || !end || start >= end}>ثبت</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="divide-y p-0">
          {!terms && <Skeleton className="m-4 h-12" />}
          {terms?.length === 0 && <p className="py-10 text-center text-muted-foreground">هنوز ترمی تعریف نشده است.</p>}
          {terms?.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="flex items-center gap-3">
                <CalendarRange className="h-5 w-5 text-primary" />
                <div><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{jalali(t.startDate)} تا {jalali(t.endDate)}</div></div>
              </div>
              {t.processed ? <Badge variant="secondary">کنترل شد — {jalali(t.processedAt)}</Badge> : <Badge variant="outline">در انتظار پایان ترم</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
