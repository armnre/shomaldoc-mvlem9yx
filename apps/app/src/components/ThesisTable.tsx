import { useSession } from '../lib/session';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { ChevronLeft, Download, Inbox, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listTheses, type ListThesesOutputType, type ListThesesInputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import StatusBadge from './StatusBadge';
import { errMsg, fa, jalali, STATUS, STEP_LABELS } from '../lib/format';

type Scope = ListThesesInputType['scope'];

export default function ThesisTable({ scope, inboxOnly }: { scope: Scope; inboxOnly?: boolean }) {
  const { token } = useSession();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [q] = useDebounce(search, 350);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListThesesOutputType | null>(null);

  useEffect(() => setPage(1), [q, status, scope]);
  useEffect(() => {
    setData(null);
    listTheses({ token,  scope, inboxOnly, search: q || undefined, status: status === 'all' ? undefined : status, page })
      .then(setData)
      .catch((e) => toast.error(errMsg(e)));
  }, [token, scope, inboxOnly, q, status, page]);

  const exportCsv = async () => {
    const all: ListThesesOutputType['rows'] = [];
    for (let p = 1; ; p++) {
      const r = await listTheses({ token,  scope, inboxOnly, search: q || undefined, status: status === 'all' ? undefined : status, page: p });
      all.push(...r.rows);
      if (p * r.pageSize >= r.total) break;
    }
    const head = ['کد پرونده', 'عنوان', 'دانشجو', 'شماره دانشجویی', 'استاد راهنما', 'گروه', 'وضعیت', 'آخرین تغییر'];
    const lines = all.map((r) => [r.code, r.titleFa, r.studentName, r.studentNumber, r.supervisorName, r.departmentName, STATUS[r.status]?.label ?? r.status, jalali(r.updatedAt)]);
    const csv = '\uFEFF' + [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'shomaldoc-theses.csv';
    a.click();
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="جستجو: نام، شماره دانشجویی، کد ملی، عنوان، کد پرونده، استاد" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!inboxOnly && (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-56" aria-label="فیلتر وضعیت"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ وضعیت‌ها</SelectItem>
              {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={() => exportCsv().catch((e) => toast.error(errMsg(e)))} disabled={!data?.total}>
          <Download className="ml-2 h-4 w-4" /> خروجی CSV
        </Button>
      </div>
      <div className="space-y-2 md:hidden">
        {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        {data?.rows.map((r) => (
          <button key={r.id} type="button" onClick={() => nav(`/thesis/${r.id}`)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-right shadow-sm transition-colors active:bg-muted">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-muted-foreground">{r.code}</span><span className="text-[11px] text-muted-foreground">{jalali(r.updatedAt)}</span></div>
              <div className="line-clamp-2 text-sm font-semibold">{r.titleFa || 'عنوان ثبت نشده'}</div>
              <div className="text-xs text-muted-foreground">{r.studentName || '—'}{r.studentNumber && ` · ${fa(r.studentNumber)}`}</div>
              <StatusBadge status={r.status} />
            </div>
            <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">کد</TableHead>
              <TableHead className="text-right">عنوان</TableHead>
              <TableHead className="text-right">دانشجو</TableHead>
              <TableHead className="hidden text-right lg:table-cell">استاد راهنما</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead className="hidden text-right md:table-cell">آخرین تغییر</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && [0, 1, 2, 3].map((i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
            ))}
            {data?.rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" tabIndex={0} onClick={() => nav(`/thesis/${r.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/thesis/${r.id}`)}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="max-w-xs truncate font-medium">{r.titleFa || '—'}</TableCell>
                <TableCell>{r.studentName || '—'}<div className="text-xs text-muted-foreground">{r.studentNumber && fa(r.studentNumber)}</div></TableCell>
                <TableCell className="hidden lg:table-cell">{r.supervisorName || '—'}</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                  {r.status === 'PROPOSAL_REVIEW' && r.proposalStep && <div className="mt-1 text-xs text-muted-foreground">نزد {STEP_LABELS[r.proposalStep]}</div>}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{jalali(r.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && data.rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card py-12 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          {inboxOnly ? 'اقدامی در انتظار شما نیست. 👌' : 'پرونده‌ای یافت نشد.'}
        </div>
      )}
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{fa(data.total)} پرونده</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</Button>
            <span>{fa(page)} از {fa(pages)}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>بعدی</Button>
          </div>
        </div>
      )}
    </div>
  );
}
