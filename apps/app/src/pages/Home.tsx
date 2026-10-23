import { Clock } from 'lucide-react';
import ReviewerInbox from '../components/ReviewerInbox';
import { Card, CardContent } from '@project/components/ui/card';
import { useSession } from '../lib/session';
import { ROLE_LABELS } from '../lib/format';
import StudentHome from './student/StudentHome';
import ThesisTable from '../components/ThesisTable';
import StatsPanel from '../components/StatsPanel';

const INBOX_TITLE: Record<string, string> = {
  professor: 'درخواست‌های راهنمایی، پیشینه، پروپوزال، نسخهٔ نهایی و تمدیدهای منتظر شما',
  group_manager: 'موضوع‌ها، تخصیص استاد، تعیین داور، پروپوزال‌ها و تمدیدهای منتظر گروه',
  graduate_office: 'ایرانداک، همانندجویی، دفاع، کمیسیون، پروپوزال و تمدیدهای منتظر تحصیلات تکمیلی',
  finance: 'درخواست‌های تمدید منتظر تأیید مالی',
  admin: 'همهٔ پرونده‌ها',
};

export default function Home() {
  const { me, role } = useSession();
  if (!role)
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Clock className="h-10 w-10 text-primary" />
          <h1 className="text-xl font-bold">برای حساب شما نقشی تعیین نشده است</h1>
          <p className="text-sm text-muted-foreground">لطفاً با مدیر سامانه تماس بگیرید تا نقش و گروه آموزشی شما تعیین شود.</p>
        </CardContent>
      </Card>
    );
  if (role === 'student') return <StudentHome />;
  if (role === 'reviewer') return <ReviewerInbox />;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">سلام{me.fullName ? `، ${me.fullName}` : ''}</h1>
        <p className="text-muted-foreground">{ROLE_LABELS[role]}{me.departmentName ? ` — گروه ${me.departmentName}` : ''}</p>
      </div>
      {['group_manager', 'graduate_office', 'admin'].includes(role) && <StatsPanel scope={role as 'admin'} />}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">کارتابل</h2>
          <p className="text-sm text-muted-foreground">{INBOX_TITLE[role]}</p>
        </div>
        <ThesisTable scope={role as 'professor'} inboxOnly={role !== 'admin'} />
      </section>
      {role === 'professor' && <ReviewerInbox hideWhenEmpty />}
    </div>
  );
}
