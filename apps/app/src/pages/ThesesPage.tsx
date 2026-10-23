import { useSession } from '../lib/session';
import ThesisTable from '../components/ThesisTable';
import { ROLE_LABELS } from '../lib/format';

export default function ThesesPage() {
  const { role } = useSession();
  if (!['professor', 'group_manager', 'graduate_office', 'finance', 'admin'].includes(role))
    return <p className="text-muted-foreground">این بخش برای نقش {ROLE_LABELS[role] ?? '—'} در دسترس نیست.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">پرونده‌های پایان‌نامه</h1>
      <ThesisTable scope={role as 'professor'} />
    </div>
  );
}
