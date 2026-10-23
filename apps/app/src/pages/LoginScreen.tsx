import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, FileCheck2, KeyRound, Loader2, ShieldCheck, Workflow } from 'lucide-react';
import { authStatus, login, setupAdmin } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Checkbox } from '@project/components/ui/checkbox';
import Logo from '../components/Logo';
import DevCredit from '../components/DevCredit';
import { errMsg } from '../lib/format';
import { setToken } from '../lib/token';

const FEATURES = [
  { icon: Workflow, text: 'پیگیری آنلاین همهٔ مراحل از ثبت موضوع تا تصویب و تمدید' },
  { icon: FileCheck2, text: 'نسخه‌بندی کامل موضوع، پیشینه و پروپوزال' },
  { icon: ShieldCheck, text: 'تأیید مرحله‌ای توسط نقش‌های مجاز و ثبت کامل رویدادها' },
];

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { authStatus({}).then((r) => setSetup(r.needsSetup)).catch(() => setSetup(false)); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (setup) {
        await setupAdmin({ fullName, username, password });
        toast.success('حساب مدیر سیستم ایجاد شد.');
      }
      const r = await login({ username, password, userAgent: navigator.userAgent });
      setToken(r.token, remember);
      onSignedIn();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const valid = username.trim().length >= 3 && password.length >= (setup ? 8 : 1) && (!setup || fullName.trim().length >= 3);

  return (
    <div dir="rtl" className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-sidebar-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo className="h-12 w-12" />
          <div>
            <div className="text-xl font-bold text-white">شمال‌داک</div>
            <div className="text-sm opacity-75">دانشگاه شمال آمل</div>
          </div>
        </div>
        <div className="relative space-y-8">
          <h1 className="text-4xl font-extrabold leading-[1.4] text-white">
            پروندهٔ الکترونیکی پایان‌نامه
            <br />
            <span className="text-sidebar-primary">بدون کاغذ، بدون مراجعهٔ حضوری</span>
          </h1>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><f.icon className="h-5 w-5 text-sidebar-primary" /></span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative space-y-1 text-xs opacity-70"><p>© ۱۴۰۵ دانشگاه شمال، معاونت پژوهش و فناوری — کلیه حقوق محفوظ است.</p></div>
      </aside>
      <main className="flex flex-col items-center justify-center gap-10 bg-background p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="space-y-3 text-center lg:text-right">
            <Logo className="mx-auto h-14 w-14 lg:hidden" />
            <h2 className="text-2xl font-bold">{setup ? 'راه‌اندازی اولیه سامانه' : 'ورود به سامانه'}</h2>
            <p className="text-sm text-muted-foreground">
              {setup ? 'حساب نخستین مدیر سیستم را بسازید. سایر حساب‌ها از پنل مدیریت صادر می‌شوند.' : 'با شماره دانشجویی یا کد پرسنلی و رمز عبور خود وارد شوید.'}
            </p>
          </div>
          {setup === null ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /> : (
            <>
              {setup && (
                <div className="space-y-1.5"><Label htmlFor="fn">نام و نام خانوادگی</Label><Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="un">نام کاربری</Label>
                <Input id="un" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">رمز عبور</Label>
                <div className="relative">
                  <Input id="pw" dir="ltr" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete={setup ? 'new-password' : 'current-password'} className="h-11 pl-10" />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'} className="absolute left-3 top-3 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {setup && <p className="text-xs text-muted-foreground">حداقل ۸ نویسه، شامل حرف لاتین و عدد.</p>}
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={remember} onCheckedChange={(c) => setRemember(!!c)} />مرا در این دستگاه به خاطر بسپار</label>
              {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <Button type="submit" size="lg" className="h-11 w-full" disabled={!valid || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="ml-2 h-4 w-4" />{setup ? 'ایجاد حساب و ورود' : 'ورود'}</>}
              </Button>
              {!setup && <p className="text-center text-xs text-muted-foreground">فراموشی رمز؟ برای بازنشانی با مدیر سامانه یا تحصیلات تکمیلی تماس بگیرید.</p>}
            </>
          )}
        </form>
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] text-muted-foreground lg:hidden">© ۱۴۰۵ دانشگاه شمال — کلیه حقوق محفوظ است.</p>
          <DevCredit />
        </div>
      </main>
    </div>
  );
}
