import { useCallback, useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { toast } from 'sonner';
import { Lock, Plus } from 'lucide-react';
import { adminListUsers, listDepartments, type AdminListUsersOutputType, type ListDepartmentsOutputType } from 'zitejs/api';
import { Input } from '@project/components/ui/input';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Skeleton } from '@project/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import { useSession } from '../../lib/session';
import { errMsg, fa, ROLE_LABELS } from '../../lib/format';
import UserEditDialog from './UserEditDialog';

export type AdminUser = AdminListUsersOutputType['users'][number];

export default function AdminUsers() {
  const { token } = useSession();
  const [search, setSearch] = useState('');
  const [q] = useDebounce(search, 300);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [deps, setDeps] = useState<ListDepartmentsOutputType['departments']>([]);
  const [edit, setEdit] = useState<AdminUser | 'new' | null>(null);
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
          <h1 className="text-2xl font-bold">کاربران و نقش‌ها</h1>
          <p className="text-sm text-muted-foreground">حساب‌ها با نام کاربری (شماره دانشجویی / کد پرسنلی) و رمز موقت صادر می‌شوند؛ کاربر در نخستین ورود رمز را تغییر می‌دهد.</p>
        </div>
        <Button onClick={() => setEdit('new')}><Plus className="ml-1 h-4 w-4" />کاربر جدید</Button>
      </div>
      <Input placeholder="جستجو بر اساس نام، نام کاربری یا شماره دانشجویی" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      <div className="overflow-x-auto rounded-xl border bg-card">
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
      {edit && <UserEditDialog user={edit === 'new' ? null : edit} departments={deps} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
