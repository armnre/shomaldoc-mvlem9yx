// Shared server-side logic for ShomalDoc endpoints (imported only from src/api).
import { zite, type ProfilesRecordType, type ThesesRecordType } from 'zitejs/db';
import { ZiteError } from 'zitejs/backend';

export type Role = 'student' | 'professor' | 'group_manager' | 'graduate_office' | 'finance' | 'reviewer' | 'admin';
export type Step = 'supervisor' | 'group_manager' | 'graduate_office' | 'finance';
export type Profile = ProfilesRecordType;

export const first = (v?: string | string[] | null): string | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

export function forbidden(msg = 'شما مجوز انجام این عملیات را ندارید.'): never {
  throw new ZiteError({ code: 'FORBIDDEN', message: msg, userFacingMessage: msg });
}
export function bad(msg: string): never {
  throw new ZiteError({ code: 'BAD_REQUEST', message: msg, userFacingMessage: msg });
}
export function unauthorized(msg = 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.'): never {
  throw new ZiteError({ code: 'UNAUTHORIZED', message: 'invalid session', userFacingMessage: msg });
}

// ---------- Crypto (WebCrypto, PBKDF2-SHA256) ----------
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Self-hosted server sets 600k (OWASP 2023). The Zite worker's WebCrypto caps PBKDF2 at 100k.
const HOOKS = globalThis as unknown as {
  __shomalPbkdf2Iter?: number;
  __shomalInternalKey?: string;
  __shomalWithProfileLock?: <T>(profileId: string, fn: () => Promise<T>) => Promise<T>;
  __shomalWithThesisLock?: <T>(thesisId: string, fn: () => Promise<T>) => Promise<T>;
};
const ITER = HOOKS.__shomalPbkdf2Iter ?? 100_000;
/** True when a stored hash uses fewer iterations than the current target. */
export function needsRehash(stored?: string) {
  const parts = (stored ?? '').split('$');
  return parts[0] === 'pbkdf2' && Number(parts[1]) < (HOOKS.__shomalPbkdf2Iter ?? 100_000);
}
/** Serialises work per professor. On the self-hosted server this is SELECT ... FOR UPDATE on the profile row. */
export function withProfileLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
  return HOOKS.__shomalWithProfileLock ? HOOKS.__shomalWithProfileLock(profileId, fn) : fn();
}
/** Serialises workflow transitions per thesis (SELECT ... FOR UPDATE on the self-hosted server) so duplicate/concurrent requests cannot apply two transitions from the same status. */
export function withThesisLock<T>(thesisId: string, fn: () => Promise<T>): Promise<T> {
  return HOOKS.__shomalWithThesisLock ? HOOKS.__shomalWithThesisLock(thesisId, fn) : fn();
}
/** Scheduled jobs on the self-hosted server pass a per-boot random key instead of a user session. */
export function isInternalCall(token: string) {
  return !!HOOKS.__shomalInternalKey && token === HOOKS.__shomalInternalKey;
}
export const SYSTEM_ACTOR = { id: 'system', roles: ['admin'], fullName: 'سامانه (زمان‌بندی خودکار)' } as unknown as ProfilesRecordType;

