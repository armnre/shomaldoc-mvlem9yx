import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarSync, GraduationCap, Lock, Repeat2, Paperclip } from 'lucide-react';
import { graduationItems, type GraduationItemsOutputType, type ThesisDetailOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Badge } from '@project/components/ui/badge';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import FileUploader, { type UploadedFile } from './FileUploader';
import { useSession } from '../lib/session';
import { errMsg, jalali } from '../lib/format';

type D = ThesisDetailOutputType;
const TC_STATUS: Record<string, string> = { supervisor_review: 'نزد استاد راهنما', group_review: 'نزد مدیر گروه', approved: 'تأیید شد', rejected: 'رد شد' };
const Files = ({ files }: { files: { url: string; name: string }[] }) => (
  <div className="flex flex-wrap gap-2">{files.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><Paperclip className="h-3 w-3" />{f.name}</a>)}</div>
);

export function LockedBanner({ t }: { t: NonNullable<D['thesis']> }) {
  if (!t.isLocked) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-secondary p-4 text-sm">
      <Lock className="h-5 w-5 text-primary" />
      <span>این پرونده {t.graduatedAt ? `در ${jalali(t.graduatedAt)} ` : ''}بسته و قفل شده است. ویرایش فقط با بازگشایی توسط مدیر سیستم ممکن است و ثبت می‌شود.</span>
    </div>
  );
}

export function TopicChangesCard({ items }: { items: D['topicChanges'] }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Repeat2 className="h-4 w-4" /> درخواست‌های تغییر موضوع</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="space-y-1.5 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{jalali(c.createdAt, true)}</span>
              <Badge variant={c.status === 'rejected' ? 'destructive' : c.status === 'approved' ? 'default' : 'secondary'}>{TC_STATUS[c.status] ?? c.status}</Badge>
            </div>
            <div><span className="text-muted-foreground">قبلی: </span>{c.oldTitle}</div>
            <div><span className="text-muted-foreground">جدید: </span><b>{c.newTitle}</b></div>
            <div className="text-muted-foreground">دلیل: {c.reason}</div>
            <Files files={c.files} />
            {c.decisions && <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-sans text-xs">{c.decisions}</pre>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DefenseChangesCard({ items }: { items: D['defenseChanges'] }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarSync className="h-4 w-4" /> تاریخچهٔ تغییر زمان دفاع</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((c) => (
          <div key={c.id} className="rounded-lg border p-3 text-sm">
            <div>{jalali(c.oldDate, true)} ({c.oldLocation || '—'}) ← <b>{jalali(c.newDate, true)}</b> ({c.newLocation})</div>
            <div className="text-muted-foreground">علت: {c.reason}</div>
            <div className="text-xs text-muted-foreground">توسط {c.changedBy} — {jalali(c.createdAt, true)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const G_STATUS: Record<string, { l: string; v: 'secondary' | 'default' | 'destructive' | 'outline' }> = {
  pending: { l: 'منتظر بارگذاری', v: 'outline' }, submitted: { l: 'منتظر تأیید', v: 'secondary' }, verified: { l: 'تأیید شد', v: 'default' }, rejected: { l: 'رد شد', v: 'destructive' },
};

export function GraduationPanel({ thesisId, status, onChange }: { thesisId: string; status: string; onChange: () => void }) {
  const { token } = useSession();
  const [data, setData] = useState<GraduationItemsOutputType | null>(null);
  const load = useCallback(() => { graduationItems({ token, thesisId, op: 'list' }).then(setData).catch((e) => toast.error(errMsg(e))); }, [token, thesisId]);
  useEffect(() => { if (['GRADUATION_PROCESS', 'GRADUATED'].includes(status)) load(); }, [load, status]);
  if (!['GRADUATION_PROCESS', 'GRADUATED'].includes(status) || !data) return null;
  const done = data.items.filter((i) => i.status === 'verified').length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4" /> چک‌لیست فارغ‌التحصیلی</CardTitle>
        <p className="text-sm text-muted-foreground">{done.toLocaleString('fa-IR')} از {data.items.length.toLocaleString('fa-IR')} مدرک تأیید شده</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.items.map((i) => <GradItem key={i.id} i={i} thesisId={thesisId} canSubmit={data.canSubmit} canVerify={data.canVerify} onDone={(r) => { setData(r); onChange(); }} />)}
      </CardContent>
    </Card>
  );
}

function GradItem({ i, thesisId, canSubmit, canVerify, onDone }: { i: GraduationItemsOutputType['items'][number]; thesisId: string; canSubmit: boolean; canVerify: boolean; onDone: (r: GraduationItemsOutputType) => void }) {
  const { token } = useSession();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (op: 'submit' | 'verify' | 'reject') => {
    setBusy(true);
    try { onDone(await graduationItems({ token, thesisId, op, itemId: i.id, files, note: note || undefined })); setFiles([]); setNote(''); toast.success('ثبت شد.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const st = G_STATUS[i.status] ?? G_STATUS.pending;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2"><span className="font-medium">{i.key}</span><Badge variant={st.v}>{st.l}</Badge></div>
      {i.note && <p className="text-xs text-muted-foreground">یادداشت: {i.note}</p>}
      <Files files={i.files} />
      {canSubmit && i.status !== 'verified' && (
        <div className="space-y-2">
          <FileUploader files={files} onChange={setFiles} />
          <Button size="sm" disabled={!files.length || busy} onClick={() => run('submit')}>بارگذاری مدرک</Button>
        </div>
      )}
      {canVerify && i.status === 'submitted' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="یادداشت / علت رد" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={busy} onClick={() => run('verify')}>تأیید</Button>
          <Button size="sm" variant="outline" disabled={busy || note.trim().length < 3} onClick={() => run('reject')}>رد</Button>
        </div>
      )}
    </div>
  );
}
