import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { setProposalApprovalDate, type ThesisDetailOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Label } from '@project/components/ui/label';
import { Textarea } from '@project/components/ui/textarea';
import JalaliDatePicker from './JalaliDatePicker';
import { errMsg, jalali } from '../lib/format';
import { useSession } from '../lib/session';

type T = NonNullable<ThesisDetailOutputType['thesis']>;
/** Local calendar day as YYYY-MM-DD (the picker returns a local Date). */
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Official proposal approval date: visible to everyone who can see the case, editable only by graduate office/admin (server-enforced). */
export default function ApprovalDateCard({ t, canEdit, onDone }: { t: T; canEdit: boolean; onDone: () => void }) {
  const { token } = useSession();
  const [date, setDate] = useState<Date | undefined>(t.proposalApprovedAt ? new Date(t.proposalApprovedAt) : undefined);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const correcting = !!t.approvalDateSetAt;
  if (!canEdit && !t.proposalApprovedAt) return null;

  const save = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await setProposalApprovalDate({ token, thesisId: t.id, approvalDate: day(date), reason: reason.trim() || undefined });
      toast.success('تاریخ تصویب پروپوزال ثبت شد.');
      setReason('');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4" /> تاریخ تصویب پروپوزال</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><div className="text-xs text-muted-foreground">تاریخ رسمی تصویب</div><div className="font-medium">{t.proposalApprovedAt ? jalali(t.proposalApprovedAt) : '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">ثبت‌کننده</div><div className="font-medium">{t.approvalDateSetBy || (t.proposalApprovedAt ? 'ثبت خودکار هنگام تصویب' : '—')}</div></div>
          <div><div className="text-xs text-muted-foreground">زمان ثبت در سامانه</div><div className="font-medium">{t.approvalDateSetAt ? jalali(t.approvalDateSetAt, true) : '—'}</div></div>
        </div>
        {canEdit && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label>{correcting ? 'اصلاح تاریخ تصویب' : 'ثبت تاریخ تصویب'}</Label>
              <JalaliDatePicker value={date} onChange={setDate} />
            </div>
            {correcting && (
              <div className="space-y-1.5">
                <Label htmlFor="adr">علت اصلاح (الزامی)</Label>
                <Textarea id="adr" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            <Button onClick={save} disabled={!date || saving || (correcting && reason.trim().length < 3)}>{saving ? 'در حال ثبت…' : 'ثبت تاریخ'}</Button>
            <p className="text-xs text-muted-foreground">این تاریخ مبنای محاسبهٔ حداقل فاصله تا دفاع است و هر تغییر آن در تاریخچهٔ پرونده ثبت می‌شود.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
