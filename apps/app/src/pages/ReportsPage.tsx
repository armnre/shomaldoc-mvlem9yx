import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { reports, type ReportsOutputType } from 'zitejs/api';
import { Card, CardContent, CardHeader, CardTitle } from '@project/components/ui/card';
import { Skeleton } from '@project/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@project/components/ui/table';
import StatsPanel from '../components/StatsPanel';
import ThesisReport from '../components/ThesisReport';
import { useSession } from '../lib/session';
import { errMsg, fa } from '../lib/format';

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></CardContent></Card>
);

export default function ReportsPage() {
  const { token, role } = useSession();
  const scope = (['group_manager', 'graduate_office', 'admin'].includes(role) ? role : 'admin') as 'admin';
  const [d, setD] = useState<ReportsOutputType | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { reports({ token, scope }).then(setD).catch((e) => setError(errMsg(e))); }, [token, scope]);
  if (error) return <p className="text-destructive">{error}</p>;
  if (!d) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const k = d.kpis;
  const csv = () => {
    const lines = ['استاد,فعال,دفاع‌شده,ظرفیت', ...d.supervisors.map((s) => `${s.name},${s.active},${s.defended},${s.capacity}`)];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }));
    a.download = 'supervisors-report.csv';
    a.click();
  };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">گزارش‌ها</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="کل پرونده‌ها" value={fa(k.total)} />
        <Kpi label="پرونده‌های در جریان" value={fa(k.active)} />
        <Kpi label="دفاع‌شده" value={fa(k.defended)} />
        <Kpi label="میانگین نمرهٔ دفاع" value={k.avgScore ? fa(k.avgScore) : '—'} />
        <Kpi label="میانگین همانندی" value={k.avgSimilarity ? `${fa(k.avgSimilarity)}٪` : '—'} />
        <Kpi label="میانگین روز از تصویب تا دفاع" value={k.avgDaysToDefense ? fa(k.avgDaysToDefense) : '—'} />
        <Kpi label="درخواست‌های تمدید (تأییدشده)" value={`${fa(k.extensions)} (${fa(k.extensionsApproved)})`} />
        <Kpi label="نیازمند تمدید / کمیسیون" value={fa(k.overdue)} />
      </div>
      <ThesisReport scope={scope} />
      <StatsPanel scope={scope} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">دفاع‌های ۱۲ ماه اخیر</CardTitle></CardHeader>
          <CardContent className="h-64">
            {d.monthly.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">هنوز دفاعی ثبت نشده است.</p> : (
              <ResponsiveContainer><BarChart data={d.monthly}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="month" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="defended" name="دفاع" fill="hsl(var(--chart-1))" radius={4} /></BarChart></ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">توزیع درجهٔ دفاع</CardTitle></CardHeader>
          <CardContent className="h-64">
            {d.grades.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">داده‌ای وجود ندارد.</p> : (
              <ResponsiveContainer><BarChart data={d.grades}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="grade" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend /><Bar dataKey="count" name="تعداد" fill="hsl(var(--chart-2))" radius={4} /></BarChart></ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">بار راهنمایی اساتید</CardTitle>
          <button onClick={csv} className="text-sm text-primary underline">خروجی CSV</button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>استاد</TableHead><TableHead>در جریان</TableHead><TableHead>دفاع‌شده</TableHead><TableHead>ظرفیت پایه</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.supervisors.map((s) => (
                <TableRow key={s.name}><TableCell>{s.name}</TableCell><TableCell>{fa(s.active)}</TableCell><TableCell>{fa(s.defended)}</TableCell>
                  <TableCell className={s.active >= s.capacity && s.capacity > 0 ? 'font-bold text-destructive' : ''}>{fa(s.capacity)}</TableCell></TableRow>
              ))}
              {d.supervisors.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">داده‌ای وجود ندارد.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
