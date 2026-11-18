import { useCallback, useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { toast } from 'sonner';
import { FileSpreadsheet, Lock, Plus } from 'lucide-react';
import { adminListUsers, listDepartments, type AdminListUsersOutputType, type ListDepartmentsOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import { useSession } from '../../lib/session';
import { errMsg, fa, ROLE_LABELS } from '../../lib/format';
import UserEditDialog from './UserEditDialog';
import ImportUsersDialog from './ImportUsersDialog';

export type AdminUser = AdminListUsersOutputType['users'][number];

export default function AdminUsers() {
  const { token } = useSession();
  const [search, setSearch] = useState('');
  const [q] = useDebounce(search, 300);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [deps, setDeps] = useState<ListDepartmentsOutputType['departments']>([]);
  const [edit, setEdit] = useState<AdminUser | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const load = useCallback(() => {
    adminListUsers({ token, search: q }).then((r) => setUsers(r.users)).catch((e) => toast.error(errMsg(e)));
  }, [q, token]);
  useEffect(load, [load]);
  useEffect(() => { listDepartments({ token }).then((r) => setDeps(r.departments)).catch(() => undefined); }, [token]);
  const depName = (id: string) => deps.find((d) => d.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">کاربران و نقش‌ها</h1>
          <p className="text-sm text-muted-foreground">حساب‌ها با نام کاربری (شماره دانشجویی / کد پرسنلی) و رمز موقت صادر می‌شوند؛ کاربر در نخستین ورود رمز را تغییر می‌دهد.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button variant="outline" onClick={() => setImporting(true)}><FileSpreadsheet className="ml-1 h-4 w-4" />ورود از اکسل</Button>
          <Button onClick={() => setEdit('new')}><Plus className="ml-1 h-4 w-4" />کاربر جدید</Button>
        </div>
      </div>
      <Input placeholder="جستجو بر اساس نام، نام کاربری یا شماره دانشجویی" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:max-w-md" />
      {users && <p className="text-xs text-muted-foreground">{fa(users.length)} کاربر</p>}
      <div className="space-y-2 md:hidden">
        {!users && <Skeleton className="h-24" />}
        {users?.map((u) => (
          <button key={u.profileId} onClick={() => setEdit(u)} className={`w-full rounded-xl border bg-card p-3 text-right ${u.disabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate font-semibold">{u.fullName || '—'}</div><div dir="ltr" className="text-right text-xs text-muted-foreground">{u.username}</div></div>
              <span className="shrink-0 text-xs text-muted-foreground">{depName(u.departmentId)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {u.roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>)}
              {u.disabled && <Badge variant="destructive">غیرفعال</Badge>}
              {u.locked && <Badge variant="destructive">قفل موقت</Badge>}
              {u.mustChangePassword && !u.disabled && <Badge variant="outline">رمز موقت</Badge>}
            </div>
          </button>
        ))}
        {users?.length === 0 && <p className="py-10 text-center text-muted-foreground">کاربری یافت نشد.</p>}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">نام</TableHead>
              <TableHead className="text-right">نام کاربری</TableHead>
              <TableHead className="text-right">نقش‌ها</TableHead>
              <TableHead className="text-right">گروه</TableHead>
              <TableHead className="text-right">وضعیت</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!users && <TableRow><TableCell colSpan={6}><Skeleton className="h-8" /></TableCell></TableRow>}
            {users?.map((u) => (
              <TableRow key={u.profileId} className={u.disabled ? 'opacity-60' : ''}>
                <TableCell className="font-medium">{u.fullName || '—'}</TableCell>
                <TableCell dir="ltr" className="text-right text-sm">{u.username}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{u.roles.length ? u.roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>) : <Badge variant="outline">بدون نقش</Badge>}</div></TableCell>
                <TableCell>{depName(u.departmentId)}</TableCell>
                <TableCell className="space-y-1 text-sm">
                  {u.disabled && <Badge variant="destructive">غیرفعال</Badge>}
                  {u.locked && <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" />قفل موقت</Badge>}
                  {u.mustChangePassword && !u.disabled && <Badge variant="outline">رمز موقت</Badge>}
                  {u.roles.includes('professor') && <div>ظرفیت: {fa(u.baseCapacity)}</div>}
                  {u.roles.includes('student') && <div>{u.eligibleForThesis ? 'واجد شرایط پایان‌نامه' : 'فاقد مجوز پایان‌نامه'}</div>}
                </TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => setEdit(u)}>ویرایش</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {users?.length === 0 && <p className="py-10 text-center text-muted-foreground">کاربری یافت نشد.</p>}
      </div>
      {importing && <ImportUsersDialog onClose={() => setImporting(false)} onDone={load} />}
      {edit && <UserEditDialog user={edit === 'new' ? null : edit} departments={deps} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
