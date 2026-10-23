import { useSession } from '../lib/session';
import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { dashboardStats, type DashboardStatsOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Skeleton } from '@project/components/ui/skeleton';
import { errMsg, fa, STATUS } from '../lib/format';

const groups = (rows: DashboardStatsOutputType['byStatus']) => {
  const sum = (keys: string[]) => rows.filter((r) => keys.includes(r.status)).reduce((a, b) => a + b.count, 0);
  return [
    { label: 'کل پرونده‌ها', value: rows.reduce((a, b) => a + b.count, 0) },
    { label: 'در مرحله موضوع/استاد', value: sum(['DRAFT', 'WAITING_SUPERVISOR', 'SUPERVISOR_REJECTED', 'GROUP_ASSIGNMENT', 'GROUP_REVIEW', 'TOPIC_REVISION']) },
    { label: 'پیشینه و پروپوزال', value: sum(['LITERATURE_REVIEW', 'LITERATURE_SUPERVISOR_REVIEW', 'LITERATURE_REVISION', 'PROPOSAL_DRAFT', 'PROPOSAL_REVIEW', 'PROPOSAL_REVISION']) },
    { label: 'پروپوزال مصوب', value: sum(['PROPOSAL_APPROVED']) },
  ];
};

export default function StatsPanel({ scope }: { scope: 'group_manager' | 'graduate_office' | 'admin' }) {
  const { token } = useSession();
  const [d, setD] = useState<DashboardStatsOutputType | null>(null);
  useEffect(() => {
    dashboardStats({ token,  scope }).then(setD).catch((e) => toast.error(errMsg(e)));
  }, [token, scope]);
  if (!d) return <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  const chart = d.byStatus.map((r) => ({ name: STATUS[r.status]?.label ?? r.status, count: r.count }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {groups(d.byStatus).map((g) => (
          <Card key={g.label}>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">{g.label}</div>
              <div className="mt-1 text-3xl font-bold text-primary">{fa(g.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {chart.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">توزیع پرونده‌ها بر اساس وضعیت</CardTitle></CardHeader>
          <CardContent className="h-72" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis type="number" allowDecimals={false} tickFormatter={(v) => fa(v)} />
                <YAxis type="category" dataKey="name" width={170} orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => fa(v)} />
                <Bar dataKey="count" name="تعداد" fill="hsl(var(--chart-1))" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
