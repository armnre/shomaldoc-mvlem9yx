import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { listMastersPrograms, setThesisProgram, type ListMastersProgramsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@project/components/ui/card';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Skeleton } from '@project/components/ui/skeleton';
import { errMsg } from '../lib/format';
import { useSession } from '../lib/session';

type Init = { programId: string; faculty: string; major: string };

/** Master's program picker: faculty narrows majors, major narrows specializations. Server re-validates every choice. */
export default function ProgramPicker({ thesisId, initial, onDone }: { thesisId: string; initial: Init; onDone: () => void }) {
  const { token } = useSession();
  const [data, setData] = useState<ListMastersProgramsOutputType['faculties'] | null>(null);
  const [error, setError] = useState('');
  const [faculty, setFaculty] = useState(initial.faculty);
  const [major, setMajor] = useState(initial.major);
  const [programId, setProgramId] = useState(initial.programId);
  const [saving, setSaving] = useState(false);

  useEffect(() => { listMastersPrograms({ token }).then((r) => setData(r.faculties)).catch((e) => setError(errMsg(e))); }, [token]);
  const majors = useMemo(() => data?.find((f) => f.name === faculty)?.majors ?? [], [data, faculty]);
  const specs = useMemo(() => majors.find((m) => m.name === major)?.specializations ?? [], [majors, major]);
  const noSpec = specs.length === 1 && specs[0].name === null;
  useEffect(() => { if (noSpec) setProgramId(specs[0].programId); }, [noSpec, specs]);

  const save = async () => {
    setSaving(true);
    try {
      await setThesisProgram({ token, thesisId, faculty, major, programId });
      toast.success('رشته و گرایش ثبت شد.');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">رشته و گرایش (کارشناسی ارشد)</CardTitle>
        <CardDescription>ابتدا دانشکده، سپس رشته و در صورت وجود، گرایش را انتخاب کنید.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && <Skeleton className="h-28" />}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">فهرست رشته‌های کارشناسی ارشد هنوز در سامانه بارگذاری نشده است.</p>}
        {data && data.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>دانشکده</Label>
              <Select value={faculty || undefined} onValueChange={(v) => { setFaculty(v); setMajor(''); setProgramId(''); }}>
                <SelectTrigger aria-label="دانشکده"><SelectValue placeholder="انتخاب دانشکده" /></SelectTrigger>
                <SelectContent>{data.map((f) => <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>رشته</Label>
              <Select value={major || undefined} disabled={!faculty} onValueChange={(v) => { setMajor(v); setProgramId(''); }}>
                <SelectTrigger aria-label="رشته"><SelectValue placeholder="انتخاب رشته" /></SelectTrigger>
                <SelectContent>{majors.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>گرایش</Label>
              {noSpec ? (
                <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">این رشته گرایش ندارد</p>
              ) : (
                <Select value={programId || undefined} disabled={!major} onValueChange={setProgramId}>
                  <SelectTrigger aria-label="گرایش"><SelectValue placeholder="انتخاب گرایش" /></SelectTrigger>
                  <SelectContent>{specs.map((s) => <SelectItem key={s.programId} value={s.programId}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}
        <Button onClick={save} disabled={!programId || saving || programId === initial.programId}>{saving ? 'در حال ثبت…' : 'ثبت رشته و گرایش'}</Button>
      </CardContent>
    </Card>
  );
}
