import { useSession } from '../../lib/session';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminStructure, type AdminStructureOutputType, adminResetPassword, adminUpdateUser, type AdminUpdateUserInputType, type ListDepartmentsOutputType } from 'zitejs/api';
import { Button } from '@project/components/ui/button';
import { Checkbox } from '@project/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@project/components/ui/select';
import { errMsg, ROLE_LABELS } from '../../lib/format';
import type { AdminUser } from './AdminUsers';

const ROLES: AdminUpdateUserInputType['roles'] = ['student', 'professor', 'group_manager', 'graduate_office', 'finance', 'reviewer', 'admin'];

const genPassword = () => {
  const a = 'abcdefghjkmnpqrstuvwxyz', d = '23456789';
  const r = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  return Array.from({ length: 6 }, () => r(a)).join('') + r(d) + r(d);
};

export default function UserEditDialog({ user, departments, onClose, onSaved }: {
  user: AdminUser | null; departments: ListDepartmentsOutputType['departments']; onClose: () => void; onSaved: () => void;
}) {
  const { token } = useSession();
  const [f, setF] = useState({
    username: user?.username ?? '', fullName: user?.fullName ?? '', roles: (user?.roles ?? []) as AdminUpdateUserInputType['roles'],
    departmentId: user?.departmentId ?? '', studentNumber: user?.studentNumber ?? '', nationalCode: '', degree: user?.degree ?? '',
    programName: user?.programName ?? '', programId: user?.programId ?? '', academicRank: user?.academicRank ?? '', baseCapacity: user?.baseCapacity ?? 0,
    eligibleForThesis: user?.eligibleForThesis ?? false, disabled: user?.disabled ?? false,
  });
  const [temp, setTemp] = useState(user ? '' : genPassword());
  const resetPw = async () => {
    if (!user) return;
    const pw = genPassword();
    try {
      await adminResetPassword({ token, profileId: user.profileId, tempPassword: pw });
      setTemp(pw);
      toast.success('رمز موقت جدید صادر شد و نشست‌های کاربر بسته شد.');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const toggle = (r: AdminUpdateUserInputType['roles'][number]) => set('roles', f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r]);
  const ncInvalid = f.nationalCode !== '' && !/^\d{10}$/.test(f.nationalCode);
  const save = async () => {
    setBusy(true);
    try {
      await adminUpdateUser({ token, profileId: user?.profileId, tempPassword: user ? undefined : temp, ...f, departmentId: f.departmentId || null, programId: f.programId || null, nationalCode: f.nationalCode || undefined });
      toast.success('کاربر به‌روزرسانی شد.');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{user ? 'ویرایش کاربر' : 'ایجاد کاربر جدید'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="un">نام کاربری</Label><Input id="un" dir="ltr" value={f.username} onChange={(e) => set('username', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>رمز موقت</Label>
            {temp ? (
              <div className="flex items-center gap-2"><code dir="ltr" className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm">{temp}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(temp); toast.success('کپی شد'); }}>کپی</Button></div>
            ) : <Button type="button" variant="outline" className="w-full" onClick={resetPw}>صدور رمز موقت جدید و رفع قفل</Button>}
            {temp && <p className="text-xs text-muted-foreground">این رمز را به‌صورت امن به کاربر بدهید؛ دوباره نمایش داده نمی‌شود.</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>نام و نام خانوادگی</Label><Input value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
          <div className="space-y-2 sm:col-span-2">
            <Label>نقش‌ها</Label>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm"><Checkbox checked={f.roles.includes(r)} onCheckedChange={() => toggle(r)} />{ROLE_LABELS[r]}</label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>گروه آموزشی</Label>
            <Select value={f.departmentId || undefined} onValueChange={(v) => set('departmentId', v)}>
              <SelectTrigger><SelectValue placeholder="انتخاب گروه" /></SelectTrigger>
              <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.roles.includes('student') && (
            <>
              <div className="space-y-1.5"><Label>شماره دانشجویی</Label><Input value={f.studentNumber} onChange={(e) => set('studentNumber', e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>کد ملی {user?.nationalCodeMasked && <span className="text-xs text-muted-foreground" dir="ltr">(فعلی: {user?.nationalCodeMasked})</span>}</Label>
                <Input dir="ltr" placeholder="برای تغییر وارد کنید" value={f.nationalCode} onChange={(e) => set('nationalCode', e.target.value.replace(/\D/g, ''))} maxLength={10} />
                {ncInvalid && <p className="text-xs text-destructive">کد ملی باید ۱۰ رقم باشد.</p>}
              </div>
              <div className="space-y-1.5"><Label>رشته/گرایش</Label><ProgramSelect departmentId={f.departmentId} value={f.programId} onChange={(id, label) => setF((x) => ({ ...x, programId: id, programName: label }))} /></div>
              <div className="space-y-1.5">
                <Label>مقطع</Label>
                <Select value={f.degree || undefined} onValueChange={(v) => set('degree', v)}>
                  <SelectTrigger><SelectValue placeholder="انتخاب مقطع" /></SelectTrigger>
                  <SelectContent><SelectItem value="کارشناسی ارشد">کارشناسی ارشد</SelectItem><SelectItem value="دکتری">دکتری</SelectItem></SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={f.eligibleForThesis} onCheckedChange={(c) => set('eligibleForThesis', !!c)} />درس پایان‌نامه را اخذ کرده است (واجد شرایط)</label>
            </>
          )}
          {f.roles.includes('professor') && (
            <>
              <div className="space-y-1.5">
                <Label>مرتبه علمی</Label>
                <Select value={f.academicRank || undefined} onValueChange={(v) => set('academicRank', v)}>
                  <SelectTrigger><SelectValue placeholder="انتخاب مرتبه" /></SelectTrigger>
                  <SelectContent>{['مربی', 'استادیار', 'دانشیار', 'استاد'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>ظرفیت راهنمایی</Label><Input type="number" min={0} max={50} value={f.baseCapacity} onChange={(e) => set('baseCapacity', Math.max(0, Math.min(50, Number(e.target.value) || 0)))} /></div>
            </>
          )}
          {user && <label className="flex items-center gap-2 text-sm text-destructive sm:col-span-2"><Checkbox checked={f.disabled} onCheckedChange={(c) => set('disabled', !!c)} />غیرفعال‌سازی حساب (نشست‌های فعال بسته می‌شود)</label>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>انصراف</Button>
          <Button onClick={save} disabled={busy || ncInvalid || f.username.trim().length < 3 || f.fullName.trim().length < 3}>{busy ? 'در حال ذخیره…' : 'ذخیره'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgramSelect({ departmentId, value, onChange }: { departmentId: string; value: string; onChange: (id: string, label: string) => void }) {
  const { token } = useSession();
  const [programs, setPrograms] = useState<AdminStructureOutputType['programs']>([]);
  useEffect(() => { adminStructure({ token, op: 'list' }).then((r) => setPrograms(r.programs)).catch(() => undefined); }, [token]);
  const list = programs.filter((p) => p.isActive && (!departmentId || p.departmentId === departmentId));
  const label = (p: AdminStructureOutputType['programs'][number]) => `${p.name}${p.specialization ? ' — ' + p.specialization : ''} (${p.degree})`;
  if (!list.length) return <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">برای این گروه رشته‌ای تعریف نشده است (پیکربندی ← ساختار آموزشی).</p>;
  return (
    <Select value={value || undefined} onValueChange={(v) => { const p = list.find((x) => x.id === v); onChange(v, p ? label(p) : ''); }}>
      <SelectTrigger><SelectValue placeholder="انتخاب رشته/گرایش" /></SelectTrigger>
      <SelectContent>{list.map((p) => <SelectItem key={p.id} value={p.id}>{label(p)}</SelectItem>)}</SelectContent>
    </Select>
  );
}
