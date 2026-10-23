import { useState } from 'react';
import { toast } from 'sonner';
import { requestTopicChange } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import FileUploader, { type UploadedFile } from '../../components/FileUploader';
import { useSession } from '../../lib/session';
import { errMsg, fa } from '../../lib/format';

export default function TopicChangeForm({ currentTitle, onDone }: { currentTitle: string; onDone: () => void }) {
  const { token } = useSession();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 5 && title.trim() !== currentTitle.trim() && reason.trim().length >= 20;
  const submit = async () => {
    setBusy(true);
    try {
      await requestTopicChange({ token, newTitle: title, newTitleEn: titleEn, reason, files });
      toast.success('درخواست تغییر موضوع ثبت و برای بررسی ارسال شد.');
      setOpen(false);
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>درخواست تغییر موضوع</Button>;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">درخواست تغییر موضوع</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted p-3 text-sm"><span className="text-muted-foreground">موضوع فعلی: </span>{currentTitle}</div>
        <div className="space-y-1.5"><Label htmlFor="nt">عنوان جدید (فارسی)</Label><Input id="nt" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="nte">عنوان جدید (انگلیسی)</Label><Input id="nte" dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="rs">دلیل تغییر</Label>
          <Textarea id="rs" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">{fa(reason.trim().length)} نویسه (حداقل ۲۰)</p>
        </div>
        <FileUploader files={files} onChange={setFiles} />
        <div className="flex gap-2">
          <Button disabled={!valid || busy} onClick={submit}>{busy ? 'در حال ارسال…' : 'ارسال درخواست'}</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>انصراف</Button>
        </div>
      </CardContent>
    </Card>
  );
}
