import { useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { adminImportUsers, type AdminImportUsersInputType, type AdminImportUsersOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Checkbox } from '@project/components/ui/checkbox';
import { useSession } from '../../lib/session';
import { errMsg, fa } from '../../lib/format';
import { clean, readXlsx } from '../../lib/xlsx';

type Kind = AdminImportUsersInputType['kind'];
type Row = AdminImportUsersInputType['rows'][number];

// Find a column whose header contains every given word (after normalising ي/ك).
const col = (h: string[], ...words: string[]) => h.findIndex((x) => words.every((w) => x.includes(w)));

function toRows(table: string[][]): { kind: Kind; rows: Row[] } {
  const [head, ...body] = table;
  const h = (head ?? []).map(clean);
  const user = col(h, 'نام کاربری');
  if (user < 0) throw new Error('ستون «نام کاربری» در ردیف اول فایل پیدا نشد.');
  const g = (r: string[], i: number) => (i >= 0 ? clean(r[i] ?? '') : '');
  const dep = col(h, 'گروه');
  const isStudent = col(h, 'شماره دانشجویی') >= 0 || h.some((x) => x === 'نقش') && body.some((r) => g(r, col(h, 'نقش')).includes('دانشجو'));
  if (isStudent) {
    const first = h.findIndex((x) => x === 'نام'), last = col(h, 'نام خانوادگی'), full = col(h, 'نام و نام خانوادگی');
    const sn = col(h, 'شماره دانشجویی'), nc = col(h, 'ملی'), prog = col(h, 'رشته'), deg = col(h, 'مقطع'), el = col(h, 'پایان');
    return {
      kind: 'student',
      rows: body.map((r) => ({
        username: g(r, user), fullName: full >= 0 ? g(r, full) : `${g(r, first)} ${g(r, last)}`.trim(), department: g(r, dep),
        studentNumber: g(r, sn), nationalCode: g(r, nc), programName: g(r, prog), degree: g(r, deg),
        eligible: el < 0 ? true : !/خیر|نه|false|0/i.test(g(r, el)), academicRank: '', capacity: 0,
      })).filter((r) => r.username),
    };
  }
  const full = col(h, 'نام و نام خانوادگی'), rank = col(h, 'مرتبه'), cap = col(h, 'ظرفیت');
  return {
    kind: 'professor',
    rows: body.map((r) => ({
      username: g(r, user), fullName: g(r, full), department: g(r, dep), academicRank: g(r, rank), capacity: Number(g(r, cap)) || 0,
      studentNumber: '', nationalCode: '', programName: '', degree: '', eligible: false,
    })).filter((r) => r.username),
  };
}

export default function ImportUsersDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { token } = useSession();
  const [parsed, setParsed] = useState<{ kind: Kind; rows: Row[]; name: string } | null>(null);
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AdminImportUsersOutputType | null>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    try { setParsed({ ...toRows(await readXlsx(file)), name: file.name }); setResult(null); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const run = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      // Send in small batches: password hashing is deliberately slow, so one huge request could time out.
      const total: AdminImportUsersOutputType = { created: 0, updated: 0, skipped: 0, departmentsCreated: [], programsCreated: [], errors: [] };
      for (let i = 0; i < parsed.rows.length; i += 15) {
        setProgress(Math.round((i / parsed.rows.length) * 100));
        const part = await adminImportUsers({ token, kind: parsed.kind, resetPasswords: reset, rows: parsed.rows.slice(i, i + 15) });
        total.created += part.created; total.updated += part.updated; total.skipped += part.skipped;
        total.departmentsCreated.push(...part.departmentsCreated); total.programsCreated.push(...part.programsCreated);
        total.errors.push(...part.errors.map((e) => ({ ...e, row: e.row + i })));
      }
      const r = total;
      setResult(r);
      toast.success(`${fa(r.created)} کاربر جدید و ${fa(r.updated)} به‌روزرسانی`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); onDone(); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>ورود گروهی از اکسل</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">فایل ‎.xlsx دانشجویان (با ستون «شماره دانشجویی») یا استادان (با ستون «ظرفیت راهنمایی») را انتخاب کنید. نوع فایل خودکار تشخیص داده می‌شود. گروه‌های آموزشی و رشته‌هایی که در سامانه نیستند خودکار ساخته می‌شوند.</p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-muted/50">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            <span>{parsed ? parsed.name : 'انتخاب فایل اکسل'}</span>
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {parsed && (
            <div className="rounded-lg bg-muted p-3">
              نوع: <b>{parsed.kind === 'student' ? 'دانشجویان' : 'استادان'}</b> · تعداد ردیف: <b>{fa(parsed.rows.length)}</b>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {parsed.rows.slice(0, 3).map((r, i) => <li key={i} className="truncate">{r.username} — {r.fullName} — {r.department || 'بدون گروه'}</li>)}
              </ul>
            </div>
          )}
          <div className="rounded-lg border p-3 text-xs leading-6">
            <b>رمز اولیه:</b> دانشجویان ← کد ملی · استادان ← همان نام کاربری. همه در نخستین ورود ملزم به تغییر رمز هستند.
          </div>
          <label className="flex items-start gap-2 text-xs"><Checkbox checked={reset} onCheckedChange={(c) => setReset(!!c)} className="mt-0.5" />رمز کاربرانی که از قبل در سامانه هستند هم به رمز اولیه بازنشانی شود (پیش‌فرض: رمز فعلی‌شان حفظ می‌شود).</label>
          {result && (
            <div className="space-y-1 rounded-lg bg-muted p-3 text-xs">
              <div>جدید: <b>{fa(result.created)}</b> · به‌روزرسانی: <b>{fa(result.updated)}</b> · تکراری در فایل: <b>{fa(result.skipped)}</b> · خطا: <b>{fa(result.errors.length)}</b></div>
              {result.departmentsCreated.length > 0 && <div>گروه‌های ساخته‌شده: {result.departmentsCreated.join('، ')}</div>}
              {result.programsCreated.length > 0 && <div>رشته‌های ساخته‌شده: {result.programsCreated.join('، ')}</div>}
            </div>
          )}
          {result && result.errors.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-destructive/40 p-3 text-xs">
              {result.errors.map((e, i) => <div key={i}>ردیف {fa(e.row)} ({e.username}): {e.message}</div>)}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClose}>بستن</Button>
          <Button onClick={run} disabled={!parsed || busy}><Upload className="ml-1 h-4 w-4" />{busy ? `در حال ورود… ${fa(progress)}٪` : 'شروع ورود'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
