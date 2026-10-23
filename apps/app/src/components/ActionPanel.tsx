import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listProfessors, thesisAction, type ListProfessorsOutputType, type ThesisActionInputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import FileUploader, { type UploadedFile } from './FileUploader';
import Stage4Fields, { EMPTY_STAGE4, stage4Valid, type Stage4Values } from './Stage4Fields';
import { useSession } from '../lib/session';
import { ACTION_LABELS, errMsg, fa } from '../lib/format';

type Action = ThesisActionInputType['action'];
const NEEDS_COMMENT: Action[] = ['supervisor_reject', 'group_topic_revision', 'group_reject', 'literature_revision', 'proposal_revision', 'irandoc_reject', 'commission_approve', 'commission_reject', 'extension_reject', 'cancel', 'final_revision', 'plagiarism_fail', 'topic_change_reject', 'reschedule_defense', 'reopen_case'];
const NEEDS_PROF: Action[] = ['group_assign_supervisor'];
const OPTIONAL_PROF: Action[] = ['group_approve_topic', 'set_advisor'];
const WITH_FILES: Action[] = ['irandoc_approve', 'commission_approve', 'commission_reject', 'plagiarism_pass', 'plagiarism_fail', 'confirm_completion'];
const DANGER: Action[] = ['topic_change_reject', 'reopen_case', 'supervisor_reject', 'group_reject', 'cancel', 'group_topic_revision', 'literature_revision', 'proposal_revision', 'irandoc_reject', 'commission_reject', 'extension_reject', 'final_revision', 'plagiarism_fail'];
const REJECT_REASONS = ['تکمیل ظرفیت', 'عدم تناسب موضوع با تخصص', 'نیاز به تعریف دقیق‌تر موضوع'];
const HINTS: Partial<Record<Action, string>> = {
  irandoc_approve: 'با تأیید، پیش‌شرط‌های تصویب نهایی (موضوع، راهنما، پروپوزال و فایل آن، کد/رسید/گواهی ایرانداک) به‌طور خودکار بررسی و در صورت کامل‌بودن، پایان‌نامه مصوب می‌شود. اگر گواهی توسط دانشجو بارگذاری نشده، آن را اینجا پیوست کنید.',
  commission_approve: 'نتیجه و صورتجلسهٔ کمیسیون موارد خاص را ثبت کنید. پس از موافقت، درخواست تمدید وارد زنجیرهٔ تأیید می‌شود.',
  commission_reject: 'با مخالفت کمیسیون، پرونده رد می‌شود.',
  final_approve: 'با تأیید، نسخهٔ نهایی برای همانندجویی به تحصیلات تکمیلی ارسال می‌شود.',
  plagiarism_pass: 'درصد همانندی و فایل گزارش را ثبت کنید. در صورت مجاز بودن، پرونده برای تعیین داوران به گروه ارجاع می‌شود.',
  plagiarism_fail: 'پرونده برای اصلاح نسخهٔ نهایی به دانشجو برمی‌گردد.',
  assign_reviewers: 'داوران انتخاب‌شده از طریق اعلان مطلع می‌شوند و نظر داوری خود را در سامانه ثبت می‌کنند.',
  cancel: 'لغو پرونده غیرقابل بازگشت است و ظرفیت استاد آزاد می‌شود.',
  reschedule_defense: 'تاریخ و محل قبلی، علت و نام شما در تاریخچهٔ تغییرات دفاع ثبت می‌شود و دانشجو، استادان و داوران مطلع می‌شوند. تاریخ‌های گذشته، کمتر از حداقل فاصله با تصویب پروپوزال، یا متداخل با دفاع دیگر پذیرفته نمی‌شود.',
  schedule_defense: 'حداقل فاصلهٔ تصویب پروپوزال تا دفاع و تداخل محل/اعضای هیئت به‌طور خودکار کنترل می‌شود.',
  topic_change_approve: 'در صورت تأیید نهایی، عنوان پرونده به عنوان جدید تغییر می‌کند و نسخهٔ موضوع ثبت می‌شود.',
  confirm_completion: 'نسخهٔ اصلاح‌شدهٔ پس از دفاع را (در صورت وجود) پیوست کنید. سپس تحصیلات تکمیلی فرآیند فارغ‌التحصیلی را آغاز می‌کند.',
  start_graduation: 'چک‌لیست مدارک فارغ‌التحصیلی (طبق تنظیمات) برای دانشجو ایجاد می‌شود.',
  graduate: 'فقط وقتی همهٔ مدارک چک‌لیست تأیید شده باشند ممکن است. پس از آن پرونده بسته و قفل می‌شود.',
  reopen_case: 'پروندهٔ بسته برای ویرایش باز می‌شود. علت در رویدادها ثبت می‌شود.',
};

