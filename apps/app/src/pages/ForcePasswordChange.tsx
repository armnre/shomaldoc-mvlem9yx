import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Button } from '@project/components/ui/button';
import PasswordForm from '../components/PasswordForm';
import Logo from '../components/Logo';
import { useSession } from '../lib/session';

export default function ForcePasswordChange() {
  const { refresh, signOut, me } = useSession();
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <Logo className="h-12 w-12" />
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" />تعیین رمز عبور شخصی</CardTitle>
          <p className="text-sm text-muted-foreground">{me.fullName} عزیز، برای ادامه، رمز موقت صادرشده را به یک رمز شخصی تغییر دهید.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasswordForm onDone={refresh} />
          <Button variant="ghost" className="w-full" onClick={signOut}>خروج</Button>
        </CardContent>
      </Card>
    </div>
  );
}
