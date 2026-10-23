import { useState } from 'react';
import { toast } from 'sonner';
import { changePassword } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { useSession } from '../lib/session';
import { errMsg } from '../lib/format';

export default function PasswordForm({ onDone }: { onDone: () => void }) {
  const { token } = useSession();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const policy = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);
  const match = next === rep;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await changePassword({ token, currentPassword: cur, newPassword: next });
      toast.success('رمز عبور تغییر کرد. سایر نشست‌های شما بسته شد.');
      setCur(''); setNext(''); setRep('');
      onDone();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="cp">رمز فعلی</Label><Input id="cp" dir="ltr" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label htmlFor="np">رمز جدید</Label>
        <Input id="np" dir="ltr" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        {next && !policy && <p className="text-xs text-destructive">حداقل ۸ نویسه، شامل حرف لاتین و عدد.</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rp">تکرار رمز جدید</Label>
        <Input id="rp" dir="ltr" type="password" autoComplete="new-password" value={rep} onChange={(e) => setRep(e.target.value)} />
        {rep && !match && <p className="text-xs text-destructive">تکرار رمز مطابقت ندارد.</p>}
      </div>
      <Button type="submit" disabled={!cur || !policy || !match || busy}>{busy ? 'در حال ذخیره…' : 'تغییر رمز'}</Button>
    </form>
  );
}
