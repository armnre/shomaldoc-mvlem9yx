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
    { label: 'پیشینه، پروپوزال و ایرانداک', value: sum(['LITERATURE_REVIEW', 'LITERATURE_SUPERVISOR_REVIEW', 'LITERATURE_GROUP_REVIEW', 'LITERATURE_REVISION', 'PROPOSAL_DRAFT', 'PROPOSAL_REVIEW', 'PROPOSAL_REVISION', 'IRANDOC_PENDING', 'IRANDOC_REVIEW']) },
    { label: 'مصوب و در حال نگارش', value: sum(['PROPOSAL_APPROVED', 'THESIS_ACTIVE', 'EXTENSION_REQUIRED', 'EXTENSION_REQUESTED', 'SPECIAL_COMMISSION']) },
    { label: 'داوری و دفاع', value: sum(['FINAL_SUPERVISOR_REVIEW', 'PLAGIARISM_CHECK', 'FINAL_REVISION', 'REVIEWER_ASSIGNMENT', 'REVIEWING', 'DEFENSE_SCHEDULING', 'DEFENSE_SCHEDULED']) },
    { label: 'دفاع‌شده / فارغ‌التحصیل', value: sum(['DEFENDED', 'THESIS_COMPLETED', 'GRADUATION_PROCESS', 'GRADUATED']) },
  ];
};

export default function StatsPanel({ scope }: { scope: 'group_manager' | 'graduate_office' | 'admin' }) {
  const { token } = useSession();
  const [d, setD] = useState<DashboardStatsOutputType | null>(null);
  useEffect(() => {
    dashboardStats({ token,  scope }).then(setD).catch((e) => toast.error(errMsg(e)));
  }, [token, scope]);
  if (!d) return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  const chart = d.byStatus.map((r) => ({ name: STATUS[r.status]?.label ?? r.status, count: r.count }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {groups(d.byStatus).map((g) => (
          <Card key={g.label} className="relative overflow-hidden first:bg-primary first:text-primary-foreground">
            <CardContent className="p-4 sm:p-5">
              <div className="text-xs leading-5 opacity-75 sm:text-sm">{g.label}</div>
              <div className="mt-1 text-2xl font-extrabold sm:text-3xl">{fa(g.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {chart.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">توزیع پرونده‌ها بر اساس وضعیت</CardTitle></CardHeader>
          <CardContent style={{ height: Math.max(220, chart.length * 30 + 40) }} dir="ltr">
            <ResponsiveContainer>
              <BarChart data={chart} layout="vertical" margin={{ left: 16, right: 16 }}>
                <XAxis type="number" allowDecimals={false} tickFormatter={(v) => fa(v)} />
                <YAxis type="category" dataKey="name" width={150} orientation="right" tick={{ fontSize: 12 }} />
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