export default function ActionPanel(props: { thesisId: string; departmentId: string; supervisorId: string; actions: string[]; onDone: () => void }) {
  const { token } = useSession();
  const [open, setOpen] = useState<Action | null>(null);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [s4, setS4] = useState<Stage4Values>(EMPTY_STAGE4);
  const [busy, setBusy] = useState(false);
  const [profs, setProfs] = useState<ListProfessorsOutputType['professors']>([]);
  useEffect(() => {
    if (open && (NEEDS_PROF.includes(open) || OPTIONAL_PROF.includes(open)))
      listProfessors({ token, departmentId: props.departmentId }).then((r) => setProfs(r.professors)).catch((e) => toast.error(errMsg(e)));
  }, [open, props.departmentId, token]);

  if (!props.actions.length) return null;
  const start = (a: Action) => { setOpen(a); setComment(''); setReason(''); setTarget(''); setFiles([]); setS4(EMPTY_STAGE4); };
  const finalComment = open === 'supervisor_reject' && reason && reason !== 'other' ? `${reason}${comment ? ` — ${comment}` : ''}` : comment;
  const valid = open && (!NEEDS_COMMENT.includes(open) || finalComment.trim().length >= 3) && (!NEEDS_PROF.includes(open) || target) && stage4Valid(open, s4) && (!open.startsWith('plagiarism_') || files.length > 0);

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await thesisAction({ token, thesisId: props.thesisId, action: open, comment: finalComment || undefined, targetId: target || undefined, files,
        similarity: s4.similarity ? Number(s4.similarity) : undefined, reviewers: s4.reviewers.length ? s4.reviewers : undefined,
        defenseDate: s4.defenseDate?.toISOString(), defenseLocation: s4.defenseLocation || undefined, score: s4.score ? Number(s4.score) : undefined, gapException: s4.gapException || undefined,
      });
      toast.success('عملیات با موفقیت ثبت شد.');
      setOpen(null);
      props.onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-l from-accent/60 to-card">
      <CardHeader className="pb-3"><CardTitle className="text-base">اقدامات مجاز شما روی این پرونده</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {props.actions.map((a) => (
          <Button key={a} variant={DANGER.includes(a as Action) ? 'outline' : 'default'} onClick={() => start(a as Action)}>{ACTION_LABELS[a] ?? a}</Button>
        ))}
      </CardContent>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open && ACTION_LABELS[open]}</DialogTitle>
            {open && HINTS[open] && <DialogDescription>{HINTS[open]}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4">
            {open === 'supervisor_reject' && (
              <div className="space-y-2">
                <Label>علت رد</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="انتخاب علت" /></SelectTrigger>
                  <SelectContent>
                    {REJECT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    <SelectItem value="other">سایر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {open && (NEEDS_PROF.includes(open) || OPTIONAL_PROF.includes(open)) && (
              <div className="space-y-2">
                <Label>{open === 'group_assign_supervisor' ? 'استاد راهنما' : 'استاد مشاور (اختیاری)'}</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger><SelectValue placeholder="انتخاب استاد" /></SelectTrigger>
                  <SelectContent>
                    {profs.filter((p) => p.id !== props.supervisorId).map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={open === 'group_assign_supervisor' && p.remaining <= 0}>
                        {p.name} — ظرفیت باقی‌مانده: {fa(Math.max(0, p.remaining))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {open && <Stage4Fields action={open} thesisId={props.thesisId} v={s4} set={setS4} />}
            <div className="space-y-2">
              <Label htmlFor="cm">{open && NEEDS_COMMENT.includes(open) ? 'توضیح / علت (الزامی)' : 'توضیح (اختیاری)'}</Label>
              <Textarea id="cm" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            {open && WITH_FILES.includes(open) && <FileUploader files={files} onChange={setFiles} />}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(null)}>انصراف</Button>
            <Button onClick={submit} disabled={!valid || busy} variant={open && DANGER.includes(open) ? 'destructive' : 'default'}>{busy ? 'در حال ثبت…' : 'تأیید و ثبت'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
