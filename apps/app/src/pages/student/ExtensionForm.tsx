import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { requestExtension } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import FileUploader, { type UploadedFile } from '../../components/FileUploader';
import { useSession } from '../../lib/session';
import { errMsg, fa } from '../../lib/format';

export default function ExtensionForm({ termsUsed, allowedTerms, commissionTerm, onDone }: { termsUsed: number; allowedTerms: number; commissionTerm: number; onDone: () => void }) {
  const { token } = useSession();
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const commission = termsUsed >= commissionTerm;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await requestExtension({ token, reason, documents: docs });
      toast.success(r.needsCommission ? 'درخواست شما به کمیسیون موارد خاص ارجاع شد.' : 'درخواست تمدید ثبت و وارد مسیر تأیید شد.');
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-destructive" />درخواست تمدید</CardTitle>
        <p className="text-sm text-muted-foreground">
          شما {fa(termsUsed)} ترم از {fa(allowedTerms)} ترم مجاز را سپری کرده‌اید. برای ادامهٔ پایان‌نامه باید درخواست تمدید ثبت کنید.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {commission && (
          <ol className="list-inside list-decimal space-y-1 rounded-lg bg-accent p-4 text-sm text-accent-foreground">
            <li>چون از ترم {fa(commissionTerm)} عبور کرده‌اید، درخواست شما ابتدا به کمیسیون موارد خاص می‌رود.</li>
            <li>مدارک توجیهی (گزارش پیشرفت، تأییدیهٔ استاد راهنما و…) را پیوست کنید.</li>
            <li>پس از موافقت کمیسیون، تحصیلات تکمیلی، امور مالی و استاد راهنما درخواست را تأیید می‌کنند.</li>
          </ol>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="er">دلیل درخواست و برنامهٔ تکمیل کار</Label>
          <Textarea id="er" rows={5} value={reason} onChange={(e) => setReason(e.target.value)} />
          {reason && reason.trim().length < 20 && <p className="text-xs text-destructive">حداقل ۲۰ نویسه توضیح دهید.</p>}
        </div>
        <FileUploader files={docs} onChange={setDocs} />
        <Button onClick={submit} disabled={reason.trim().length < 20 || (commission && !docs.length) || busy}>{busy ? 'در حال ثبت…' : 'ثبت درخواست تمدید'}</Button>
      </CardContent>
    </Card>
  );
}
