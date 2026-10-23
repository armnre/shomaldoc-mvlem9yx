export const ROLE_LABELS: Record<string, string> = {
  student: 'دانشجو',
  professor: 'استاد',
  group_manager: 'مدیر گروه',
  graduate_office: 'تحصیلات تکمیلی',
  finance: 'امور مالی',
  reviewer: 'داور',
  admin: 'مدیر سیستم',
  security: 'امنیت',
  supervisor: 'استاد راهنما',
  system: 'سامانه',
  self: 'کاربر',
};

export const STATUS: Record<string, { label: string; tone: 'gray' | 'amber' | 'blue' | 'green' | 'red' }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'gray' },
  WAITING_SUPERVISOR: { label: 'در انتظار استاد راهنما', tone: 'amber' },
  SUPERVISOR_REJECTED: { label: 'رد توسط استاد', tone: 'red' },
  GROUP_ASSIGNMENT: { label: 'تخصیص استاد توسط گروه', tone: 'amber' },
  GROUP_REVIEW: { label: 'بررسی گروه', tone: 'blue' },
  TOPIC_REVISION: { label: 'اصلاح موضوع', tone: 'amber' },
  LITERATURE_REVIEW: { label: 'نگارش پیشینه تحقیق', tone: 'blue' },
  LITERATURE_SUPERVISOR_REVIEW: { label: 'بررسی پیشینه توسط راهنما', tone: 'amber' },
  LITERATURE_REVISION: { label: 'اصلاح پیشینه', tone: 'amber' },
  PROPOSAL_DRAFT: { label: 'تدوین پروپوزال', tone: 'blue' },
  PROPOSAL_REVIEW: { label: 'بررسی پروپوزال', tone: 'amber' },
  PROPOSAL_REVISION: { label: 'اصلاح پروپوزال', tone: 'amber' },
  PROPOSAL_APPROVED: { label: 'پروپوزال تصویب شد', tone: 'green' },
  IRANDOC_PENDING: { label: 'در انتظار ثبت ایرانداک', tone: 'blue' },
  IRANDOC_REVIEW: { label: 'بررسی ایرانداک', tone: 'amber' },
  THESIS_ACTIVE: { label: 'پایان‌نامه مصوب و فعال', tone: 'green' },
  EXTENSION_REQUIRED: { label: 'نیازمند تمدید', tone: 'red' },
  EXTENSION_REQUESTED: { label: 'بررسی درخواست تمدید', tone: 'amber' },
  SPECIAL_COMMISSION: { label: 'کمیسیون موارد خاص', tone: 'amber' },
  FINAL_SUPERVISOR_REVIEW: { label: 'بررسی نسخهٔ نهایی توسط راهنما', tone: 'amber' },
  FINAL_REVISION: { label: 'اصلاح نسخهٔ نهایی', tone: 'amber' },
  PLAGIARISM_CHECK: { label: 'همانندجویی', tone: 'amber' },
  REVIEWER_ASSIGNMENT: { label: 'تعیین داوران', tone: 'amber' },
  REVIEWING: { label: 'در حال داوری', tone: 'blue' },
  DEFENSE_SCHEDULING: { label: 'تعیین زمان دفاع', tone: 'amber' },
  DEFENSE_SCHEDULED: { label: 'دفاع زمان‌بندی شد', tone: 'blue' },
  DEFENDED: { label: 'دفاع شده', tone: 'green' },
  REJECTED: { label: 'رد شده', tone: 'red' },
  CANCELLED: { label: 'لغو شده', tone: 'red' },
};

export const ACTION_LABELS: Record<string, string> = {
  supervisor_accept: 'پذیرش راهنمایی',
  supervisor_reject: 'رد درخواست راهنمایی',
  group_assign_supervisor: 'تخصیص استاد راهنما',
  group_approve_topic: 'تأیید موضوع',
  group_topic_revision: 'برگشت موضوع برای اصلاح',
  group_reject: 'رد نهایی موضوع',
  set_advisor: 'تعیین/تغییر استاد مشاور',
  literature_approve: 'تأیید پیشینه',
  literature_revision: 'برگشت پیشینه برای اصلاح',
  proposal_approve: 'تأیید پروپوزال',
  proposal_revision: 'برگشت پروپوزال برای اصلاح',
  irandoc_approve: 'تأیید ایرانداک و تصویب نهایی',
  irandoc_reject: 'رد اطلاعات ایرانداک',
  commission_approve: 'ثبت موافقت کمیسیون',
  commission_reject: 'ثبت مخالفت کمیسیون',
  extension_approve: 'تأیید تمدید',
  extension_reject: 'رد تمدید',
  final_approve: 'تأیید نسخهٔ نهایی',
  final_revision: 'برگشت نسخهٔ نهایی برای اصلاح',
  plagiarism_pass: 'ثبت همانندجویی (قبول)',
  plagiarism_fail: 'ثبت همانندجویی (نیازمند اصلاح)',
  assign_reviewers: 'تعیین داوران',
  schedule_defense: 'تعیین زمان و محل دفاع',
  record_defense: 'ثبت نتیجهٔ دفاع و صدور صورتجلسه',
  cancel: 'لغو پرونده',
};

export const STEP_LABELS: Record<string, string> = {
  supervisor: 'استاد راهنما',
  group_manager: 'مدیر گروه',
  graduate_office: 'تحصیلات تکمیلی',
  finance: 'امور مالی',
};

export const STAGES = [
  { key: 'topic', label: 'موضوع و استاد', statuses: ['DRAFT', 'WAITING_SUPERVISOR', 'SUPERVISOR_REJECTED', 'GROUP_ASSIGNMENT'] },
  { key: 'group', label: 'تأیید گروه', statuses: ['GROUP_REVIEW', 'TOPIC_REVISION'] },
  { key: 'lit', label: 'پیشینه تحقیق', statuses: ['LITERATURE_REVIEW', 'LITERATURE_SUPERVISOR_REVIEW', 'LITERATURE_REVISION'] },
  { key: 'proposal', label: 'پروپوزال', statuses: ['PROPOSAL_DRAFT', 'PROPOSAL_REVIEW', 'PROPOSAL_REVISION'] },
  { key: 'irandoc', label: 'ایرانداک', statuses: ['PROPOSAL_APPROVED', 'IRANDOC_PENDING', 'IRANDOC_REVIEW'] },
  { key: 'active', label: 'تصویب و اجرا', statuses: ['THESIS_ACTIVE', 'EXTENSION_REQUIRED', 'EXTENSION_REQUESTED', 'SPECIAL_COMMISSION'] },
  { key: 'final', label: 'نسخه نهایی و همانندجویی', statuses: ['FINAL_SUPERVISOR_REVIEW', 'FINAL_REVISION', 'PLAGIARISM_CHECK'] },
  { key: 'review', label: 'داوری', statuses: ['REVIEWER_ASSIGNMENT', 'REVIEWING'] },
  { key: 'defense', label: 'دفاع', statuses: ['DEFENSE_SCHEDULING', 'DEFENSE_SCHEDULED', 'DEFENDED'] },
];

export const fa = (n: number | string) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

export function jalali(iso?: string, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric', month: 'long', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

export const errMsg = (e: unknown) => {
  const err = e as { userFacingMessage?: string; code?: string; status?: number; message?: string };
  if (err?.code === 'UNAUTHORIZED' && err.message === 'invalid session') {
    localStorage.removeItem('shomaldoc-session');
    sessionStorage.removeItem('shomaldoc-session');
    setTimeout(() => window.location.reload(), 1200);
  }
  return err?.userFacingMessage || (e instanceof Error ? e.message : 'خطای ناشناخته');
};
