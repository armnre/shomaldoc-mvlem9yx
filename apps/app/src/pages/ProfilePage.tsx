import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Monitor } from 'lucide-react';
import { mySessions, type MySessionsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Badge } from '@project/components/ui/badge';
import { Skeleton } from '@project/components/ui/skeleton';
import PasswordForm from '../components/PasswordForm';
import { useSession } from '../lib/session';
import { errMsg, fa, jalali, ROLE_LABELS } from '../lib/format';

const device = (ua: string) =>
  `${/Mobile|Android|iPhone/.test(ua) ? 'موبایل' : 'رایانه'} — ${/Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'مرورگر'}`;

export default function ProfilePage() {
  const { me, token } = useSession();
  const [sessions, setSessions] = useState<MySessionsOutputType['sessions'] | null>(null);
  const load = useCallback((revokeId?: string) => {
    mySessions({ token, revokeId }).then((r) => setSessions(r.sessions)).catch((e) => toast.error(errMsg(e)));
  }, [token]);
  useEffect(() => load(), [load]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>حساب کاربری</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-muted-foreground">نام</div><div className="font-medium">{me.fullName || '—'}</div></div>
            <div><div className="text-muted-foreground">نام کاربری</div><div dir="ltr" className="text-right font-medium">{me.username}</div></div>
            <div><div className="text-muted-foreground">گروه آموزشی</div><div className="font-medium">{me.departmentName ?? '—'}</div></div>
            {me.studentNumber && <div><div className="text-muted-foreground">شماره دانشجویی</div><div className="font-medium">{fa(me.studentNumber)}</div></div>}
          </div>
          <div className="flex flex-wrap gap-2">{me.roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r]}</Badge>)}</div>
          <p className="text-xs text-muted-foreground">برای اصلاح نام یا مشخصات تحصیلی با مدیر سامانه تماس بگیرید.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>تغییر رمز عبور</CardTitle></CardHeader>
        <CardContent><PasswordForm onDone={() => load()} /></CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>نشست‌های فعال</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!sessions && <Skeleton className="h-16" />}
          {sessions?.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{device(s.userAgent)} {s.current && <Badge className="mr-2">همین دستگاه</Badge>}</div>
                  <div className="text-xs text-muted-foreground">ورود: {jalali(s.createdAt, true)} · آخرین فعالیت: {jalali(s.lastSeenAt, true)}</div>
                </div>
              </div>
              {!s.current && <Button size="sm" variant="outline" onClick={() => load(s.id)}>پایان نشست</Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
