import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { notifyPrefs } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Switch } from '@project/components/ui/switch';
import { Skeleton } from '@project/components/ui/skeleton';
import { useSession } from '../lib/session';
import { errMsg } from '../lib/format';

type Prefs = { email: string; phone: string; notifyEmail: boolean; notifySms: boolean };

export default function NotifyPrefsCard() {
  const { token } = useSession();
  const [p, setP] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { notifyPrefs({ token }).then(setP).catch((e) => toast.error(errMsg(e))); }, [token]);

  const emailOk = !p?.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email);
  const phoneOk = !p?.phone || /^09\d{9}$/.test(p.phone);
  const save = async () => {
    if (!p) return;
    setSaving(true);
    try { setP(await notifyPrefs({ token, save: p })); toast.success('ترجیحات اطلاع‌رسانی ذخیره شد.'); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setSaving(false); }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>اطلاع‌رسانی</CardTitle></CardHeader>
      <CardContent>
        {!p ? <Skeleton className="h-24" /> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="np-email">ایمیل</Label>
              <Input id="np-email" dir="ltr" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value.trim() })} placeholder="name@example.com" />
              {!emailOk && <p className="text-xs text-destructive">ایمیل معتبر نیست.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-phone">شمارهٔ همراه</Label>
              <Input id="np-phone" dir="ltr" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value.trim() })} placeholder="09xxxxxxxxx" />
              {!phoneOk && <p className="text-xs text-destructive">شماره باید ۱۱ رقم و با ۰۹ شروع شود.</p>}
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">دریافت اعلان با ایمیل<Switch checked={p.notifyEmail} onCheckedChange={(v) => setP({ ...p, notifyEmail: v })} /></label>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">دریافت اعلان با پیامک<Switch checked={p.notifySms} onCheckedChange={(v) => setP({ ...p, notifySms: v })} /></label>
            <p className="text-xs text-muted-foreground md:col-span-2">اعلان‌های درون‌سامانه همیشه فعال‌اند. ارسال ایمیل و پیامک پس از اتصال سرویس توسط مدیر سامانه انجام می‌شود.</p>
            <div className="md:col-span-2"><Button onClick={save} disabled={saving || !emailOk || !phoneOk}>{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}ذخیره</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
