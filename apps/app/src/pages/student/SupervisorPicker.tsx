import { useSession } from '../../lib/session';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listProfessors, requestSupervisor, type ListProfessorsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Progress } from '@project/components/ui/progress';
import { Skeleton } from '@project/components/ui/skeleton';
import { cn } from '@project/components/lib/utils';
import FileUploader, { type UploadedFile } from '../../components/FileUploader';
import { errMsg, fa } from '../../lib/format';

export default function SupervisorPicker({ onDone, rejected }: { onDone: () => void; rejected: boolean }) {
  const { token } = useSession();
  const [profs, setProfs] = useState<ListProfessorsOutputType['professors'] | null>(null);
  const [sel, setSel] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { listProfessors({ token }).then((r) => setProfs(r.professors)).catch((e) => toast.error(errMsg(e))); }, [token]);

  const submit = async () => {
    setBusy(true);
    try {
      await requestSupervisor({ token,  professorId: sel, files });
      toast.success('درخواست برای استاد ارسال شد.');
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
      listProfessors({ token }).then((r) => setProfs(r.professors));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">انتخاب استاد راهنما و ارسال</CardTitle>
        {rejected && <p className="text-sm text-destructive">درخواست قبلی رد شد؛ استاد دیگری انتخاب کنید.</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {!profs && <Skeleton className="h-32" />}
        {profs?.length === 0 && <p className="text-sm text-muted-foreground">هنوز استادی برای گروه شما تعریف نشده است.</p>}
        <div className="space-y-2" role="radiogroup">
          {profs?.map((p) => {
            const full = p.remaining <= 0;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={sel === p.id} disabled={full} onClick={() => setSel(p.id)}
                className={cn('w-full rounded-lg border p-3 text-right transition', sel === p.id && 'border-primary ring-2 ring-primary/30', full && 'cursor-not-allowed opacity-50')}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.rank}</span>
                </div>
                <Progress value={p.capacity ? ((p.used + p.pending) / p.capacity) * 100 : 100} className="mt-2 h-1.5" />
                <div className="mt-1 text-xs text-muted-foreground">
                  ظرفیت {fa(p.capacity)} · مصرف‌شده {fa(p.used)} · در انتظار {fa(p.pending)} · {full ? 'تکمیل' : `باقی‌مانده ${fa(p.remaining)}`}
                </div>
              </button>
            );
          })}
        </div>
        <FileUploader files={files} onChange={setFiles} />
        <Button className="w-full" disabled={!sel || busy} onClick={submit}>{busy ? 'در حال ارسال…' : 'ثبت نهایی موضوع و ارسال درخواست'}</Button>
      </CardContent>
    </Card>
  );
}
