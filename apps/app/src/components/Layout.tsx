import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, Building2, CalendarRange, ClipboardList, FileText, FolderOpen, Inbox, LayoutDashboard, LogOut,
  Menu, Moon, ScrollText, Settings, SlidersHorizontal, Sun, UserRound, Users, Wallet, type LucideIcon,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@project/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { cn } from '@project/components/lib/utils';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import DevCredit from './DevCredit';
import { useSession } from '../lib/session';
import { ROLE_LABELS } from '../lib/format';

type Item = { to: string; label: string; icon: LucideIcon };
const NAV: Record<string, Item[]> = {
  student: [{ to: '/', label: 'پرونده من', icon: FileText }, { to: '/profile', label: 'حساب کاربری', icon: UserRound }],
  professor: [{ to: '/', label: 'کارتابل', icon: Inbox }, { to: '/theses', label: 'دانشجویان من', icon: FolderOpen }],
  group_manager: [{ to: '/', label: 'داشبورد گروه', icon: LayoutDashboard }, { to: '/theses', label: 'پرونده‌های گروه', icon: FolderOpen }, { to: '/reports', label: 'گزارش‌ها', icon: BarChart3 }],
  graduate_office: [{ to: '/', label: 'داشبورد', icon: LayoutDashboard }, { to: '/theses', label: 'همهٔ پرونده‌ها', icon: FolderOpen }, { to: '/terms', label: 'ترم‌ها و کنترل ترم', icon: CalendarRange }, { to: '/reports', label: 'گزارش‌ها', icon: BarChart3 }],
  reviewer: [{ to: '/', label: 'کارتابل داوری', icon: ClipboardList }],
  finance: [{ to: '/', label: 'کارتابل مالی', icon: Wallet }, { to: '/theses', label: 'پرونده‌های تمدید', icon: FolderOpen }],
  admin: [
    { to: '/', label: 'داشبورد', icon: LayoutDashboard }, { to: '/theses', label: 'پرونده‌ها', icon: FolderOpen },
    { to: '/admin/users', label: 'کاربران و نقش‌ها', icon: Users }, { to: '/admin/departments', label: 'گروه‌های آموزشی', icon: Building2 },
    { to: '/admin/config', label: 'پیکربندی فرآیند', icon: SlidersHorizontal }, { to: '/terms', label: 'ترم‌ها', icon: CalendarRange },
    { to: '/reports', label: 'گزارش‌ها', icon: BarChart3 }, { to: '/admin/settings', label: 'تنظیمات', icon: Settings },
    { to: '/admin/audit', label: 'رویدادها', icon: ScrollText },
  ],
};

function NavList({ items, onPick }: { items: Item[]; onPick?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="ناوبری اصلی">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end onClick={onPick} className={({ isActive }) => cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
          isActive ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-sm' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}>
          <Icon className="h-4 w-4 shrink-0" />{label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarBody({ items, onPick }: { items: Item[]; onPick?: () => void }) {
  const { me, role, setRole } = useSession();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground">
      <NavLink to="/" onClick={onPick} className="flex items-center gap-3 border-b border-sidebar-border pb-4">
        <div className="rounded-xl bg-white p-1"><Logo /></div>
        <div className="leading-tight">
          <div className="text-lg font-extrabold text-white">شمال‌داک</div>
          <div className="text-[11px] text-sidebar-foreground/70">سامانهٔ پایان‌نامه · دانشگاه شمال آمل</div>
        </div>
      </NavLink>
      <div className="rounded-xl bg-sidebar-accent p-3">
        <div className="truncate text-sm font-bold text-white">{me.fullName || me.username}</div>
        {me.roles.length > 1 ? (
          <Select value={role} onValueChange={(r) => { setRole(r); navigate('/'); onPick?.(); }}>
            <SelectTrigger className="mt-2 h-8 border-sidebar-border bg-sidebar text-xs text-sidebar-foreground" aria-label="تغییر نقش"><SelectValue /></SelectTrigger>
            <SelectContent>{me.roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}</SelectContent>
          </Select>
        ) : <div className="mt-1 text-xs text-sidebar-primary">{ROLE_LABELS[role] ?? role}</div>}
      </div>
      <div className="flex-1 overflow-y-auto"><NavList items={items} onPick={onPick} /></div>

    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { me, role, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const items = NAV[role] ?? [{ to: '/', label: 'خانه', icon: LayoutDashboard }];
  const toggleTheme = () => {
    const dark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('shomaldoc-theme', dark ? 'dark' : 'light');
  };
  return (
    <div dir="rtl" className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block"><SidebarBody items={items} /></aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4 md:px-8">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="منو"><Menu className="h-5 w-5" /></Button></SheetTrigger>
              <SheetContent side="right" className="w-72 border-0 p-0"><SidebarBody items={items} onPick={() => setOpen(false)} /></SheetContent>
            </Sheet>
            <div className="hidden text-sm text-muted-foreground sm:block">
              نقش فعال: <span className="font-semibold text-foreground">{ROLE_LABELS[role] ?? role}</span>
            </div>
            <div className="mr-auto flex items-center gap-1.5">
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
        </header>
        <main className="mx-auto max-w-7xl px-3 py-5 sm:px-4 md:px-8 md:py-8">{children}</main>
        <footer className="mx-auto flex max-w-7xl flex-col items-center gap-3 border-t px-4 py-5 text-center text-[11px] text-muted-foreground sm:flex-row sm:justify-between sm:text-right md:px-8">
          <span>© ۱۴۰۵ دانشگاه شمال، معاونت پژوهش و فناوری — کلیه حقوق محفوظ است.</span>
          <DevCredit />
        </footer>
      </div>
    </div>
  );
}
