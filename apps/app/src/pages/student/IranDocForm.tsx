import { useState } from 'react';
import { toast } from 'sonner';
import { Landmark } from 'lucide-react';
import { submitIranDoc } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import DatePicker from '../../components/JalaliDatePicker';
import FileUploader, { type UploadedFile } from '../../components/FileUploader';
import { useSession } from '../../lib/session';
import { errMsg } from '../../lib/format';

export default function IranDocForm({ lastComment, onDone }: { lastComment?: string; onDone: () => void }) {
  const { token } = useSession();
  const [code, setCode] = useState('');
  const [date, setDate] = useState<Date | undefined>();
  const [receipt, setReceipt] = useState<UploadedFile[]>([]);
  const [cert, setCert] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const valid = code.trim().length >= 4 && date && date <= new Date() && receipt.length > 0;
  const submit = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await submitIranDoc({ token, trackingCode: code.trim(), registeredOn: date.toISOString().slice(0, 10), receipt, certificate: cert });
      toast.success('اطلاعات ایرانداک برای بررسی تحصیلات تکمیلی ارسال شد.');
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" />ثبت اطلاعات ایرانداک</CardTitle>
        <p className="text-sm text-muted-foreground">پس از ثبت پروپوزال در سامانهٔ ایرانداک، کد رهگیری و رسید را اینجا وارد کنید.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastComment && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">علت رد قبلی: {lastComment}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="ic">کد رهگیری ایرانداک</Label><Input id="ic" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>تاریخ ثبت</Label><DatePicker value={date} onChange={setDate} /></div>
        </div>
        <div className="space-y-1.5"><Label>رسید ثبت (الزامی)</Label><FileUploader files={receipt} onChange={setReceipt} /></div>
        <div className="space-y-1.5"><Label>گواهی ایرانداک (در صورت صدور)</Label><FileUploader files={cert} onChange={setCert} /></div>
        <Button onClick={submit} disabled={!valid || busy}>{busy ? 'در حال ارسال…' : 'ارسال برای بررسی'}</Button>
      </CardContent>
    </Card>
  );
}
