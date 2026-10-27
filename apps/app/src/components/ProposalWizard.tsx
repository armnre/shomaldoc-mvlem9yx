import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { listProfessors, proposalForm, saveProposalDraft, submitDocument, type ThesisDetailOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import DynamicForm, { fieldErrors, type FormField } from './DynamicForm';
import FileUploader, { type UploadedFile } from './FileUploader';
import ProfessorSlot, { type Prof } from './ProfessorSlot';
import ProgramPicker from './ProgramPicker';
import { useSession } from '../lib/session';
import { errMsg, fa } from '../lib/format';

type D = ThesisDetailOutputType;
type Draft = { answers: Record<string, string>; content: string; coSupervisorIds: string[]; advisorIds: string[]; files: UploadedFile[]; step: number };
const ORD = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم'];

function initialDraft(d: D, lsKey: string): Draft {
  const empty: Draft = { answers: {}, content: '', coSupervisorIds: [], advisorIds: d.committee.filter((c) => c.isActive && c.role === 'advisor').map((c) => c.professorId), files: [], step: 0 };
  const parse = (s: string | null) => { try { return s ? (JSON.parse(s) as Partial<Draft>) : null; } catch { return null; } };
  const server = parse(d.proposalDraft);
  const local = parse(localStorage.getItem(lsKey));
  return { ...empty, ...(server ?? {}), ...(local ?? {}) };
}

/** Multi-step proposal form: fill (autosaved per step) → upload file → submit for review — three distinct, trackable actions. */
export default function ProposalWizard({ d, onDone }: { d: D; onDone: () => void }) {
  const { token, me } = useSession();
  const t = d.thesis!;
  const lsKey = `proposal-draft:${t.id}`;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(d, lsKey));
  const [fields, setFields] = useState<FormField[]>([]);
  const [profs, setProfs] = useState<Prof[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const submitting = useRef(false);
  const { maxSupervisors, maxAdvisors } = d.committeeLimits;

  useEffect(() => {
    proposalForm({ token }).then((r) => setFields(r.fields)).catch((e) => toast.error(errMsg(e)));
    listProfessors({ token, departmentId: t.departmentId }).then((r) => setProfs(r.professors.filter((p) => p.id !== t.supervisorId))).catch((e) => toast.error(errMsg(e)));
  }, [token, t.departmentId, t.supervisorId]);
  useEffect(() => { localStorage.setItem(lsKey, JSON.stringify(draft)); }, [draft, lsKey]);

  const steps = useMemo(() => [
    { key: 'student', title: 'اطلاعات دانشجو' },
    { key: 'sup1', title: 'استاد راهنمای اول' },
    ...(maxSupervisors > 1 ? [{ key: 'sups', title: 'استادان راهنمای دیگر' }] : []),
    ...(maxAdvisors > 0 ? [{ key: 'advs', title: 'استادان مشاور' }] : []),
    { key: 'research', title: 'اطلاعات پژوهش' },
    { key: 'program', title: 'دانشکده، رشته و گرایش' },
    { key: 'file', title: 'بارگذاری فایل پروپوزال' },
    { key: 'review', title: 'مرور نهایی و ارسال' },
  ], [maxSupervisors, maxAdvisors]);
  const step = Math.min(draft.step, steps.length - 1);
  const cur = steps[step].key;
  const set = (p: Partial<Draft>) => setDraft((x) => ({ ...x, ...p }));

  const dynamic = fields.length > 0;
  const errorsFor = (key: string): string[] => {
    const e: string[] = [];
    if (key === 'sup1' && !t.supervisorId) e.push('استاد راهنمای اول برای پرونده ثبت نشده است.');
    if (key === 'sups') { if (draft.coSupervisorIds.some((x) => !x)) e.push('جایگاه خالی را انتخاب یا حذف کنید.'); if (1 + draft.coSupervisorIds.length > maxSupervisors) e.push(`حداکثر ${fa(maxSupervisors)} استاد راهنما مجاز است.`); }
    if (key === 'advs') { if (draft.advisorIds.some((x) => !x)) e.push('جایگاه خالی را انتخاب یا حذف کنید.'); if (draft.advisorIds.length > maxAdvisors) e.push(`حداکثر ${fa(maxAdvisors)} استاد مشاور مجاز است؛ موارد اضافه را حذف کنید.`); }
    if (key === 'research') {
      if (dynamic) e.push(...Object.values(fieldErrors(fields, draft.answers)));
      else if (draft.content.trim().length < 20) e.push('خلاصهٔ پروپوزال باید حداقل ۲۰ نویسه باشد.');
    }
    if (key === 'program' && !t.programId) e.push('دانشکده، رشته و گرایش را انتخاب و ذخیره کنید.');
    if (key === 'file' && !draft.files.length) e.push('فایل پروپوزال (Word یا PDF) را بارگذاری کنید.');
    return e;
  };
  const allErrors = steps.slice(0, -1).flatMap((s) => errorsFor(s.key).map((m) => `${s.title}: ${m}`));
  const stepDone = (k: string) => errorsFor(k).length === 0;

  const persist = async (next: Draft) => {
    try { const r = await saveProposalDraft({ token, draft: next }); setSavedAt(r.savedAt); }
    catch (e) { toast.error(`ذخیرهٔ پیش‌نویس روی سرور انجام نشد (نسخهٔ محلی حفظ شد): ${errMsg(e)}`); }
  };
  const go = (to: number) => {
    if (to > step && errorsFor(cur).length) { setTouched(true); return; }
    setTouched(false);
    const next = { ...draft, step: to };
    setDraft(next);
    void persist(next);
  };
  const submit = async () => {
    if (submitting.current || allErrors.length) return;
    submitting.current = true; setBusy(true);
    try {
      await submitDocument({ token, kind: 'proposal', content: draft.content, files: draft.files, formAnswers: dynamic ? draft.answers : undefined, coSupervisorIds: draft.coSupervisorIds, advisorIds: draft.advisorIds });
      localStorage.removeItem(lsKey);
      toast.success('پروپوزال برای بررسی ارسال شد.');
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const taken = [t.supervisorId, ...draft.coSupervisorIds, ...draft.advisorIds].filter(Boolean);
  const nameOf = (id: string) => profs.find((p) => p.id === id)?.name ?? '—';
  const lastComment = t.status === 'PROPOSAL_REVISION' ? d.versions.find((v) => v.kind === 'proposal' && v.isActive)?.reviewComment : '';

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">فرم پروپوزال — مرحلهٔ {fa(step + 1)} از {fa(steps.length)}: {steps[step].title}</CardTitle>
          {savedAt && <span className="text-xs text-muted-foreground">پیش‌نویس ذخیره شد</span>}
        </div>
        <ol className="flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button type="button" onClick={() => (i <= step ? go(i) : undefined)} disabled={i > step}
                className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs', i === step ? 'border-primary bg-primary text-primary-foreground' : i < step && stepDone(s.key) ? 'border-primary/40 bg-accent' : 'text-muted-foreground')}>
                {i < step && stepDone(s.key) ? <Check className="h-3 w-3" /> : fa(i + 1)} {s.title}
              </button>
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastComment && <div className="rounded-md border border-amber-300 bg-accent p-3 text-sm">علت برگشت: {lastComment}</div>}
        {cur === 'student' && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">نام دانشجو</dt><dd className="font-semibold">{t.studentName || me.fullName}</dd></div>
            <div><dt className="text-muted-foreground">شماره دانشجویی</dt><dd className="font-semibold">{t.studentNumber || '—'}</dd></div>
            <div><dt className="text-muted-foreground">گروه آموزشی</dt><dd className="font-semibold">{t.departmentName || '—'}</dd></div>
            <div><dt className="text-muted-foreground">عنوان پایان‌نامه</dt><dd className="font-semibold">{t.titleFa}</dd></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">این اطلاعات از پروفایل و پروندهٔ شما خوانده می‌شود؛ برای اصلاح با مدیر سامانه تماس بگیرید.</p>
          </dl>
        )}
        {cur === 'sup1' && <p className="text-sm">استاد راهنمای اول: <b>{t.supervisorName || '—'}</b><span className="block text-xs text-muted-foreground">این جایگاه از پذیرش/تخصیص رسمی در مرحلهٔ موضوع تعیین شده و اینجا قابل تغییر نیست.</span></p>}
        {cur === 'sups' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">حداکثر {fa(maxSupervisors)} استاد راهنما (شامل راهنمای اول) طبق تنظیمات سامانه. این جایگاه اختیاری است.</p>
            {draft.coSupervisorIds.map((id, i) => (
              <ProfessorSlot key={i} label={`استاد راهنمای ${ORD[i + 1] ?? fa(i + 2)}`} value={id} profs={profs} taken={taken}
                onChange={(v) => set({ coSupervisorIds: draft.coSupervisorIds.map((x, j) => (j === i ? v : x)) })}
                onRemove={() => set({ coSupervisorIds: draft.coSupervisorIds.filter((_, j) => j !== i) })} />
            ))}
            {1 + draft.coSupervisorIds.length < maxSupervisors && <Button type="button" variant="outline" size="sm" onClick={() => set({ coSupervisorIds: [...draft.coSupervisorIds, ''] })}><Plus className="ml-1 h-4 w-4" />افزودن استاد راهنما</Button>}
          </div>
        )}
        {cur === 'advs' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">حداکثر {fa(maxAdvisors)} استاد مشاور طبق تنظیمات سامانه. این جایگاه اختیاری است.</p>
            {draft.advisorIds.map((id, i) => (
              <ProfessorSlot key={i} label={`استاد مشاور ${ORD[i] ?? fa(i + 1)}`} value={id} profs={profs} taken={taken}
                onChange={(v) => set({ advisorIds: draft.advisorIds.map((x, j) => (j === i ? v : x)) })}
                onRemove={() => set({ advisorIds: draft.advisorIds.filter((_, j) => j !== i) })} />
            ))}
            {draft.advisorIds.length < maxAdvisors && <Button type="button" variant="outline" size="sm" onClick={() => set({ advisorIds: [...draft.advisorIds, ''] })}><Plus className="ml-1 h-4 w-4" />افزودن استاد مشاور</Button>}
          </div>
        )}
        {cur === 'research' && (
          <div className="space-y-4">
            {dynamic && <DynamicForm fields={fields} value={draft.answers} onChange={(answers) => set({ answers })} showErrors={touched} />}
            <div className="space-y-1.5">
              <Label htmlFor="pc">{dynamic ? 'توضیحات تکمیلی (اختیاری)' : 'خلاصهٔ پروپوزال (روش تحقیق، سؤالات/فرضیه‌ها، زمان‌بندی)'}</Label>
              <Textarea id="pc" rows={7} value={draft.content} onChange={(e) => set({ content: e.target.value })} />
            </div>
          </div>
        )}
        {cur === 'program' && <ProgramPicker thesisId={t.id} initial={{ programId: t.programId, faculty: t.programFaculty, major: t.programMajor }} onDone={onDone} />}
        {cur === 'file' && <FileUploader files={draft.files} onChange={(files) => { const next = { ...draft, files }; setDraft(next); void persist(next); }} />}
        {cur === 'review' && (
          <div className="space-y-3 text-sm">
            <ul className="space-y-1">
              <li>راهنمای اول: <b>{t.supervisorName}</b></li>
              {draft.coSupervisorIds.map((id, i) => <li key={id + i}>راهنمای {ORD[i + 1]}: <b>{nameOf(id)}</b></li>)}
              {draft.advisorIds.map((id, i) => <li key={id + i}>مشاور {ORD[i]}: <b>{nameOf(id)}</b></li>)}
              <li>رشته: <b>{t.programName || '—'}</b></li>
              <li>فایل: <b>{draft.files.map((f) => f.filename).join('، ') || '—'}</b></li>
            </ul>
            {allErrors.length > 0 && <ul className="list-inside list-disc rounded-md border border-destructive/40 p-3 text-destructive">{allErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
        {touched && errorsFor(cur).length > 0 && cur !== 'research' && <ul className="text-xs text-destructive">{errorsFor(cur).map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => go(step - 1)}><ChevronRight className="ml-1 h-4 w-4" />مرحلهٔ قبل</Button>
          {cur === 'review'
            ? <Button disabled={busy || allErrors.length > 0} onClick={submit}>{busy ? 'در حال ارسال…' : 'ارسال برای بررسی'}</Button>
            : <Button type="button" onClick={() => go(step + 1)}>ذخیره و مرحلهٔ بعد<ChevronLeft className="mr-1 h-4 w-4" /></Button>}
        </div>
      </CardContent>
    </Card>
  );
}
