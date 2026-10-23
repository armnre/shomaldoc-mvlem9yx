import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, Loader2, RotateCcw, Search } from 'lucide-react';
import writeXlsxFile from 'write-excel-file/browser';
import { reportTheses, type ReportThesesInputType, type ReportThesesOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import JalaliDatePicker from './JalaliDatePicker';
import StatusBadge from './StatusBadge';
import { useSession } from '../lib/session';
import { errMsg, fa, jalali, STATUS } from '../lib/format';

type Filters = NonNullable<ReportThesesInputType['filters']>;
type Opts = NonNullable<ReportThesesOutputType['options']>;
type Row = NonNullable<ReportThesesOutputType['rows']>[number];
const ALL = '__all';

function Pick({ label, value, onChange, items }: { label: string; value?: string; onChange: (v?: string) => void; items: { id: string; name: string }[] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>همه</SelectItem>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export default function ThesisReport({ scope }: { scope: 'group_manager' | 'graduate_office' | 'admin' }) {
  const { token } = useSession();
  const [opts, setOpts] = useState<Opts | null>(null);
  const [f, setF] = useState<Filters>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<'' | 'rows' | 'pdf' | 'xlsx'>('');
  const set = (k: keyof Filters) => (v?: string | number) => setF((o) => ({ ...o, [k]: v }));

  const run = async (filters = f) => {
    setBusy('rows');
    try { setRows((await reportTheses({ token, scope, op: 'rows', filters })).rows ?? []); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  useEffect(() => {
    reportTheses({ token, scope, op: 'options' }).then((r) => setOpts(r.options ?? null)).catch((e) => toast.error(errMsg(e)));
    run({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scope]);

  const pdf = async () => {
    setBusy('pdf');
    try { const r = await reportTheses({ token, scope, op: 'pdf', filters: f }); if (r.pdfUrl) { const a = document.createElement('a'); a.href = r.pdfUrl; a.download = `shomaldoc-report-${Date.now()}.pdf`; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); } }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const xlsx = async () => {
    if (!rows?.length) return toast.error('ردیفی برای خروجی وجود ندارد.');
    setBusy('xlsx');
    try {
      const H = ['کد پرونده', 'عنوان', 'دانشجو', 'شماره دانشجویی', 'استاد راهنما', 'دانشکده', 'گروه', 'رشته', 'گرایش', 'وضعیت', 'تاریخ ثبت', 'نمرهٔ دفاع', 'همانندی٪', 'کد ایرانداک'];
      const data = [
        H.map((h) => ({ value: h, fontWeight: 'bold' as const, backgroundColor: '#E8EDF7' })),
        ...rows.map((r) => [r.code, r.title, r.student, r.studentNumber, r.supervisor, r.faculty, r.department, r.program, r.specialization, r.statusLabel, jalali(r.created), r.defenseScore ?? '', r.similarity ?? '', r.irandocCode]
          .map((v) => ({ value: v as string | number, type: typeof v === 'number' ? Number : String }))),
      ];
      await writeXlsxFile(data as never, { rightToLeft: true, columns: H.map((_, i) => ({ width: i === 1 ? 50 : 18 })) } as never, { fontFamily: 'Tahoma' }).toFile(`shomaldoc-report-${Date.now()}.xlsx`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };

  const statuses = Object.entries(STATUS).map(([id, s]) => ({ id, name: s.label }));
  const years = Array.from({ length: 8 }, (_, i) => 1405 - i).map((y) => ({ id: String(y), name: fa(y) }));
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">گزارش تفصیلی و جستجوی پیشرفته</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={xlsx} disabled={!!busy}>{busy === 'xlsx' ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="ml-1 h-4 w-4" />}Excel</Button>
          <Button size="sm" variant="outline" onClick={pdf} disabled={!!busy}>{busy === 'pdf' ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <FileDown className="ml-1 h-4 w-4" />}PDF</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rq" className="text-xs">جستجو (عنوان، کد پرونده، نام/شماره دانشجو، کد پیگیری ایرانداک)</Label>
            <Input id="rq" value={f.q ?? ''} onChange={(e) => set('q')(e.target.value || undefined)} onKeyDown={(e) => e.key === 'Enter' && run()} />
          </div>
          <Pick label="دانشکده" value={f.facultyId} onChange={set('facultyId')} items={opts?.faculties ?? []} />
          <Pick label="گروه آموزشی" value={f.departmentId} onChange={set('departmentId')} items={opts?.departments ?? []} />
          <Pick label="رشته" value={f.programId} onChange={set('programId')} items={opts?.programs ?? []} />
          <Pick label="گرایش" value={f.specialization} onChange={set('specialization')} items={(opts?.specializations ?? []).map((s) => ({ id: s, name: s }))} />
          <Pick label="استاد راهنما" value={f.supervisorId} onChange={set('supervisorId')} items={opts?.supervisors ?? []} />
          <Pick label="ترم" value={f.termId} onChange={set('termId')} items={opts?.terms ?? []} />
          <Pick label="سال (شمسی)" value={f.jalaliYear ? String(f.jalaliYear) : undefined} onChange={(v) => set('jalaliYear')(v ? Number(v) : undefined)} items={years} />
          <Pick label="وضعیت" value={f.status} onChange={set('status')} items={statuses} />
          <div className="space-y-1.5"><Label className="text-xs">از تاریخ</Label><JalaliDatePicker value={f.dateFrom ? new Date(f.dateFrom) : undefined} onChange={(d) => set('dateFrom')(d?.toISOString())} /></div>
          <div className="space-y-1.5"><Label className="text-xs">تا تاریخ</Label><JalaliDatePicker value={f.dateTo ? new Date(f.dateTo) : undefined} onChange={(d) => set('dateTo')(d?.toISOString())} /></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => run()} disabled={!!busy}>{busy === 'rows' ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Search className="ml-1 h-4 w-4" />}اعمال فیلتر</Button>
          <Button variant="ghost" onClick={() => { setF({}); run({}); }}><RotateCcw className="ml-1 h-4 w-4" />پاک‌کردن</Button>
          {rows && <span className="mr-auto self-center text-sm text-muted-foreground">{fa(rows.length)} پرونده</span>}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>کد</TableHead><TableHead>عنوان</TableHead><TableHead>دانشجو</TableHead><TableHead>استاد</TableHead><TableHead>گروه</TableHead><TableHead>وضعیت</TableHead><TableHead>ثبت</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows?.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">پرونده‌ای با این فیلترها یافت نشد.</TableCell></TableRow>}
              {rows?.slice(0, 200).map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.title}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.student}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.supervisor || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.department || '—'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{jalali(r.created)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows && rows.length > 200 && <p className="text-xs text-muted-foreground">۲۰۰ ردیف اول نمایش داده شده؛ خروجی Excel/PDF شامل همهٔ ردیف‌هاست.</p>}
      </CardContent>
    </Card>
  );
}
