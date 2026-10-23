import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notifications, type NotificationsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@project/components/ui/popover';
import { cn } from '@project/components/lib/utils';
import { useSession } from '../lib/session';
import { fa, jalali } from '../lib/format';

export default function NotificationBell() {
  const { token } = useSession();
  const nav = useNavigate();
  const [data, setData] = useState<NotificationsOutputType>({ items: [], unread: 0 });
  const load = useCallback((extra?: { markAll?: boolean; markRead?: string[] }) =>
    notifications({ token, ...extra }).then(setData).catch(() => undefined), [token]);
  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);
  const open = (n: NotificationsOutputType['items'][0]) => {
    if (!n.isRead) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) }));
      load({ markRead: [n.id] });
    }
    if (n.thesisId) nav(`/thesis/${n.thesisId}`);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="اعلان‌ها">
          <Bell className="h-4 w-4" />
          {data.unread > 0 && <span className="absolute -top-0.5 -left-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{fa(Math.min(99, data.unread))}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" dir="rtl">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">اعلان‌ها</span>
          {data.unread > 0 && <Button variant="ghost" size="sm" onClick={() => { setData((d) => ({ unread: 0, items: d.items.map((x) => ({ ...x, isRead: true })) })); load({ markAll: true }); }}>خواندن همه</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data.items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">اعلانی ندارید.</p>}
          {data.items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={cn('block w-full border-b px-3 py-2 text-right last:border-0 hover:bg-muted', !n.isRead && 'bg-accent/50')}>
              <div className="text-sm font-medium">{n.title}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{jalali(n.at, true)}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
