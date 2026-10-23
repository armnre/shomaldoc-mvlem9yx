import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { notificationAdmin, type NotificationAdminInputType, type NotificationAdminOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { Switch } from '@project/components/ui/switch';
import { Checkbox } from '@project/components/ui/checkbox';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import { useSession } from '../../lib/session';
import { errMsg, fa, jalali } from '../../lib/format';

type D = NotificationAdminOutputType;
type Ch = 'inApp' | 'email' | 'sms';
const CH: Record<string, string> = { inApp: 'درون‌سامانه', email: 'ایمیل', sms: 'پیامک' };
const ST: Record<string, string> = { sent: 'ارسال شد', logged: 'ثبت در لاگ (سرویس آزمایشی)', failed: 'خطا', skipped: 'رد شد (اطلاعات تماس ناقص)' };

export default function TemplatesTab() {
  const { token } = useSession();
  const [d, setD] = useState<D | null>(null);
  const [channel, setChannel] = useState<NotificationAdminInputType['logChannel']>('all');
  const [page, setPage] = useState(0);
  const load = useCallback(() => { notificationAdmin({ token, logChannel: channel, logPage: page }).then(setD).catch((e) => toast.error(errMsg(e))); }, [token, channel, page]);
  useEffect(load, [load]);
  if (!d) return <Skeleton className="h-80" />;
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        سرویس اعلان سه کانال قابل‌تعویض دارد: درون‌سامانه (فعال)، ایمیل و پیامک. فعلاً هیچ سرویس ایمیل یا پیامک واقعی وصل نیست؛ این پیام‌ها فقط در «لاگ ارسال» ثبت می‌شوند و به دست کاربر نمی‌رسند تا زمانی که سرویس واقعی وصل شود.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {d.templates.map((t) => <TemplateCard key={t.key} t={t} onSaved={setD} channel={channel} page={page} />)}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">لاگ ارسال اعلان‌ها ({fa(d.logTotal)})</CardTitle>
          <Select value={channel} onValueChange={(v) => { setChannel(v as typeof channel); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">همهٔ کانال‌ها</SelectItem>{Object.entries(CH).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>زمان</TableHead><TableHead>کاربر</TableHead><TableHead>کانال</TableHead><TableHead>گیرنده</TableHead><TableHead>عنوان</TableHead><TableHead>نتیجه</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">موردی ثبت نشده است.</TableCell></TableRow>}
                {d.logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">{jalali(l.at, true)}</TableCell><TableCell>{l.userName}</TableCell><TableCell>{CH[l.channel]}</TableCell>
                    <TableCell dir="ltr" className="text-xs">{l.recipient || '—'}</TableCell><TableCell className="max-w-xs truncate">{l.title}</TableCell>
                    <TableCell><Badge variant={l.status === 'failed' ? 'destructive' : l.status === 'sent' ? 'default' : 'secondary'} title={l.error}>{ST[l.status] ?? l.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>قبلی</Button>
            <span>صفحهٔ {fa(page + 1)} از {fa(Math.max(1, Math.ceil(d.logTotal / 50)))}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= d.logTotal} onClick={() => setPage(page + 1)}>بعدی</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateCard({ t, onSaved, channel, page }: { t: D['templates'][number]; onSaved: (d: D) => void; channel: NotificationAdminInputType['logChannel']; page: number }) {
  const { token } = useSession();
  const [v, setV] = useState({ title: t.title, body: t.body, channels: t.channels as Ch[], isActive: t.isActive });
  const [busy, setBusy] = useState(false);
  const toggle = (c: Ch, on: boolean) => setV({ ...v, channels: on ? [...v.channels, c] : v.channels.filter((x) => x !== c) });
  const save = async () => {
    setBusy(true);
    try { onSaved(await notificationAdmin({ token, save: { key: t.key, ...v }, logChannel: channel, logPage: page })); toast.success('قالب ذخیره شد.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const vars = [...new Set([...`${t.title} ${t.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{t.description}</CardTitle>
        <label className="flex items-center gap-1.5 text-xs"><Switch checked={v.isActive} onCheckedChange={(c) => setV({ ...v, isActive: c })} />فعال</label>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <Textarea rows={3} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        <p className="text-xs text-muted-foreground">متغیرها: {vars.map((x) => `{${x}}`).join('، ')}</p>
        <div className="flex flex-wrap items-center gap-4">
          {(Object.keys(CH) as Ch[]).map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm"><Checkbox disabled={c === 'inApp'} checked={v.channels.includes(c)} onCheckedChange={(x) => toggle(c, !!x)} />{CH[c]}</label>
          ))}
          <Button size="sm" className="mr-auto" disabled={busy} onClick={save}>ذخیره</Button>
        </div>
      </CardContent>
    </Card>
  );
}
