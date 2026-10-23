import { NavLink } from 'react-router-dom';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import { useSession } from '../lib/session';
import { ROLE_LABELS } from '../lib/format';

const NAV: Record<string, { to: string; label: string }[]> = {
  student: [{ to: '/', label: 'پرونده من' }],
  professor: [{ to: '/', label: 'کارتابل' }, { to: '/theses', label: 'دانشجویان من' }],
  group_manager: [{ to: '/', label: 'داشبورد گروه' }, { to: '/theses', label: 'پرونده‌های گروه' }, { to: '/reports', label: 'گزارش‌ها' }],
  graduate_office: [{ to: '/', label: 'داشبورد' }, { to: '/theses', label: 'همهٔ پرونده‌ها' }, { to: '/terms', label: 'ترم‌ها و کنترل ترم' }, { to: '/reports', label: 'گزارش‌ها' }],
  reviewer: [{ to: '/', label: 'کارتابل داوری' }],
  finance: [{ to: '/', label: 'کارتابل مالی' }, { to: '/theses', label: 'پرونده‌های تمدید' }],
  admin: [
    { to: '/', label: 'داشبورد' }, { to: '/theses', label: 'پرونده‌ها' }, { to: '/admin/users', label: 'کاربران' },
    { to: '/admin/departments', label: 'گروه‌ها' }, { to: '/terms', label: 'ترم‌ها' }, { to: '/reports', label: 'گزارش‌ها' }, { to: '/admin/settings', label: 'تنظیمات' },
    { to: '/admin/audit', label: 'رویدادها' },
  ],
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { me, role, setRole, signOut } = useSession();
  const items = NAV[role] ?? [{ to: '/', label: 'خانه' }];
  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('shomaldoc-theme', dark ? 'dark' : 'light');
  };
  const link = (mobile: boolean) => ({ isActive }: { isActive: boolean }) =>
    cn(
      'whitespace-nowrap rounded-lg px-3 text-sm transition-colors',
      mobile ? 'py-1.5' : 'py-2 hover:bg-muted',
      isActive ? 'bg-secondary font-semibold text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
    );
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="font-extrabold">شمال‌داک</div>
              <div className="text-[11px] text-muted-foreground">دانشگاه شمال آمل</div>
            </div>
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto lg:flex" aria-label="ناوبری اصلی">
            {items.map((i) => <NavLink key={i.to} to={i.to} end className={link(false)}>{i.label}</NavLink>)}
          </nav>
          <div className="mr-auto flex items-center gap-1.5">
            {me.roles.length > 1 && (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 w-36" aria-label="تغییر نقش"><SelectValue /></SelectTrigger>
                <SelectContent>{me.roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="تغییر حالت روشن/تیره">
              <Sun className="h-4 w-4 dark:hidden" /><Moon className="hidden h-4 w-4 dark:block" />
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <NavLink to="/profile" className="gap-2"><UserRound className="h-4 w-4" /><span className="hidden max-w-32 truncate sm:inline">{me.fullName || me.username}</span></NavLink>
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="خروج"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="ناوبری">
          {items.map((i) => <NavLink key={i.to} to={i.to} end className={link(true)}>{i.label}</NavLink>)}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
