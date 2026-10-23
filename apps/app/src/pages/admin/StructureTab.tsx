import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { adminSaveDepartment, adminStructure, type AdminStructureInputType, type AdminStructureOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { useSession } from '../../lib/session';
import { errMsg } from '../../lib/format';

type S = AdminStructureOutputType;
type Run = (i: Omit<AdminStructureInputType, 'token'>) => Promise<void>;

export default function StructureTab() {
  const { token } = useSession();
  const [d, setD] = useState<S | null>(null);
  const load = useCallback(() => { adminStructure({ token, op: 'list' }).then(setD).catch((e) => toast.error(errMsg(e))); }, [token]);
  useEffect(load, [load]);
  const run: Run = async (i) => {
    try { setD(await adminStructure({ token, ...i })); toast.success('ذخیره شد.'); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!d) return <Skeleton className="h-80" />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Faculties d={d} run={run} />
      <Departments d={d} run={run} reload={load} />
      <div className="lg:col-span-2"><Programs d={d} run={run} /></div>
    </div>
  );
}

function Faculties({ d, run }: { d: S; run: Run }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">دانشکده‌ها</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2">
          <Input placeholder="نام دانشکده" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="کد" className="w-24" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button disabled={name.trim().length < 2} onClick={() => run({ op: 'saveFaculty', name, code }).then(() => { setName(''); setCode(''); })}>افزودن</Button>
        </div>
        {d.faculties.length === 0 && <p className="text-sm text-muted-foreground">هنوز دانشکده‌ای تعریف نشده است.</p>}
        {d.faculties.map((f) => <FacultyRow key={f.id} f={f} run={run} />)}
      </CardContent>
    </Card>
  );
}
function FacultyRow({ f, run }: { f: S['faculties'][number]; run: Run }) {
  const [name, setName] = useState(f.name);
  const [code, setCode] = useState(f.code);
  return (
    <div className="flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Input className="w-24" value={code} onChange={(e) => setCode(e.target.value)} />
      <Button variant="outline" disabled={name === f.name && code === f.code} onClick={() => run({ op: 'saveFaculty', id: f.id, name, code })}>ذخیره</Button>
      <Button variant="ghost" size="icon" aria-label="حذف" onClick={() => run({ op: 'deleteFaculty', id: f.id })}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function Departments({ d, run, reload }: { d: S; run: Run; reload: () => void }) {
  const { token } = useSession();
  const [name, setName] = useState('');
  const add = async () => {
    try { await adminSaveDepartment({ token, name, faculty: '' }); setName(''); reload(); toast.success('گروه افزوده شد.'); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">گروه‌های آموزشی و دانشکدهٔ هر گروه</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="flex gap-2"><Input placeholder="نام گروه جدید" value={name} onChange={(e) => setName(e.target.value)} /><Button disabled={name.trim().length < 2} onClick={add}>افزودن</Button></div>
        {d.departments.map((dep) => (
          <div key={dep.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{dep.name}</span>
            <Select value={dep.facultyId || undefined} onValueChange={(v) => run({ op: 'linkDepartment', departmentId: dep.id, facultyId: v })}>
              <SelectTrigger className="w-52"><SelectValue placeholder="انتخاب دانشکده" /></SelectTrigger>
              <SelectContent>{d.faculties.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Programs({ d, run }: { d: S; run: Run }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">رشته‌ها، گرایش‌ها و مقاطع</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <ProgramRow d={d} run={run} />
        <hr />
        {d.programs.length === 0 && <p className="text-sm text-muted-foreground">هنوز رشته‌ای تعریف نشده است.</p>}
        {d.programs.map((p) => <ProgramRow key={p.id} p={p} d={d} run={run} />)}
      </CardContent>
    </Card>
  );
}
function ProgramRow({ p, d, run }: { p?: S['programs'][number]; d: S; run: Run }) {
  const [v, setV] = useState({ name: p?.name ?? '', specialization: p?.specialization ?? '', degree: p?.degree ?? '', departmentId: p?.departmentId ?? '', isActive: p?.isActive ?? true });
  const valid = v.name.trim().length >= 2 && v.degree && v.departmentId;
  const save = () => run({ op: 'saveProgram', id: p?.id, ...v, degree: v.degree as 'کارشناسی ارشد' | 'دکتری' }).then(() => { if (!p) setV({ name: '', specialization: '', degree: '', departmentId: '', isActive: true }); });
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_150px_180px_auto_auto_auto] md:items-center">
      <Input placeholder="رشته" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Input placeholder="گرایش" value={v.specialization} onChange={(e) => setV({ ...v, specialization: e.target.value })} />
      <Select value={v.degree || undefined} onValueChange={(x) => setV({ ...v, degree: x })}>
        <SelectTrigger><SelectValue placeholder="مقطع" /></SelectTrigger>
        <SelectContent><SelectItem value="کارشناسی ارشد">کارشناسی ارشد</SelectItem><SelectItem value="دکتری">دکتری</SelectItem></SelectContent>
      </Select>
      <Select value={v.departmentId || undefined} onValueChange={(x) => setV({ ...v, departmentId: x })}>
        <SelectTrigger><SelectValue placeholder="گروه" /></SelectTrigger>
        <SelectContent>{d.departments.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
      </Select>
      <label className="flex items-center gap-1.5 text-xs"><Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />فعال</label>
      <Button variant={p ? 'outline' : 'default'} disabled={!valid} onClick={save}>{p ? 'ذخیره' : 'افزودن'}</Button>
      {p ? <Button variant="ghost" size="icon" aria-label="حذف" onClick={() => run({ op: 'deleteProgram', id: p.id })}><Trash2 className="h-4 w-4" /></Button> : <span />}
    </div>
  );
}