async function pbkdf2(pw: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
}
export async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(pw, salt, ITER))}`;
}
export async function verifyPassword(pw: string, stored?: string) {
  if (!stored) return false;
  const [alg, iter, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2') return false;
  const got = new Uint8Array(await pbkdf2(pw, unb64(salt), Number(iter)));
  const exp = unb64(hash);
  if (got.length !== exp.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ exp[i];
  return diff === 0;
}
export async function sha256(s: string) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
export function newToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}
export function checkPasswordPolicy(pw: string) {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw))
    bad('رمز عبور باید حداقل ۸ نویسه و شامل حرف لاتین و عدد باشد.');
}

// ---------- Session auth ----------
export const SESSION_HOURS = 12;

export async function authenticate(token: string) {
  if (!token) unauthorized();
  const s = await zite.sessions.findOne({ filters: { tokenHash: await sha256(token) } });
  if (!s || s.revoked || !s.expiresAt || new Date(s.expiresAt) < new Date()) unauthorized();
  const p = await zite.profiles.findOne({ id: s.profileId! });
  if (!p || p.disabled) unauthorized('حساب کاربری شما غیرفعال است.');
  const last = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
  if (Date.now() - last > 10 * 60 * 1000) await zite.sessions.update({ id: s.id, record: { lastSeenAt: new Date().toISOString() } });
  return { profile: p, sessionId: s.id };
}

/** Authenticates and enforces role (server-side RBAC). */
export async function requireAuth(token: string, roles?: Role[]) {
  const { profile } = await authenticate(token);
  if (profile.mustChangePassword) forbidden('ابتدا رمز عبور موقت خود را تغییر دهید.');
  if (roles && !roles.some((r) => profile.roles?.includes(r))) forbidden();
  return profile;
}

export const has = (p: Profile, r: Role) => !!p.roles?.includes(r);

// ---------- Settings ----------
export const SETTING_DEFAULTS: Record<string, { value: string; description: string; kind: 'int' | 'chain' | 'status' | 'list' | 'count'; min?: number; max?: number }> = {
  maxSupervisorRejections: { value: '3', description: 'تعداد رد استاد پیش از ارجاع خودکار به مدیر گروه', kind: 'int' },
  baseAllowedTerms: { value: '4', description: 'تعداد ترم مجاز پایان‌نامه پس از تصویب (بدون تمدید)', kind: 'int' },
  commissionTermThreshold: { value: '6', description: 'از این ترم به بعد تمدید نیازمند کمیسیون موارد خاص است', kind: 'int' },
  maxLoginAttempts: { value: '5', description: 'تعداد ورود ناموفق پیش از قفل موقت حساب', kind: 'int' },
  lockMinutes: { value: '15', description: 'مدت قفل موقت حساب (دقیقه)', kind: 'int' },
  proposalApprovalChain: { value: 'supervisor,group_manager,graduate_office', description: 'ترتیب تأیید پروپوزال', kind: 'chain' },
  extensionApprovalChain: { value: 'group_manager,graduate_office,finance,supervisor', description: 'ترتیب تأیید تمدید', kind: 'chain' },
  maxSimilarityPercent: { value: '30', description: 'حداکثر درصد مجاز همانندجویی پایان‌نامه', kind: 'int' },
  minReviewers: { value: '2', description: 'حداقل تعداد داور برای هر پایان‌نامه', kind: 'int' },
  commissionFollowupChain: { value: 'graduate_office,finance,supervisor', description: 'ترتیب تأیید تمدید پس از کمیسیون موارد خاص', kind: 'chain' },
  minMonthsProposalToDefense: { value: '4', description: 'حداقل فاصلهٔ تصویب پروپوزال تا دفاع (ماه)', kind: 'int' },
  defenseSlotHours: { value: '2', description: 'مدت هر جلسهٔ دفاع برای کنترل تداخل (ساعت)', kind: 'int' },
  topicChangeMaxStatus: { value: 'THESIS_ACTIVE', description: 'آخرین مرحله‌ای که دانشجو می‌تواند درخواست تغییر موضوع بدهد', kind: 'status' },
  topicChangeChain: { value: 'supervisor,group_manager', description: 'ترتیب تأیید تغییر موضوع', kind: 'chain' },
  // Defaults mirror the pre-existing data model (one supervisorId + one advisorId on Theses); they are NOT a university rule.
  // An authorised admin sets the approved values. min/max are technical bounds only.
  maxSupervisors: { value: '1', description: 'حداکثر تعداد استاد راهنما در هر پرونده (شامل راهنمای اول)', kind: 'count', min: 1, max: 5 },
  maxAdvisors: { value: '1', description: 'حداکثر تعداد استاد مشاور در هر پرونده (۰ یعنی بدون مشاور)', kind: 'count', min: 0, max: 5 },
  graduationChecklist: { value: 'تسویه‌حساب کتابخانه,تسویه‌حساب مالی,تحویل نسخهٔ نهایی صحافی‌شده,گواهی ثبت پایان‌نامه در ایرانداک,فرم تأیید اصلاحات توسط استاد راهنما', description: 'چک‌لیست مدارک فارغ‌التحصیلی (با ویرگول جدا شود)', kind: 'list' },
};
export const STEPS: Step[] = ['supervisor', 'group_manager', 'graduate_office', 'finance'];

export async function getSettings() {
  const { records } = await zite.settings.findAll({ limit: 200 });
  const map: Record<string, string> = {};
  for (const [k, d] of Object.entries(SETTING_DEFAULTS)) map[k] = d.value;
  for (const r of records) if (r.key && r.value != null && SETTING_DEFAULTS[r.key]) map[r.key] = r.value;
  return map;
}
export const parseChain = (s: string) => s.split(',').map((x) => x.trim()).filter((x): x is Step => STEPS.includes(x as Step));
export async function chainSetting(key: string) {
  const c = parseChain((await getSettings())[key]);
  return c.length ? c : parseChain(SETTING_DEFAULTS[key].value);
}
export async function intSetting(key: string) {
  return Number((await getSettings())[key]) || Number(SETTING_DEFAULTS[key].value);
}
/** Integer setting where 0 is a legitimate value (e.g. maxAdvisors). */
export async function countSetting(key: string) {
  const v = Number((await getSettings())[key]);
  return Number.isInteger(v) && v >= 0 ? v : Number(SETTING_DEFAULTS[key].value);
}

// ---------- Audit ----------
export async function audit(a: { action: string; actor: string; role: string; thesisId?: string; from?: string; to?: string; comment?: string }) {
  await zite.auditLogs.create({
    record: {
      action: a.action, actorId: a.actor, actorRole: a.role, thesis: a.thesisId ?? null,
      fromStatus: a.from ?? null, toStatus: a.to ?? null, comment: a.comment ?? null, ipAddress: null,
    },
  });
  if (a.thesisId && a.to && a.from !== a.to) {
    const t = await zite.theses.findOne({ id: a.thesisId });
    if (t) {
      const ids = [t.studentId, t.supervisorId, t.advisorId].filter((x): x is string => !!x && x !== a.actor);
      await notifyT(ids, 'status_change', { code: t.thesisCode ?? '', title: t.titleFa ?? '', status: STATUS_FA[a.to] ?? a.to, comment: a.comment ? ' توضیح: ' + a.comment : '' }, t.id);
    }
  }
}

// ---------- Notifications ----------
export const STATUS_FA: Record<string, string> = {
  WAITING_SUPERVISOR: 'در انتظار استاد راهنما', SUPERVISOR_REJECTED: 'رد توسط استاد', GROUP_ASSIGNMENT: 'تخصیص استاد توسط گروه',
  GROUP_REVIEW: 'بررسی گروه', TOPIC_REVISION: 'اصلاح موضوع', LITERATURE_REVIEW: 'نگارش پیشینه', LITERATURE_SUPERVISOR_REVIEW: 'بررسی پیشینه توسط استاد راهنما', LITERATURE_GROUP_REVIEW: 'بررسی پیشینه توسط مدیر گروه',
  LITERATURE_REVISION: 'اصلاح پیشینه', PROPOSAL_DRAFT: 'تدوین پروپوزال', PROPOSAL_REVIEW: 'بررسی پروپوزال', PROPOSAL_REVISION: 'اصلاح پروپوزال',
  IRANDOC_PENDING: 'ثبت ایرانداک', IRANDOC_REVIEW: 'بررسی ایرانداک', THESIS_ACTIVE: 'مصوب و فعال', EXTENSION_REQUIRED: 'نیازمند تمدید',
  EXTENSION_REQUESTED: 'بررسی تمدید', SPECIAL_COMMISSION: 'کمیسیون موارد خاص', FINAL_SUPERVISOR_REVIEW: 'بررسی نسخهٔ نهایی توسط راهنما',
  FINAL_REVISION: 'اصلاح نسخهٔ نهایی', PLAGIARISM_CHECK: 'همانندجویی', REVIEWER_ASSIGNMENT: 'تعیین داوران', REVIEWING: 'در حال داوری',
  DEFENSE_SCHEDULING: 'تعیین زمان دفاع', DEFENSE_SCHEDULED: 'دفاع زمان‌بندی شد', DEFENDED: 'دفاع شده', THESIS_COMPLETED: 'پایان‌نامه تکمیل شد', GRADUATION_PROCESS: 'فرآیند فارغ‌التحصیلی', GRADUATED: 'فارغ‌التحصیل (پرونده بسته)', DRAFT: 'پیش‌نویس', REJECTED: 'رد شده', CANCELLED: 'لغو شده',
};
export const STATUS_ORDER = [
  'DRAFT', 'WAITING_SUPERVISOR', 'SUPERVISOR_REJECTED', 'GROUP_ASSIGNMENT', 'GROUP_REVIEW', 'TOPIC_REVISION', 'LITERATURE_REVIEW',
  'LITERATURE_SUPERVISOR_REVIEW', 'LITERATURE_GROUP_REVIEW', 'LITERATURE_REVISION', 'PROPOSAL_DRAFT', 'PROPOSAL_REVIEW', 'PROPOSAL_REVISION', 'IRANDOC_PENDING',
  'IRANDOC_REVIEW', 'THESIS_ACTIVE', 'EXTENSION_REQUIRED', 'EXTENSION_REQUESTED', 'SPECIAL_COMMISSION', 'FINAL_SUPERVISOR_REVIEW',
  'FINAL_REVISION', 'PLAGIARISM_CHECK', 'REVIEWER_ASSIGNMENT', 'REVIEWING', 'DEFENSE_SCHEDULING', 'DEFENSE_SCHEDULED', 'DEFENDED',
  'THESIS_COMPLETED', 'GRADUATION_PROCESS', 'GRADUATED',
];
export const CLOSED = ['GRADUATED', 'CANCELLED', 'REJECTED'];

// ---------- Notify service (swappable channels) ----------
export type ChannelName = 'inApp' | 'email' | 'sms';
type Msg = { profile: Profile; title: string; body: string; thesisId?: string };
type SendResult = { status: 'sent' | 'logged' | 'failed' | 'skipped'; recipient?: string; error?: string };
export interface NotifyChannel { name: ChannelName; send(m: Msg): Promise<SendResult> }

const inAppChannel: NotifyChannel = {
  name: 'inApp',
  async send(m) {
    await zite.notifications.create({ record: { profileId: m.profile.id, title: m.title, body: m.body, thesisId: m.thesisId ?? null, isRead: false } });
    return { status: 'sent', recipient: m.profile.username ?? m.profile.id };
  },
};
/** No outbound email service is connected yet: messages are recorded in Notification Logs as "logged". Swap this provider when one is connected. */
const logEmailChannel: NotifyChannel = {
  name: 'email',
  async send(m) {
    if (!m.profile.email) return { status: 'skipped', error: 'ایمیل کاربر ثبت نشده است' };
    console.log('[email:log-provider]', m.profile.email, m.title);
    return { status: 'logged', recipient: m.profile.email };
  },
};
/** Test SMS provider: only logs. Replace with a real gateway (e.g. Kavenegar) later. */
const testSmsChannel: NotifyChannel = {
  name: 'sms',
  async send(m) {
    if (!m.profile.phone) return { status: 'skipped', error: 'شماره موبایل ثبت نشده است' };
    console.log('[sms:test-provider]', m.profile.phone, m.title);
    return { status: 'logged', recipient: m.profile.phone };
  },
};
export const CHANNELS: Record<ChannelName, NotifyChannel> = { inApp: inAppChannel, email: logEmailChannel, sms: testSmsChannel };

export const TEMPLATE_DEFAULTS: Record<string, { title: string; body: string; channels: ChannelName[]; description: string }> = {
  status_change: { title: 'پرونده {code}: {status}', body: 'وضعیت پرونده «{title}» به «{status}» تغییر کرد.{comment}', channels: ['inApp', 'email', 'sms'], description: 'تغییر وضعیت پرونده' },
  review_assigned: { title: 'داوری پایان‌نامه {code}', body: 'پایان‌نامهٔ «{title}» برای داوری به شما ارجاع شد.', channels: ['inApp', 'email', 'sms'], description: 'ارجاع داوری' },
  defense_scheduled: { title: 'جلسهٔ دفاع {code}', body: 'جلسهٔ دفاع «{title}» در {date} در {location} برگزار می‌شود.', channels: ['inApp', 'email', 'sms'], description: 'تعیین زمان دفاع' },
  defense_changed: { title: 'تغییر زمان دفاع {code}', body: 'زمان دفاع «{title}» از {oldDate} به {date} ({location}) تغییر کرد. علت: {reason}', channels: ['inApp', 'email', 'sms'], description: 'تغییر تاریخ دفاع' },
  topic_change: { title: 'درخواست تغییر موضوع {code}', body: 'درخواست تغییر موضوع پرونده «{title}»: {result}', channels: ['inApp', 'email'], description: 'تغییر موضوع' },
  reminder: { title: 'یادآوری اقدام: پرونده {code}', body: 'پرونده «{title}» {days} روز است در وضعیت «{status}» منتظر اقدام شماست.', channels: ['inApp', 'email', 'sms'], description: 'یادآوری مهلت اقدام' },
  escalation: { title: 'ارتقا: تأخیر در پرونده {code}', body: 'پرونده «{title}» {days} روز است در وضعیت «{status}» بدون اقدام مانده است و به شما ارجاع شد.', channels: ['inApp', 'email', 'sms'], description: 'ارتقا به مدیر بالادست' },
  graduation: { title: 'فارغ‌التحصیلی: پرونده {code}', body: '{result}', channels: ['inApp', 'email'], description: 'فرآیند فارغ‌التحصیلی' },
  generic: { title: '{subject}', body: '{body}', channels: ['inApp'], description: 'اعلان عمومی' },
};

export async function getTemplate(key: string) {
  const def = TEMPLATE_DEFAULTS[key] ?? TEMPLATE_DEFAULTS.generic;
  const row = await zite.notificationTemplates.findOne({ filters: { key } });
  if (!row) return { ...def, active: true };
  return { title: row.title || def.title, body: row.body || def.body, channels: (row.channels ?? def.channels) as ChannelName[], active: row.isActive !== false, description: def.description };
}
const render = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/** Sends a templated notification to profiles over inApp + their preferred channels, and logs every delivery attempt. */
export async function notifyT(profileIds: string[], key: string, vars: Record<string, string>, thesisId?: string) {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (!ids.length) return;
  const tpl = await getTemplate(key);
  if (!tpl.active) return;
  const title = render(tpl.title, vars);
  const body = render(tpl.body, vars);
  const { records: profiles } = await zite.profiles.findAll({ filters: { id: { in: ids } }, limit: 500 });
  const logs: { title: string; profileId: string; channel: ChannelName; templateKey: string; recipient: string | null; body: string; deliveryStatus: SendResult['status']; error: string | null }[] = [];
  for (const prof of profiles) {
    const wanted: ChannelName[] = ['inApp'];
    if (tpl.channels.includes('email') && prof.notifyEmail !== false) wanted.push('email');
    if (tpl.channels.includes('sms') && prof.notifySms) wanted.push('sms');
    for (const ch of wanted) {
      let r: SendResult;
      try { r = await CHANNELS[ch].send({ profile: prof, title, body, thesisId }); } catch (e) { r = { status: 'failed', error: String(e) }; }
      logs.push({ title, profileId: prof.id, channel: ch, templateKey: key, recipient: r.recipient ?? null, body, deliveryStatus: r.status, error: r.error ?? null });
    }
  }
  for (let i = 0; i < logs.length; i += 100) await zite.notificationLogs.bulkCreate({ records: logs.slice(i, i + 100) });
}
/** Backwards-compatible plain notification (goes through the same service). */
export async function notify(profileIds: string[], title: string, body: string, thesisId?: string) {
  await notifyT(profileIds, 'generic', { subject: title, body }, thesisId);
}
export const fdate = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso)) : '—');

// ---------- Capacity ----------
const RELEASED = ['REJECTED', 'CANCELLED'];
export async function capacityFor(profIds: string[]) {
  const out: Record<string, { used: number; pending: number }> = {};
  for (const id of profIds) out[id] = { used: 0, pending: 0 };
  if (!profIds.length) return out;
  const { records: theses } = await zite.theses.findAll({ filters: { supervisorId: { in: profIds } }, limit: 2000 });
  for (const t of theses) if (t.supervisorId && out[t.supervisorId] && !RELEASED.includes(t.status ?? '')) out[t.supervisorId].used++;
  const { records: reqs } = await zite.supervisorRequests.findAll({ filters: { professorId: { in: profIds }, requestStatus: 'pending' }, limit: 2000 });
  for (const r of reqs) if (r.professorId && out[r.professorId]) out[r.professorId].pending++;
  return out;
}
export async function remainingCapacity(p: Profile) {
  const c = (await capacityFor([p.id]))[p.id];
  return (p.baseCapacity ?? 0) - c.used - c.pending;
}

// ---------- Scope ----------
const FINANCE_VISIBLE = ['EXTENSION_REQUESTED', 'SPECIAL_COMMISSION', 'EXTENSION_REQUIRED'];
export async function canView(p: Profile, t: ThesesRecordType) {
  if (has(p, 'admin') || has(p, 'graduate_office')) return true;
  if (t.studentId === p.id || t.supervisorId === p.id || t.advisorId === p.id) return true;
  if (await zite.thesisCommittee.findOne({ filters: { thesisId: t.id, professorId: p.id, isActive: true } })) return true;
  if (has(p, 'group_manager') && first(p.department) && first(p.department) === first(t.department)) return true;
  if (has(p, 'finance') && FINANCE_VISIBLE.includes(t.status ?? '')) return true;
  if (await zite.reviews.findOne({ filters: { thesis: t.id, reviewerId: p.id } })) return true;
  if (has(p, 'professor')) {
    const r = await zite.supervisorRequests.findOne({ filters: { thesis: t.id, professorId: p.id } });
    if (r) return true;
  }
  return false;
}

export function stepAllowed(step: string | undefined, p: Profile, t: ThesesRecordType) {
  const isGM = has(p, 'group_manager') && !!first(p.department) && first(p.department) === first(t.department);
  return (
    (step === 'supervisor' && t.supervisorId === p.id) ||
    (step === 'group_manager' && isGM) ||
    (step === 'graduate_office' && has(p, 'graduate_office')) ||
    (step === 'finance' && has(p, 'finance'))
  );
}

// ---------- Workflow: allowed actions (single source of truth for UI and enforcement) ----------
export const ACTIONS = [
  'supervisor_accept', 'supervisor_reject', 'group_assign_supervisor', 'group_approve_topic', 'group_topic_revision',
  'group_reject', 'set_advisor', 'literature_approve', 'literature_revision', 'literature_gm_approve', 'literature_gm_revision', 'proposal_approve', 'proposal_revision',
  'irandoc_approve', 'irandoc_reject', 'commission_approve', 'commission_reject', 'extension_approve', 'extension_reject',
  'final_approve', 'final_revision', 'plagiarism_pass', 'plagiarism_fail', 'assign_reviewers', 'schedule_defense', 'record_defense', 'cancel',
  'topic_change_approve', 'topic_change_reject', 'reschedule_defense', 'confirm_completion', 'start_graduation', 'graduate', 'reopen_case',
] as const;
export type ActionKey = (typeof ACTIONS)[number];

export async function allowedActions(p: Profile, t: ThesesRecordType): Promise<ActionKey[]> {
  const out: ActionKey[] = [];
  const s = t.status;
  if (t.isLocked) return has(p, 'admin') ? ['reopen_case'] : [];
  const isSup = t.supervisorId === p.id;
  const isGM = has(p, 'group_manager') && !!first(p.department) && first(p.department) === first(t.department);
  if (s === 'WAITING_SUPERVISOR' && has(p, 'professor')) {
    const r = await zite.supervisorRequests.findOne({ filters: { thesis: t.id, professorId: p.id, requestStatus: 'pending' } });
    if (r) out.push('supervisor_accept', 'supervisor_reject');
  }
  if (isGM) {
    if (s === 'GROUP_ASSIGNMENT') out.push('group_assign_supervisor');
    if (s === 'GROUP_REVIEW') out.push('group_approve_topic', 'group_topic_revision', 'group_reject');
    if (t.supervisorId && !['REJECTED', 'CANCELLED'].includes(s ?? '')) out.push('set_advisor');
  }
  if (isSup && s === 'LITERATURE_SUPERVISOR_REVIEW') out.push('literature_approve', 'literature_revision');
  if (isGM && s === 'LITERATURE_GROUP_REVIEW') out.push('literature_gm_approve', 'literature_gm_revision');
  if (s === 'PROPOSAL_REVIEW' && stepAllowed(t.proposalStep, p, t)) out.push('proposal_approve', 'proposal_revision');
  if (s === 'IRANDOC_REVIEW' && has(p, 'graduate_office')) out.push('irandoc_approve', 'irandoc_reject');
  if (s === 'SPECIAL_COMMISSION' && has(p, 'graduate_office')) {
    const e = await zite.extensions.findOne({ filters: { thesis: t.id, extensionStatus: 'commission' } });
    if (e) out.push('commission_approve', 'commission_reject');
  }
  if (s === 'EXTENSION_REQUESTED' && stepAllowed(t.proposalStep, p, t)) out.push('extension_approve', 'extension_reject');
  if (isSup && s === 'FINAL_SUPERVISOR_REVIEW') out.push('final_approve', 'final_revision');
  if (s === 'PLAGIARISM_CHECK' && has(p, 'graduate_office')) out.push('plagiarism_pass', 'plagiarism_fail');
  if (s === 'REVIEWER_ASSIGNMENT' && isGM) out.push('assign_reviewers');
  if (s === 'DEFENSE_SCHEDULING' && has(p, 'graduate_office')) out.push('schedule_defense');
  if (s === 'DEFENSE_SCHEDULED' && has(p, 'graduate_office')) out.push('record_defense');
  if (s === 'DEFENSE_SCHEDULED' && isGM) out.push('reschedule_defense');
  if (s === 'DEFENDED' && isSup) out.push('confirm_completion');
  if (s === 'THESIS_COMPLETED' && has(p, 'graduate_office')) out.push('start_graduation');
  if (s === 'GRADUATION_PROCESS' && has(p, 'graduate_office')) out.push('graduate');
  const tc = await zite.topicChanges.findOne({ filters: { thesis: t.id, changeStatus: { in: ['supervisor_review', 'group_review'] } } });
  if (tc && ((tc.changeStatus === 'supervisor_review' && isSup) || (tc.changeStatus === 'group_review' && isGM))) out.push('topic_change_approve', 'topic_change_reject');
  if ((has(p, 'admin') || has(p, 'graduate_office')) && !['CANCELLED', 'DEFENDED', 'REJECTED', 'THESIS_COMPLETED', 'GRADUATION_PROCESS', 'GRADUATED'].includes(s ?? '')) out.push('cancel');
  return out;
}

// ---------- Versions ----------
export async function newVersion(a: { thesisId: string; kind: 'topic' | 'literature' | 'proposal' | 'final'; content: string; files: { url: string; filename?: string }[]; userId: string }) {
  const { records } = await zite.documentVersions.findAll({ filters: { thesis: a.thesisId, kind: a.kind }, limit: 500 });
  const n = records.reduce((m, r) => Math.max(m, r.versionNumber ?? 0), 0) + 1;
  for (const r of records.filter((r) => r.isActive)) {
    await zite.documentVersions.update({ id: r.id, record: { isActive: false, reviewStatus: r.reviewStatus === 'submitted' ? 'superseded' : r.reviewStatus ?? null } });
  }
  return zite.documentVersions.create({
    record: {
      label: `${a.kind}-v${n}`, thesis: a.thesisId, kind: a.kind, versionNumber: n, content: a.content, files: a.files,
      isActive: true, submittedById: a.userId, reviewStatus: 'submitted', reviewComment: null,
    },
  });
}
export async function reviewActiveVersion(thesisId: string, kind: string, status: 'approved' | 'revision' | 'supervisor_approved', comment?: string) {
  const v = await zite.documentVersions.findOne({ filters: { thesis: thesisId, kind, isActive: true } });
  if (v) await zite.documentVersions.update({ id: v.id, record: { reviewStatus: status, reviewComment: comment ?? null } });
}

export async function profileNames(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map: Record<string, string> = {};
  if (!uniq.length) return map;
  const { records } = await zite.profiles.findAll({ filters: { id: { in: uniq } }, limit: 2000 });
  for (const r of records) map[r.id] = r.fullName ?? r.username ?? '';
  return map;
}

export const findStudentThesis = (profileId: string) =>
  zite.theses.findOne({ filters: { studentId: profileId, status: { notIn: ['CANCELLED', 'REJECTED'] } } });

/** Blocks edits on closed/locked case files (only admin may reopen, with audit). */
export function assertEditable(t: ThesesRecordType) {
  if (t.isLocked || CLOSED.includes(t.status ?? '')) forbidden('این پرونده بسته و قفل شده است؛ ویرایش فقط با بازگشایی توسط مدیر سیستم ممکن است.');
}
export async function getSettingsList(key: string) {
  return ((await getSettings())[key] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

// ---------- Dynamic proposal form ----------
export type FormFieldDef = { id: string; label: string; key: string; type: string; required: boolean; order: number; options: string[]; minLength: number | null; maxLength: number | null; helpText: string };
export async function loadProposalForm() {
  const form = await zite.dynamicForms.findOne({ filters: { kind: 'proposal', isActive: true } });
  if (!form) return { formId: null as string | null, name: '', fields: [] as FormFieldDef[] };
  const { records } = await zite.formFields.findAll({ filters: { form: form.id }, limit: 200 });
  const fields = records.map((f) => ({
    id: f.id, label: f.label ?? '', key: f.fieldKey ?? f.id, type: f.fieldType ?? 'text', required: !!f.required, order: f.sortOrder ?? 0,
    options: (f.options ?? '').split('\n').map((x) => x.trim()).filter(Boolean), minLength: f.minLength ?? null, maxLength: f.maxLength ?? null, helpText: f.helpText ?? '',
  })).sort((a, b) => a.order - b.order);
  return { formId: form.id as string | null, name: form.name ?? '', fields };
}
export function validateAnswers(fields: FormFieldDef[], answers: Record<string, string>) {
  for (const f of fields) {
    const v = (answers[f.key] ?? '').trim();
    if (!v) { if (f.required) bad(`فیلد «${f.label}» الزامی است.`); continue; }
    if (f.minLength && v.length < f.minLength) bad(`«${f.label}» باید حداقل ${f.minLength} نویسه باشد.`);
    if (f.maxLength && v.length > f.maxLength) bad(`«${f.label}» حداکثر ${f.maxLength} نویسه مجاز است.`);
    if (f.type === 'number' && isNaN(Number(v))) bad(`«${f.label}» باید عدد باشد.`);
    if (f.type === 'select' && !f.options.includes(v)) bad(`گزینهٔ «${f.label}» نامعتبر است.`);
    if (f.type === 'date' && isNaN(new Date(v).getTime())) bad(`تاریخ «${f.label}» نامعتبر است.`);
  }
}

// ---------- Master's programs (کارشناسی ارشد) ----------
export const MASTERS_DEGREE = 'کارشناسی ارشد';
/** Validates a program choice: must exist, be active, be a Master's program, and belong to the given faculty and major. */
export async function validateMastersProgram(a: { programId: string; faculty: string; major: string }) {
  const prog = await zite.programs.findOne({ id: a.programId });
  if (!prog || prog.isActive === false) bad('رشته/گرایش انتخاب‌شده معتبر نیست.');
  if (prog.degree !== MASTERS_DEGREE) bad('فقط رشته‌های مقطع کارشناسی ارشد مجاز هستند.');
  if ((prog.faculty ?? '') !== a.faculty.trim()) bad('رشتهٔ انتخاب‌شده متعلق به این دانشکده نیست.');
  if ((prog.name ?? '') !== a.major.trim()) bad('گرایش انتخاب‌شده متعلق به این رشته نیست.');
  return prog;
}
/** Statuses in which the student may still change the program (before proposal approval). */
export const PROGRAM_EDITABLE = ['DRAFT', 'WAITING_SUPERVISOR', 'SUPERVISOR_REJECTED', 'GROUP_ASSIGNMENT', 'GROUP_REVIEW', 'TOPIC_REVISION', 'LITERATURE_REVIEW', 'LITERATURE_SUPERVISOR_REVIEW', 'LITERATURE_GROUP_REVIEW', 'LITERATURE_REVISION', 'PROPOSAL_DRAFT', 'PROPOSAL_REVISION'];
/** Statuses where the official proposal approval date may be recorded/corrected: after proposal approval, before the defense is scheduled. */
export const APPROVAL_DATE_EDITABLE = ['IRANDOC_PENDING', 'IRANDOC_REVIEW', 'THESIS_ACTIVE', 'EXTENSION_REQUIRED', 'EXTENSION_REQUESTED', 'SPECIAL_COMMISSION', 'FINAL_SUPERVISOR_REVIEW', 'FINAL_REVISION', 'PLAGIARISM_CHECK', 'REVIEWER_ASSIGNMENT', 'REVIEWING', 'DEFENSE_SCHEDULING'];

// ---------- Thesis committee (supervisors / advisors) ----------
export type CommitteeRole = 'supervisor' | 'advisor';
/** Active committee = primary supervisor (Theses.supervisorId) + active ThesisCommittee rows, ordered by position. */
export async function activeCommittee(t: ThesesRecordType) {
  const { records } = await zite.thesisCommittee.findAll({ filters: { thesisId: t.id, isActive: true }, limit: 50 });
  const sorted = records.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const extraSupervisors = sorted.filter((r) => r.committeeRole === 'supervisor' && r.professorId !== t.supervisorId).map((r) => r.professorId!);
  let advisors = sorted.filter((r) => r.committeeRole === 'advisor').map((r) => r.professorId!);
  // Legacy cases: advisor stored only on Theses.advisorId.
  if (!advisors.length && t.advisorId) advisors = [t.advisorId];
  return { supervisors: [t.supervisorId, ...extraSupervisors].filter((x): x is string => !!x), advisors };
}

/** Validates a proposed committee against the admin-configured limits and the professor profiles. Enforced server-side. */
export async function validateCommittee(t: ThesesRecordType, coSupervisorIds: string[], advisorIds: string[]) {
  if (!t.supervisorId) bad('استاد راهنمای اول هنوز برای این پرونده تعیین نشده است.');
  const maxSup = await countSetting('maxSupervisors');
  const maxAdv = await countSetting('maxAdvisors');
  if (1 + coSupervisorIds.length > maxSup) bad(`حداکثر ${maxSup} استاد راهنما (شامل راهنمای اول) مجاز است.`);
  if (advisorIds.length > maxAdv) bad(maxAdv === 0 ? 'طبق تنظیمات فعلی، تعیین استاد مشاور مجاز نیست.' : `حداکثر ${maxAdv} استاد مشاور مجاز است.`);
  const all = [t.supervisorId, ...coSupervisorIds, ...advisorIds];
  if (new Set(all).size !== all.length) bad('یک استاد نمی‌تواند در بیش از یک جایگاه (راهنما/مشاور) انتخاب شود.');
  if (all.includes(t.studentId ?? '')) bad('دانشجو نمی‌تواند استاد خود باشد.');
  const ids = [...coSupervisorIds, ...advisorIds];
  if (!ids.length) return;
  const { records: profs } = await zite.profiles.findAll({ filters: { id: { in: ids } }, limit: 50 });
  for (const id of ids) {
    const prof = profs.find((x) => x.id === id);
    if (!prof || prof.disabled || !prof.roles?.includes('professor')) bad('استاد انتخاب‌شده در سامانه معتبر نیست.');
    if (first(prof.department) !== first(t.department)) bad(`«${prof.fullName ?? ''}» عضو گروه آموزشی این پرونده نیست.`);
  }
}

/** Replaces the extra-supervisor/advisor rows of a thesis. Removed members are deactivated (never deleted) so history is preserved; every change is audited. */
export async function applyCommittee(t: ThesesRecordType, coSupervisorIds: string[], advisorIds: string[], actor: Profile, actorRole: string) {
  const { records } = await zite.thesisCommittee.findAll({ filters: { thesisId: t.id, isActive: true }, limit: 50 });
  const want: { id: string; role: CommitteeRole; pos: number }[] = [
    ...coSupervisorIds.map((id, i) => ({ id, role: 'supervisor' as const, pos: i + 2 })),
    ...advisorIds.map((id, i) => ({ id, role: 'advisor' as const, pos: i + 1 })),
  ];
  const now = new Date().toISOString();
  const names = await profileNames([...want.map((w) => w.id), ...records.map((r) => r.professorId ?? '')]);
  const label = (role: string, pos: number) => (role === 'supervisor' ? `استاد راهنمای ${pos === 2 ? 'دوم' : pos}` : `استاد مشاور ${pos === 1 ? 'اول' : pos === 2 ? 'دوم' : pos === 3 ? 'سوم' : pos}`);
  const changes: string[] = [];
  for (const r of records) {
    const keep = want.find((w) => w.id === r.professorId && w.role === r.committeeRole && w.pos === r.position);
    if (!keep) {
      await zite.thesisCommittee.update({ id: r.id, record: { isActive: false, removedById: actor.id, removedAt: now } });
      changes.push(`حذف ${label(r.committeeRole ?? '', r.position ?? 0)}: ${names[r.professorId ?? ''] ?? ''}`);
    }
  }
  const toAdd = want.filter((w) => !records.some((r) => r.professorId === w.id && r.committeeRole === w.role && r.position === w.pos));
  if (toAdd.length) {
    await zite.thesisCommittee.bulkCreate({
      records: toAdd.map((w) => ({
        label: `${t.thesisCode ?? ''} — ${label(w.role, w.pos)}`, thesisId: t.id, professorId: w.id, committeeRole: w.role, position: w.pos,
        isActive: true, assignedById: actor.id, assignedAt: now, removedById: null, removedAt: null, note: null,
      })),
    });
    for (const w of toAdd) changes.push(`افزودن ${label(w.role, w.pos)}: ${names[w.id] ?? ''}`);
  }
  const advisorId = advisorIds[0] ?? null;
  if ((t.advisorId ?? null) !== advisorId) await zite.theses.update({ id: t.id, record: { advisorId } });
  if (changes.length) await audit({ action: 'تغییر ترکیب استادان راهنما/مشاور', actor: actor.id, role: actorRole, thesisId: t.id, comment: changes.join('؛ ') });
  return changes;
}

// ---------- Next responsible actor (derived from real status + chain + org structure) ----------
export async function groupManagersOf(t: ThesesRecordType) {
  const dep = first(t.department);
  if (!dep) return [] as Profile[];
  const { records } = await zite.profiles.findAll({ filters: { department: dep }, limit: 500 });
  return records.filter((r) => r.roles?.includes('group_manager') && !r.disabled);
}
async function roleHolders(role: Role) {
  const { records } = await zite.profiles.findAll({ filters: { roles: role }, limit: 200 });
  return records.filter((r) => !r.disabled);
}
const STEP_ROLE_FA: Record<string, string> = { supervisor: 'استاد راهنما', group_manager: 'مدیر گروه', graduate_office: 'تحصیلات تکمیلی', finance: 'امور مالی' };
export type NextActor = { roleLabel: string; people: string[]; expected: string; where: string; personIds: string[] };
export async function nextActor(t: ThesesRecordType): Promise<NextActor | null> {
  const s = t.status ?? '';
  if (t.isLocked || CLOSED.includes(s)) return null;
  const student = { roleLabel: 'دانشجو', ids: [t.studentId ?? ''] };
  const sup = { roleLabel: 'استاد راهنما', ids: [t.supervisorId ?? ''] };
  const gm = async () => ({ roleLabel: 'مدیر گروه', ids: (await groupManagersOf(t)).map((g) => g.id) });
  const role = async (r: Role, label: string) => ({ roleLabel: label, ids: (await roleHolders(r)).map((g) => g.id) });
  const step = async (st?: string | null) => (st === 'supervisor' ? sup : st === 'group_manager' ? gm() : st === 'graduate_office' ? role('graduate_office', STEP_ROLE_FA.graduate_office) : st === 'finance' ? role('finance', STEP_ROLE_FA.finance) : null);
  let who: { roleLabel: string; ids: string[] } | null = null;
  let expected = '';
  let where = 'صفحهٔ جزئیات پرونده ← بخش «اقدام‌ها»';
  switch (s) {
    case 'DRAFT': case 'SUPERVISOR_REJECTED': who = student; expected = 'تکمیل موضوع و ارسال درخواست به استاد راهنما'; where = 'داشبورد دانشجو ← ثبت موضوع و انتخاب استاد'; break;
    case 'WAITING_SUPERVISOR': {
      const r = await zite.supervisorRequests.findOne({ filters: { thesis: t.id, requestStatus: 'pending' } });
      who = { roleLabel: 'استاد راهنمای درخواست‌شده', ids: [r?.professorId ?? ''] }; expected = 'پذیرش یا رد درخواست راهنمایی'; break;
    }
    case 'GROUP_ASSIGNMENT': who = await gm(); expected = 'تخصیص استاد راهنما'; break;
    case 'GROUP_REVIEW': who = await gm(); expected = 'تأیید موضوع، برگشت برای اصلاح یا رد'; break;
    case 'TOPIC_REVISION': who = student; expected = 'اصلاح و ارسال مجدد موضوع'; where = 'داشبورد دانشجو ← اصلاح موضوع'; break;
    case 'LITERATURE_REVIEW': who = student; expected = 'بارگذاری و ارسال پیشینهٔ تحقیق'; where = 'داشبورد دانشجو ← پیشینهٔ تحقیق'; break;
    case 'LITERATURE_REVISION': who = student; expected = 'اصلاح پیشینه طبق علت برگشت و ارسال مجدد'; where = 'داشبورد دانشجو ← پیشینهٔ تحقیق'; break;
    case 'LITERATURE_SUPERVISOR_REVIEW': who = sup; expected = 'بررسی پیشینه (مرحلهٔ ۱ از ۲): تأیید یا برگشت با ذکر علت'; break;
    case 'LITERATURE_GROUP_REVIEW': who = await gm(); expected = 'بررسی پیشینه (مرحلهٔ ۲ از ۲): تأیید نهایی یا برگشت با ذکر علت'; break;
    case 'PROPOSAL_DRAFT': case 'PROPOSAL_REVISION': who = student; expected = 'تکمیل فرم مرحله‌ای پروپوزال، بارگذاری فایل و ارسال برای بررسی'; where = 'داشبورد دانشجو ← فرم پروپوزال'; break;
    case 'PROPOSAL_REVIEW': case 'EXTENSION_REQUESTED': who = await step(t.proposalStep); expected = s === 'PROPOSAL_REVIEW' ? `بررسی پروپوزال در مرحلهٔ «${STEP_ROLE_FA[t.proposalStep ?? ''] ?? ''}»` : `بررسی تمدید در مرحلهٔ «${STEP_ROLE_FA[t.proposalStep ?? ''] ?? ''}»`; break;
    case 'IRANDOC_PENDING': who = student; expected = 'ثبت کد رهگیری و رسید ایرانداک'; where = 'داشبورد دانشجو ← ایرانداک'; break;
    case 'IRANDOC_REVIEW': case 'SPECIAL_COMMISSION': case 'PLAGIARISM_CHECK': case 'DEFENSE_SCHEDULING': case 'DEFENSE_SCHEDULED': case 'THESIS_COMPLETED': case 'GRADUATION_PROCESS':
      who = await role('graduate_office', 'تحصیلات تکمیلی');
      expected = { IRANDOC_REVIEW: 'بررسی ایرانداک و تصویب نهایی', SPECIAL_COMMISSION: 'ثبت نتیجهٔ کمیسیون موارد خاص', PLAGIARISM_CHECK: 'ثبت نتیجهٔ همانندجویی', DEFENSE_SCHEDULING: 'تعیین زمان و محل دفاع', DEFENSE_SCHEDULED: 'ثبت نتیجهٔ دفاع', THESIS_COMPLETED: 'آغاز فرآیند فارغ‌التحصیلی', GRADUATION_PROCESS: 'تأیید مدارک چک‌لیست و فارغ‌التحصیلی' }[s] ?? ''; break;
    case 'THESIS_ACTIVE': case 'FINAL_REVISION': who = student; expected = s === 'FINAL_REVISION' ? 'اصلاح و ارسال مجدد نسخهٔ نهایی' : 'ارسال نسخهٔ نهایی پایان‌نامه'; where = 'داشبورد دانشجو ← نسخهٔ نهایی'; break;
    case 'EXTENSION_REQUIRED': who = student; expected = 'ثبت درخواست تمدید'; where = 'داشبورد دانشجو ← تمدید'; break;
    case 'FINAL_SUPERVISOR_REVIEW': case 'DEFENDED': who = sup; expected = s === 'DEFENDED' ? 'تأیید تکمیل پایان‌نامه پس از اصلاحات دفاع' : 'بررسی نسخهٔ نهایی'; break;
    case 'REVIEWER_ASSIGNMENT': who = await gm(); expected = 'تعیین داوران'; break;
    case 'REVIEWING': {
      const { records } = await zite.reviews.findAll({ filters: { thesis: t.id, verdict: 'pending' }, limit: 50 });
      who = { roleLabel: 'داوران', ids: records.map((r) => r.reviewerId ?? '') }; expected = 'ثبت نظر داوری'; where = 'کارتابل داوری'; break;
    }
  }
  if (!who) return null;
  const ids = who.ids.filter(Boolean);
  const names = await profileNames(ids);
  return { roleLabel: who.roleLabel, people: ids.map((i) => names[i]).filter(Boolean), personIds: ids, expected, where };
}
