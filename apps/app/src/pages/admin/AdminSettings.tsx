import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSettings, type AdminSettingsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Skeleton } from '@project/components/ui/skeleton';
import { useSession } from '../../lib/session';
import { errMsg } from '../../lib/format';
import ChainEditor from '../../components/ChainEditor';
import { Textarea } from '@project/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';

const STEPS = ['supervisor', 'group_manager', 'graduate_office', 'finance'];

export default function AdminSettings() {
  const { token } = useSession();
  const [items, setItems] = useState<AdminSettingsOutputType['settings'] | null>(null);
  const [statuses, setStatuses] = useState<AdminSettingsOutputType['statuses']>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    adminSettings({ token }).then((r) => { setItems(r.settings); setStatuses(r.statuses); setVals(Object.fromEntries(r.settings.map((s) => [s.key, s.value]))); }).catch((e) => toast.error(errMsg(e)));
  }, [token]);
  if (!items) return <Skeleton className="mx-auto h-80 max-w-3xl" />;
  const chains = items.filter((s) => s.kind === 'chain');
  const invalid = chains.some((c) => !vals[c.key]) || items.some((s) => s.kind === 'list' && !vals[s.key]?.trim()) || items.some((s) => s.kind === 'int' && !(Number(vals[s.key]) >= 1));
  const save = async () => {
    const clean = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, items.find((i) => i.key === k)?.kind === 'list' ? v.split(',').map((x) => x.trim()).filter(Boolean).join(',') : v]));
    setBusy(true);
    try {
      const r = await adminSettings({ token, updates: clean });
      setItems(r.settings);
      toast.success('تنظیمات ذخیره شد.');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader><CardTitle>قواعد و مقادیر سامانه</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {items.filter((s) => s.kind === 'int').map((s) => (
            <div key={s.key} className="grid gap-1.5 sm:grid-cols-[1fr_140px] sm:items-center">
              <Label htmlFor={s.key}>{s.description}</Label>
              <Input id={s.key} dir="ltr" inputMode="numeric" value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value.replace(/\D/g, '') })} />
            </div>
          ))}
          {items.filter((s) => s.kind === 'status').map((s) => (
            <div key={s.key} className="grid gap-1.5 sm:grid-cols-[1fr_260px] sm:items-center">
              <Label>{s.description}</Label>
              <Select value={vals[s.key]} onValueChange={(v) => setVals({ ...vals, [s.key]: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{statuses.map((st) => <SelectItem key={st.key} value={st.key}>{st.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
          {items.filter((s) => s.kind === 'list').map((s) => (
            <div key={s.key} className="space-y-1.5">
              <Label htmlFor={s.key}>{s.description.replace(' (با ویرگول جدا شود)', '')} — هر مورد در یک خط</Label>
              <Textarea id={s.key} rows={5} value={(vals[s.key] ?? '').split(',').join('\n')} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value.split('\n').map((x) => x.replace(/,/g, '،')).join(',') })} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ویرایشگر گردش کار</CardTitle>
          <p className="text-sm text-muted-foreground">مراحل را بکشید تا ترتیب تغییر کند؛ با دکمه‌ها مرحله اضافه یا حذف کنید. تغییرات روی درخواست‌هایی که از این پس ثبت می‌شوند اعمال می‌شود؛ درخواست‌های جاری با مسیر قبلی خود ادامه می‌یابند.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {chains.map((c) => <ChainEditor key={c.key} steps={c.key === 'topicChangeChain' ? ['supervisor', 'group_manager'] : STEPS} label={c.description} value={vals[c.key] ?? ''} onChange={(v) => setVals({ ...vals, [c.key]: v })} />)}
        </CardContent>
      </Card>
      <Button size="lg" onClick={save} disabled={busy || invalid}>{busy ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}</Button>
    </div>
  );
}
