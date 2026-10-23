import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@project/components/ui/button';
import { useSession } from '../lib/session';

/** Blocks a page unless the currently active role is allowed. */
export default function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { role } = useSession();
  if (roles.includes(role)) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center shadow-sm">
      <ShieldAlert className="h-10 w-10 text-destructive" />
      <h1 className="text-lg font-bold">دسترسی غیرمجاز</h1>
      <p className="text-sm text-muted-foreground">نقش فعلی شما اجازهٔ مشاهدهٔ این بخش را ندارد.</p>
      <Button asChild><Link to="/">بازگشت به صفحهٔ اصلی</Link></Button>
    </div>
  );
}
