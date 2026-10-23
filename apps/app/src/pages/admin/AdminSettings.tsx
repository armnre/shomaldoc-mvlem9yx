import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminSettings, type AdminSettingsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Skeleton } from '@project/components/ui/skeleton';
import { useSession } from '../../lib/session';
import { errMsg, STEP_LABELS } from '../../lib/format';

const STEPS = ['supervisor', 'group_manager', 'graduate_office', 'finance'];

function ChainEditor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const chain = value.split(',').filter(Boolean);
  const toggle = (s: string) => onChange((chain.includes(s) ? chain.filter((x) => x !== s) : [...chain, s]).join(','));
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <Button key={s} type="button" size="sm" variant={chain.includes(s) ? 'default' : 'outline'} onClick={() => toggle(s)} aria-pressed={chain.includes(s)}>
            {chain.includes(s) ? `${(chain.indexOf(s) + 1).toLocaleString('fa-IR')}. ` : ''}{STEP_LABELS[s]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">ترتیب: {chain.map((c) => STEP_LABELS[c]).join(' ← ') || <span className="text-destructive">حداقل یک مرحله لازم است</span>}</p>
    </div>
  );
}

export default function AdminSettings() {
  const { token } = useSession();
  const [items, setItems] = useState<AdminSettingsOutputType['settings'] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    adminSettings({ token }).then((r) => { setItems(r.settings); setVals(Object.fromEntries(r.settings.map((s) => [s.key, s.value]))); }).catch((e) => toast.error(errMsg(e)));
  }, [token]);
  if (!items) return <Skeleton className="mx-auto h-80 max-w-3xl" />;
  const chains = items.filter((s) => s.kind === 'chain');
  const invalid = chains.some((c) => !vals[c.key]) || items.some((s) => s.kind === 'int' && !(Number(vals[s.key]) >= 1));
  const save = async () => {
    setBusy(true);
    try {
      const r = await adminSettings({ token, updates: vals });
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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ویرایشگر گردش کار</CardTitle>
          <p className="text-sm text-muted-foreground">روی مراحل به ترتیب دلخواه کلیک کنید. تغییرات روی درخواست‌هایی که از این پس ثبت می‌شوند اعمال می‌شود؛ درخواست‌های جاری با مسیر قبلی خود ادامه می‌یابند.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {chains.map((c) => <ChainEditor key={c.key} label={c.description} value={vals[c.key] ?? ''} onChange={(v) => setVals({ ...vals, [c.key]: v })} />)}
        </CardContent>
      </Card>
      <Button size="lg" onClick={save} disabled={busy || invalid}>{busy ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}</Button>
    </div>
  );
}
