import { useSession } from '../../lib/session';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSaveDepartment, listDepartments, type ListDepartmentsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Skeleton } from '@project/components/ui/skeleton';
import { errMsg } from '../../lib/format';

type Dep = ListDepartmentsOutputType['departments'][number];

function Row({ d, onSaved }: { d?: Dep; onSaved: () => void }) {
  const { token } = useSession();
  const [name, setName] = useState(d?.name ?? '');
  const [faculty, setFaculty] = useState(d?.faculty ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = name !== (d?.name ?? '') || faculty !== (d?.faculty ?? '');
  const save = async () => {
    setBusy(true);
    try {
      await adminSaveDepartment({ token,  id: d?.id, name, faculty });
      toast.success('ذخیره شد.');
      if (!d) { setName(''); setFaculty(''); }
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input placeholder="نام گروه آموزشی" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="دانشکده" value={faculty} onChange={(e) => setFaculty(e.target.value)} />
      <Button onClick={save} disabled={!dirty || name.trim().length < 2 || busy} variant={d ? 'outline' : 'default'}>{d ? 'ذخیره' : 'افزودن'}</Button>
    </div>
  );
}

export default function AdminDepartments() {
  const { token } = useSession();
  const [deps, setDeps] = useState<Dep[] | null>(null);
  const load = useCallback(() => { listDepartments({ token }).then((r) => setDeps(r.departments)).catch((e) => toast.error(errMsg(e))); }, [token]);
  useEffect(load, [load]);
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader><CardTitle>ساختار دانشگاهی: گروه‌های آموزشی</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Row onSaved={load} />
        <hr />
        {!deps && <Skeleton className="h-20" />}
        {deps?.length === 0 && <p className="text-sm text-muted-foreground">هنوز گروهی تعریف نشده است.</p>}
        {deps?.map((d) => <Row key={d.id} d={d} onSaved={load} />)}
      </CardContent>
    </Card>
  );
}
