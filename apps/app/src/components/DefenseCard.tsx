import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@project/components/ui/alert-dialog';
import { useState } from 'react';
import { toast } from 'sonner';
import { FileCheck2, Gavel, ScanSearch, Download } from 'lucide-react';
import { submitReview, type ThesisDetailOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@project/components/ui/radio-group';
import FileUploader, { type UploadedFile } from './FileUploader';
import { useSession } from '../lib/session';
import { errMsg, fa, jalali } from '../lib/format';

type D = ThesisDetailOutputType;
export const VERDICT: Record<string, string> = { pending: 'در انتظار داوری', approve: 'قابل دفاع', revise: 'نیازمند اصلاح', reject: 'رد' };

const Links = ({ files }: { files: { url: string; name: string }[] }) => (
  <div className="flex flex-wrap gap-2">
    {files.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{f.name}</a>)}
  </div>
);

export function DefenseCard({ d }: { d: D }) {
  const t = d.thesis!;
  if (t.similarityPercent == null && !d.reviews.length && !t.defenseDate) return null;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ScanSearch className="h-4 w-4" /> همانندجویی و داوری</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {t.similarityPercent != null && (
            <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <span>درصد همانندی: <b>{fa(t.similarityPercent)}٪</b></span>
              <Links files={t.plagiarismReport} />
            </div>
          )}
          {d.reviews.map((r) => (
            <div key={r.id} className="space-y-1 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{r.reviewerName || (r.reviewerType === 'external' ? 'داور خارجی' : 'داور داخلی')}{r.mine && ' (شما)'}</span>
                <div className="flex gap-1">
                  <Badge variant="outline">دور {fa(r.round)}</Badge>
                  <Badge variant={r.verdict === 'approve' ? 'default' : r.verdict === 'pending' ? 'outline' : 'destructive'}>{VERDICT[r.verdict] ?? r.verdict}</Badge>
                </div>
              </div>
              {r.score != null && <div className="text-muted-foreground">نمره: {fa(r.score)} · {jalali(r.submittedAt)}</div>}
              {r.comment && <p className="whitespace-pre-wrap">{r.comment}</p>}
              <Links files={r.files} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Gavel className="h-4 w-4" /> جلسهٔ دفاع</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!t.defenseDate && <p className="text-muted-foreground">زمان دفاع هنوز تعیین نشده است.</p>}
          {t.defenseDate && <div>زمان: <b>{jalali(t.defenseDate, true)}</b><br />محل: <b>{t.defenseLocation}</b></div>}
          {t.defenseScore != null && <div className="rounded-lg bg-accent p-3 text-accent-foreground">نمره: <b>{fa(t.defenseScore)}</b> از ۲۰ — درجه: <b>{t.defenseGrade}</b></div>}
          {t.minutesPdf.map((f) => (
            <Button key={f.url} asChild variant="outline" className="gap-2"><a href={f.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> دریافت صورتجلسهٔ دفاع (PDF)</a></Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReviewForm({ reviewId, onDone }: { reviewId: string; onDone: () => void }) {
  const { token } = useSession();
  const [verdict, setVerdict] = useState<'approve' | 'revise' | 'reject'>('approve');
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const valid = score !== '' && Number(score) >= 0 && Number(score) <= 20 && comment.trim().length >= 10;
  const submit = async () => {
    setBusy(true);
    try {
      await submitReview({ token, reviewId, verdict, score: Number(score), comment, files });
      toast.success('نظر داوری ثبت شد.');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const [confirm, setConfirm] = useState(false);
  const opts = [
    { k: 'approve' as const, d: 'قابل دفاع است', c: 'border-primary bg-primary/5' },
    { k: 'revise' as const, d: 'پس از اصلاحات قابل دفاع است', c: 'border-sidebar-primary bg-accent/50' },
    { k: 'reject' as const, d: 'قابل دفاع نیست', c: 'border-destructive bg-destructive/5' },
  ];
  const n = Number(score);
  return (
    <Card className="border-2 border-sidebar-primary/50">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base"><FileCheck2 className="h-5 w-5 text-sidebar-primary" /> ثبت نظر داوری</CardTitle>
        <p className="text-xs text-muted-foreground">فایل پایان‌نامه را از بخش «نسخه‌ها» در پایین صفحه دریافت کنید. نظر پس از ثبت نهایی قابل ویرایش نیست.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <RadioGroup value={verdict} onValueChange={(v) => setVerdict(v as typeof verdict)} className="grid gap-2 sm:grid-cols-3">
          {opts.map((o) => (
            <label key={o.k} className={`flex cursor-pointer items-start gap-2 rounded-xl border-2 p-3 transition-colors ${verdict === o.k ? o.c : 'border-border hover:bg-muted/50'}`}>
              <RadioGroupItem value={o.k} className="mt-0.5" />
              <span><span className="block text-sm font-bold">{VERDICT[o.k]}</span><span className="text-xs text-muted-foreground">{o.d}</span></span>
            </label>
          ))}
        </RadioGroup>
        <div className="space-y-1.5 sm:w-56">
          <Label htmlFor="rs">نمرهٔ پیشنهادی (۰ تا ۲۰)</Label>
          <Input id="rs" type="number" dir="ltr" min={0} max={20} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={score !== '' && (n < 0 || n > 20)} />
          {score !== '' && (n < 0 || n > 20) && <p className="text-xs text-destructive">نمره باید بین ۰ تا ۲۰ باشد.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc">نظر و اصلاحات پیشنهادی</Label>
          <Textarea id="rc" rows={6} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="نقاط قوت، ایرادات و اصلاحات لازم را بنویسید…" />
          <p className={`text-xs ${comment.trim().length >= 10 ? 'text-muted-foreground' : 'text-destructive/80'}`}>{fa(comment.trim().length)} نویسه — حداقل ۱۰ نویسه</p>
        </div>
        <FileUploader files={files} onChange={setFiles} />
        <Button className="w-full sm:w-auto" disabled={!valid || busy} onClick={() => setConfirm(true)}>{busy ? 'در حال ثبت…' : 'ثبت نهایی نظر داوری'}</Button>
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ثبت نهایی نظر داوری؟</AlertDialogTitle>
            <AlertDialogDescription>نتیجه: «{VERDICT[verdict]}» با نمرهٔ {fa(score)}. پس از ثبت، امکان ویرایش وجود ندارد.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>بازبینی</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirm(false); submit(); }}>ثبت نهایی</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
