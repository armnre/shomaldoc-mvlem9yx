import { useSession } from '../../lib/session';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { toast } from 'sonner';
import { adminAuditLog, type AdminAuditLogOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import { ACTION_LABELS, errMsg, fa, jalali, ROLE_LABELS, STATUS } from '../../lib/format';

export default function AdminAudit() {
  const { token } = useSession();
  const [search, setSearch] = useState('');
  const [q] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [d, setD] = useState<AdminAuditLogOutputType | null>(null);
  useEffect(() => setPage(1), [q]);
  useEffect(() => {
    setD(null);
    adminAuditLog({ token,  search: q, page }).then(setD).catch((e) => toast.error(errMsg(e)));
  }, [token, q, page]);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const st = (s: string) => STATUS[s]?.label ?? s;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">گزارش رویدادها (Audit Log)</h1>
      <Input className="max-w-md" placeholder="جستجو: عملیات، کاربر، کد پرونده، توضیح" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">زمان</TableHead>
              <TableHead className="text-right">کاربر / نقش</TableHead>
              <TableHead className="text-right">عملیات</TableHead>
              <TableHead className="text-right">پرونده</TableHead>
              <TableHead className="text-right">قبل ← بعد</TableHead>
              <TableHead className="text-right">توضیح</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!d && <TableRow><TableCell colSpan={6}><Skeleton className="h-8" /></TableCell></TableRow>}
            {d?.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{jalali(r.at, true)}</TableCell>
                <TableCell className="text-sm">{r.actorName || '—'}<div className="text-xs text-muted-foreground">{ROLE_LABELS[r.role] ?? r.role}</div></TableCell>
                <TableCell className="text-sm">{ACTION_LABELS[r.action] ?? r.action}</TableCell>
                <TableCell className="font-mono text-xs">{r.thesisCode || '—'}</TableCell>
                <TableCell className="text-xs">{r.from || r.to ? `${st(r.from) || '—'} ← ${st(r.to) || '—'}` : '—'}</TableCell>
                <TableCell className="max-w-xs text-sm">{r.comment || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {d?.rows.length === 0 && <p className="py-10 text-center text-muted-foreground">رویدادی یافت نشد.</p>}
      </div>
      {d && d.total > d.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</Button>
          <span>{fa(page)} از {fa(pages)}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>بعدی</Button>
        </div>
      )}
    </div>
  );
}
