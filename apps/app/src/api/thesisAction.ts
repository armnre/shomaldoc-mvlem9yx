import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite, type ThesesRecordInput } from 'zitejs/db';
import { ZitePdf } from 'zitejs/pdf';
import { LOGO_DATA_URI } from '../lib/logoData';
import { getSettingsList } from '../lib/server';
import {
  ACTIONS, allowedActions, audit, bad, chainSetting, first, forbidden, intSetting, parseChain,
  remainingCapacity, requireAuth, reviewActiveVersion, profileNames, notifyT, newVersion, fdate, has, type ActionKey,
  withThesisLock, activeCommittee, validateCommittee, applyCommittee, groupManagersOf,
} from '../lib/server';

async function latestReviews(thesisId: string) {
  const { records } = await zite.reviews.findAll({ filters: { thesis: thesisId }, limit: 200 });
  const last = records.reduce((m, x) => Math.max(m, x.round ?? 1), 0);
  return records.filter((x) => (x.round ?? 1) === last);
}

const NEEDS_COMMENT: ActionKey[] = [
  'supervisor_reject', 'group_topic_revision', 'group_reject', 'literature_revision', 'literature_gm_revision', 'proposal_revision',
  'irandoc_reject', 'commission_approve', 'commission_reject', 'extension_reject', 'cancel', 'final_revision', 'plagiarism_fail',
  'topic_change_reject', 'reschedule_defense', 'reopen_case',
];

export default createEndpoint({
  description: 'Applies a workflow transition to a thesis after server-side role, scope and precondition checks',
  inputSchema: z.object({
    token: z.string(),
    thesisId: z.string(),
    action: z.enum(ACTIONS),
    comment: z.string().optional(),
    targetId: z.string().optional(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })).optional(),
    similarity: z.number().min(0).max(100).optional(),
    reviewers: z.array(z.object({ id: z.string(), type: z.enum(['internal', 'external']) })).optional(),
    defenseDate: z.string().optional(),
    defenseLocation: z.string().optional(),
    score: z.number().min(0).max(20).optional(),
    gapException: z.boolean().optional(),
  }),
  outputSchema: z.object({ status: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token);
    // All checks and the transition run under a per-thesis lock: a duplicate or concurrent request re-reads the new status and is rejected.
    return withThesisLock(input.thesisId, async () => {
    const t = await zite.theses.findOne({ id: input.thesisId });
    if (!t) bad('پرونده یافت نشد.');
    if (!(await allowedActions(p, t)).includes(input.action)) forbidden('این گذار در وضعیت فعلی یا برای نقش شما مجاز نیست.');
    const comment = input.comment?.trim() ?? '';
    if (NEEDS_COMMENT.includes(input.action) && comment.length < 3) bad('ثبت علت/توضیح الزامی است.');

    const from = t.status ?? '';
    let to = from;
    let role = 'group_manager';
    const upd: Partial<ThesesRecordInput> = {};
    const now = new Date().toISOString();

    const pickProfessor = async () => {
      if (!input.targetId) bad('استاد را انتخاب کنید.');
      const prof = await zite.profiles.findOne({ id: input.targetId });
      if (!prof || !prof.roles?.includes('professor') || first(prof.department) !== first(t.department)) bad('استاد انتخاب‌شده معتبر نیست.');
      return prof;
    };
    const activeExtension = async (status: string) => {
      const e = await zite.extensions.findOne({ filters: { thesis: t.id, extensionStatus: status } });
      if (!e) bad('درخواست تمدید فعال یافت نشد.');
      return e;
    };
    /** Sets/replaces the first advisor while keeping the rest of the committee; limits and eligibility are enforced server-side. */
    const setFirstAdvisor = async (advisorId: string | null) => {
      const c = await activeCommittee(t);
      const rest = c.advisors.slice(1).filter((x) => x !== advisorId);
      const advisors = advisorId ? [advisorId, ...rest] : rest;
      await validateCommittee(t, c.supervisors.slice(1), advisors);
      await applyCommittee(t, c.supervisors.slice(1), advisors, p, 'group_manager');
    };
    const vars = () => ({ code: t.thesisCode ?? '', title: t.titleFa ?? '' });
    /** Validates a defense slot: future, min gap after proposal approval (exception only by graduate office/admin, audited), no overlap. */
    const checkDefenseSlot = async (d: Date | null, location: string | undefined) => {
      if (!d || isNaN(d.getTime())) bad('تاریخ و ساعت دفاع را وارد کنید.');
      if (d < new Date()) bad('زمان دفاع باید در آینده باشد.');
      if (!location?.trim()) bad('محل برگزاری دفاع را وارد کنید.');
      const months = await intSetting('minMonthsProposalToDefense');
      if (!t.proposalApprovedAt) bad('تاریخ تصویب پروپوزال ثبت نشده است.');
      const earliest = new Date(t.proposalApprovedAt);
      earliest.setMonth(earliest.getMonth() + months);
      if (d < earliest) {
        if (!input.gapException) bad(`حداقل ${months} ماه پس از تصویب پروپوزال لازم است؛ زودترین تاریخ مجاز: ${fdate(earliest.toISOString())}.`);
        if (!has(p, 'graduate_office') && !has(p, 'admin')) forbidden('مجوز استثنای فاصلهٔ دفاع فقط با تحصیلات تکمیلی یا مدیر سیستم است.');
        if (comment.length < 10) bad('برای استثنای فاصلهٔ زمانی، شرح مجوز (حداقل ۱۰ نویسه) الزامی است.');
        await audit({ action: 'مجوز استثنای حداقل فاصلهٔ تصویب پروپوزال تا دفاع', actor: p.id, role: has(p, 'graduate_office') ? 'graduate_office' : 'admin', thesisId: t.id, comment: `زودترین تاریخ مجاز ${fdate(earliest.toISOString())}؛ تاریخ تعیین‌شده ${fdate(d.toISOString())}. مجوز: ${comment}` });
      }
      const slot = (await intSetting('defenseSlotHours')) * 3600_000;
      const { records: others } = await zite.theses.findAll({ filters: { status: 'DEFENSE_SCHEDULED' }, limit: 2000 });
      const rv = (await latestReviews(t.id)).map((r) => r.reviewerId);
      const people = new Set([t.supervisorId, t.advisorId, ...rv].filter(Boolean));
      for (const o of others) {
        if (o.id === t.id || !o.defenseDate || Math.abs(new Date(o.defenseDate).getTime() - d.getTime()) >= slot) continue;
        if ((o.defenseLocation ?? '').trim() === location.trim()) bad(`تداخل: دفاع پرونده ${o.thesisCode} در همین محل و بازهٔ زمانی است.`);
        const ov = (await latestReviews(o.id)).map((r) => r.reviewerId);
        if ([o.supervisorId, o.advisorId, ...ov].some((x) => x && people.has(x))) bad(`تداخل: یکی از اعضای هیئت در همین زمان در دفاع پرونده ${o.thesisCode} حضور دارد.`);
      }
      return d;
    };
    const logDecision = (prev: string | undefined, who: string, what: string) =>
      `${prev ? prev + '\n' : ''}${now} | ${who} | ${what}${comment ? ' | ' + comment : ''}`;

    switch (input.action) {
      case 'supervisor_accept':
      case 'supervisor_reject': {
        role = 'professor';
        const req = await zite.supervisorRequests.findOne({ filters: { thesis: t.id, professorId: p.id, requestStatus: 'pending' } });
        if (!req) forbidden();
        const accept = input.action === 'supervisor_accept';
        if (accept && (await remainingCapacity(p)) < 0) bad('ظرفیت شما تکمیل است.');
        await zite.supervisorRequests.update({ id: req.id, record: { requestStatus: accept ? 'accepted' : 'rejected', reason: comment || null, decidedAt: now } });
        if (accept) {
          upd.supervisorId = p.id;
          to = 'GROUP_REVIEW';
        } else {
          const n = (t.supervisorRejections ?? 0) + 1;
          upd.supervisorRejections = n;
          to = n >= (await intSetting('maxSupervisorRejections')) ? 'GROUP_ASSIGNMENT' : 'SUPERVISOR_REJECTED';
        }
        break;
      }
      case 'group_assign_supervisor': {
        const prof = await pickProfessor();
        if ((await remainingCapacity(prof)) <= 0) bad('ظرفیت این استاد تکمیل است.');
        upd.supervisorId = prof.id;
        await zite.supervisorRequests.create({
          record: { summary: `${t.thesisCode} → ${prof.fullName ?? ''} (تخصیص گروه)`, thesis: t.id, professorId: prof.id, requestStatus: 'accepted', reason: 'تخصیص توسط مدیر گروه', decidedAt: now },
        });
        to = 'GROUP_REVIEW';
        break;
      }
      case 'group_approve_topic':
        if (input.targetId) {
          await pickProfessor();
          if (input.targetId === t.supervisorId) bad('مشاور نمی‌تواند همان استاد راهنما باشد.');
          await setFirstAdvisor(input.targetId);
        }
        upd.topicApprovedAt = now;
        await reviewActiveVersion(t.id, 'topic', 'approved', comment);
        to = 'LITERATURE_REVIEW';
        break;
      case 'group_topic_revision':
        await reviewActiveVersion(t.id, 'topic', 'revision', comment);
        to = 'TOPIC_REVISION';
        break;
      case 'group_reject':
        to = 'REJECTED';
        break;
      case 'set_advisor':
        if (input.targetId) {
          await pickProfessor();
          if (input.targetId === t.supervisorId) bad('مشاور نمی‌تواند همان استاد راهنما باشد.');
        }
        await setFirstAdvisor(input.targetId ?? null);
        break;
      // Literature review — step 1 of 2: the case's supervisor. Approval does NOT finish the stage; it forwards to the group manager.
      case 'literature_approve':
      case 'literature_revision': {
        role = 'supervisor';
        const ok = input.action === 'literature_approve';
        await reviewActiveVersion(t.id, 'literature', ok ? 'supervisor_approved' : 'revision', comment);
        to = ok ? 'LITERATURE_GROUP_REVIEW' : 'LITERATURE_REVISION';
        if (ok) await notifyT((await groupManagersOf(t)).map((g) => g.id), 'generic', { subject: `پیشینهٔ پرونده ${t.thesisCode ?? ''} منتظر بررسی مدیر گروه`, body: `پیشینهٔ تحقیق «${t.titleFa ?? ''}» توسط استاد راهنما تأیید شد و برای تأیید نهایی به شما ارجاع شد.` }, t.id);
        break;
      }
      // Literature review — step 2 of 2: the group manager of the case's department. Only this approval opens the proposal stage.
      case 'literature_gm_approve':
      case 'literature_gm_revision': {
        role = 'group_manager';
        const v = await zite.documentVersions.findOne({ filters: { thesis: t.id, kind: 'literature', isActive: true } });
        if (!v || v.reviewStatus !== 'supervisor_approved') bad('پیشینهٔ فعلی هنوز توسط استاد راهنما تأیید نشده است.');
        const ok = input.action === 'literature_gm_approve';
        await reviewActiveVersion(t.id, 'literature', ok ? 'approved' : 'revision', comment);
        to = ok ? 'PROPOSAL_DRAFT' : 'LITERATURE_REVISION';
        break;
      }
      case 'proposal_approve': {
        role = t.proposalStep ?? '';
        const chain = await chainSetting('proposalApprovalChain');
        const next = chain[chain.indexOf(t.proposalStep as never) + 1];
        if (next) upd.proposalStep = next;
        else {
          upd.proposalStep = null;
          upd.proposalApprovedAt = now;
          await reviewActiveVersion(t.id, 'proposal', 'approved', comment);
          to = 'IRANDOC_PENDING';
        }
        break;
      }
      case 'proposal_revision':
        role = t.proposalStep ?? '';
        upd.proposalStep = null;
        await reviewActiveVersion(t.id, 'proposal', 'revision', comment);
        to = 'PROPOSAL_REVISION';
        break;
      case 'irandoc_approve':
      case 'irandoc_reject': {
        role = 'graduate_office';
        const rec = await zite.iranDocRecords.findOne({ filters: { thesis: t.id, isActive: true } });
        if (!rec) bad('اطلاعات ایرانداک یافت نشد.');
        if (input.action === 'irandoc_reject') {
          await zite.iranDocRecords.update({ id: rec.id, record: { reviewStatus: 'rejected', reviewComment: comment } });
          to = 'IRANDOC_PENDING';
          break;
        }
        // Final approval: automatic precondition check
        const missing: string[] = [];
        if (!t.topicApprovedAt) missing.push('تأیید موضوع');
        if (!t.supervisorId) missing.push('استاد راهنما');
        if (!t.proposalApprovedAt) missing.push('تصویب پروپوزال');
        const proposal = await zite.documentVersions.findOne({ filters: { thesis: t.id, kind: 'proposal', isActive: true } });
        if (!proposal?.files?.length) missing.push('فایل پروپوزال');
        if (!rec.trackingCode || !rec.receipt?.length) missing.push('کد و رسید ایرانداک');
        if (input.files?.length) await zite.iranDocRecords.update({ id: rec.id, record: { certificate: [...(rec.certificate ?? []), ...input.files] } });
        if (!rec.certificate?.length && !input.files?.length) missing.push('گواهی ایرانداک');
        if (missing.length) bad(`پیش‌شرط‌های تصویب نهایی کامل نیست: ${missing.join('، ')}`);
        await zite.iranDocRecords.update({ id: rec.id, record: { reviewStatus: 'approved', reviewComment: comment || null } });
        upd.thesisApprovedAt = now;
        if (!t.allowedTerms) upd.allowedTerms = await intSetting('baseAllowedTerms');
        to = 'THESIS_ACTIVE';
        break;
      }
      case 'commission_approve':
      case 'commission_reject': {
        role = 'graduate_office';
        const e = await activeExtension('commission');
        const ok = input.action === 'commission_approve';
        await zite.extensions.update({
          id: e.id,
          record: {
            commissionResult: ok ? 'approved' : 'rejected', commissionNotes: comment, commissionFiles: input.files ?? [],
            extensionStatus: ok ? 'in_review' : 'rejected', decisions: logDecision(e.decisions, 'کمیسیون موارد خاص', ok ? 'موافقت' : 'مخالفت'),
          },
        });
        if (ok) {
          upd.proposalStep = parseChain(e.chain ?? '')[0] ?? 'graduate_office';
          to = 'EXTENSION_REQUESTED';
        } else to = 'REJECTED';
        break;
      }
      case 'extension_approve':
      case 'extension_reject': {
        role = t.proposalStep ?? '';
        const e = await activeExtension('in_review');
        if (input.action === 'extension_reject') {
          await zite.extensions.update({ id: e.id, record: { extensionStatus: 'rejected', decisions: logDecision(e.decisions, role, 'رد') } });
          upd.proposalStep = null;
          to = (t.termsUsed ?? 0) >= (t.allowedTerms ?? 0) ? 'EXTENSION_REQUIRED' : 'THESIS_ACTIVE';
          break;
        }
        const chain = parseChain(e.chain ?? '');
        const next = chain[chain.indexOf(t.proposalStep as never) + 1];
        if (next) {
          upd.proposalStep = next;
          await zite.extensions.update({ id: e.id, record: { decisions: logDecision(e.decisions, role, 'تأیید') } });
        } else {
          await zite.extensions.update({ id: e.id, record: { extensionStatus: 'approved', decisions: logDecision(e.decisions, role, 'تأیید نهایی') } });
          upd.proposalStep = null;
          upd.allowedTerms = Math.max(t.allowedTerms ?? 0, e.termNumber ?? (t.termsUsed ?? 0) + 1);
          to = 'THESIS_ACTIVE';
        }
        break;
      }
      case 'final_approve':
      case 'final_revision':
        role = 'supervisor';
        await reviewActiveVersion(t.id, 'final', input.action === 'final_approve' ? 'approved' : 'revision', comment);
        to = input.action === 'final_approve' ? 'PLAGIARISM_CHECK' : 'FINAL_REVISION';
        break;
      case 'plagiarism_pass':
      case 'plagiarism_fail': {
        role = 'graduate_office';
        if (input.similarity == null) bad('درصد همانندجویی را وارد کنید.');
        if (!input.files?.length) bad('گزارش همانندجویی را پیوست کنید.');
        const max = await intSetting('maxSimilarityPercent');
        if (input.action === 'plagiarism_pass' && input.similarity > max) bad(`درصد همانندی (${input.similarity}) بیش از حد مجاز (${max}) است.`);
        upd.similarityPercent = input.similarity;
        upd.plagiarismReport = input.files;
        to = input.action === 'plagiarism_pass' ? 'REVIEWER_ASSIGNMENT' : 'FINAL_REVISION';
        break;
      }
      case 'assign_reviewers': {
        const list = input.reviewers ?? [];
        const ids = [...new Set(list.map((r) => r.id))];
        if (ids.length < (await intSetting('minReviewers'))) bad(`حداقل ${await intSetting('minReviewers')} داور انتخاب کنید.`);
        if (ids.some((id) => id === t.supervisorId || id === t.advisorId || id === t.studentId)) bad('استاد راهنما/مشاور نمی‌تواند داور باشد.');
        const { records: profs } = await zite.profiles.findAll({ filters: { id: { in: ids } }, limit: 50 });
        if (profs.length !== ids.length || profs.some((x) => !x.roles?.includes('reviewer') && !x.roles?.includes('professor'))) bad('داوران انتخاب‌شده معتبر نیستند.');
        const { records: prev } = await zite.reviews.findAll({ filters: { thesis: t.id }, limit: 200 });
        const round = prev.reduce((m, x) => Math.max(m, x.round ?? 1), 0) + 1;
        await zite.reviews.bulkCreate({
          records: list.map((r) => ({ round, label: `${t.thesisCode} — ${profs.find((x) => x.id === r.id)?.fullName ?? ''}`, thesis: t.id, reviewerId: r.id, reviewerType: r.type, verdict: 'pending' })),
        });
        await notifyT(ids, 'review_assigned', vars(), t.id);
        to = 'REVIEWING';
        break;
      }
      case 'schedule_defense': {
        role = 'graduate_office';
        const d = await checkDefenseSlot(input.defenseDate ? new Date(input.defenseDate) : null, input.defenseLocation);
        upd.defenseDate = d.toISOString();
        upd.defenseLocation = input.defenseLocation!.trim();
        const rv = await latestReviews(t.id);
        await notifyT([t.studentId ?? '', t.supervisorId ?? '', t.advisorId ?? '', ...rv.map((r) => r.reviewerId ?? '')], 'defense_scheduled', { ...vars(), date: fdate(upd.defenseDate), location: upd.defenseLocation }, t.id);
        to = 'DEFENSE_SCHEDULED';
        break;
      }
      case 'reschedule_defense': {
        const d = await checkDefenseSlot(input.defenseDate ? new Date(input.defenseDate) : null, input.defenseLocation);
        if (t.defenseDate && Math.abs(new Date(t.defenseDate).getTime() - d.getTime()) < 60_000 && t.defenseLocation === input.defenseLocation?.trim()) bad('تاریخ/محل جدید با قبلی یکسان است.');
        upd.defenseDate = d.toISOString();
        upd.defenseLocation = input.defenseLocation!.trim();
        await zite.defenseChanges.create({
          record: { label: `${t.thesisCode} — تغییر دفاع`, thesis: t.id, oldDate: t.defenseDate ?? null, newDate: upd.defenseDate, oldLocation: t.defenseLocation ?? null, newLocation: upd.defenseLocation, reason: comment, changedById: p.id },
        });
        const rv = await latestReviews(t.id);
        await notifyT([t.studentId ?? '', t.supervisorId ?? '', t.advisorId ?? '', ...rv.map((r) => r.reviewerId ?? '')], 'defense_changed',
          { ...vars(), oldDate: fdate(t.defenseDate), date: fdate(upd.defenseDate), location: upd.defenseLocation, reason: comment }, t.id);
        break;
      }
      case 'topic_change_approve':
      case 'topic_change_reject': {
        const tc = await zite.topicChanges.findOne({ filters: { thesis: t.id, changeStatus: { in: ['supervisor_review', 'group_review'] } } });
        if (!tc) bad('درخواست تغییر موضوع فعال یافت نشد.');
        role = tc.changeStatus === 'supervisor_review' ? 'supervisor' : 'group_manager';
        const ok = input.action === 'topic_change_approve';
        const chain = await chainSetting('topicChangeChain');
        const cur = tc.changeStatus === 'supervisor_review' ? 'supervisor' : 'group_manager';
        const next = chain[chain.indexOf(cur as never) + 1];
        const decisions = logDecision(tc.decisions ?? undefined, role, ok ? 'تأیید' : 'رد');
        if (!ok) {
          await zite.topicChanges.update({ id: tc.id, record: { changeStatus: 'rejected', decisions } });
          await reviewActiveVersion(t.id, 'topic', 'revision', comment);
          await notifyT([t.studentId ?? ''], 'topic_change', { ...vars(), result: `رد شد. علت: ${comment}` }, t.id);
        } else if (next === 'group_manager') {
          await zite.topicChanges.update({ id: tc.id, record: { changeStatus: 'group_review', decisions } });
          const { records: gms } = await zite.profiles.findAll({ filters: { department: first(t.department) ?? '' }, limit: 200 });
          await notifyT([t.studentId ?? '', ...gms.filter((g) => g.roles?.includes('group_manager')).map((g) => g.id)], 'topic_change', { ...vars(), result: 'توسط استاد راهنما تأیید شد و برای بررسی به گروه ارسال شد.' }, t.id);
        } else {
          await zite.topicChanges.update({ id: tc.id, record: { changeStatus: 'approved', decisions } });
          upd.titleFa = tc.newTitle ?? t.titleFa;
          if (tc.newTitleEn) upd.titleEn = tc.newTitleEn;
          await reviewActiveVersion(t.id, 'topic', 'approved', comment);
          await notifyT([t.studentId ?? '', t.supervisorId ?? '', t.advisorId ?? ''], 'topic_change', { ...vars(), result: `تأیید نهایی شد. عنوان جدید: ${tc.newTitle}` }, t.id);
        }
        await audit({ action: ok ? 'تأیید درخواست تغییر موضوع' : 'رد درخواست تغییر موضوع', actor: p.id, role, thesisId: t.id, comment: `«${tc.oldTitle}» ← «${tc.newTitle}»${comment ? ' | ' + comment : ''}` });
        break;
      }
      case 'confirm_completion': {
        role = 'supervisor';
        upd.completedAt = now;
        if (input.files?.length) await newVersion({ thesisId: t.id, kind: 'final', content: 'نسخهٔ اصلاح‌شدهٔ پس از دفاع', files: input.files, userId: p.id });
        to = 'THESIS_COMPLETED';
        break;
      }
      case 'start_graduation': {
        role = 'graduate_office';
        const items = (await getSettingsList('graduationChecklist'));
        const { records: existing } = await zite.graduationItems.findAll({ filters: { thesis: t.id }, limit: 100 });
        const missing = items.filter((k) => !existing.some((e) => e.itemKey === k));
        if (missing.length) await zite.graduationItems.bulkCreate({ records: missing.map((k) => ({ label: `${t.thesisCode} — ${k}`, thesis: t.id, itemKey: k, itemStatus: 'pending' })) });
        await notifyT([t.studentId ?? ''], 'graduation', { ...vars(), result: `فرآیند فارغ‌التحصیلی آغاز شد. لطفاً مدارک چک‌لیست (${items.join('، ')}) را بارگذاری کنید.` }, t.id);
        to = 'GRADUATION_PROCESS';
        break;
      }
      case 'graduate': {
        role = 'graduate_office';
        const { records: items } = await zite.graduationItems.findAll({ filters: { thesis: t.id }, limit: 100 });
        const open = items.filter((i) => i.itemStatus !== 'verified');
        if (!items.length || open.length) bad(`همهٔ مدارک چک‌لیست باید تأیید شوند. مانده: ${open.map((i) => i.itemKey).join('، ') || 'چک‌لیست ایجاد نشده'}`);
        upd.graduatedAt = now;
        upd.isLocked = true;
        to = 'GRADUATED';
        break;
      }
      case 'reopen_case':
        role = 'admin';
        upd.isLocked = false;
        break;
      case 'record_defense': {
        role = 'graduate_office';
        if (input.score == null) bad('نمرهٔ دفاع را وارد کنید.');
        const sc = input.score;
        const grade = sc >= 19 ? 'عالی' : sc >= 17 ? 'بسیار خوب' : sc >= 14 ? 'خوب' : sc >= 12 ? 'قابل قبول' : 'غیرقابل قبول';
        const passed = sc >= 12;
        upd.defenseScore = sc;
        upd.defenseGrade = grade;
        if (passed) {
          upd.defendedAt = now;
          const rv = await latestReviews(t.id);
          const names = await profileNames([t.studentId ?? '', t.supervisorId ?? '', t.advisorId ?? '', ...rv.map((r) => r.reviewerId ?? '')]);
          const stu = t.studentId ? await zite.profiles.findOne({ id: t.studentId }) : undefined;
          const dep = first(t.department) ? await zite.departments.findOne({ id: first(t.department)! }) : undefined;
          const irc = await zite.iranDocRecords.findOne({ filters: { thesis: t.id, isActive: true } });
          const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const fd = (iso?: string) => (iso ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso)) : '—');
          const html = `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:a4;margin:18mm}body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:11pt;color:#111}
h1{text-align:center;font-size:16pt;margin:0}h2{text-align:center;font-size:12pt;font-weight:400;margin:4px 0 18px}
table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #999;padding:7px;text-align:right}th{background:#f0f0f0}
.box{border:2px solid #222;padding:12px;margin:14px 0;text-align:center;font-size:13pt}.sig td{height:48px}</style></head><body>
<div style="text-align:center"><img src="${LOGO_DATA_URI}" style="height:70px"/></div><h1>دانشگاه شمال — مدیریت تحصیلات تکمیلی</h1><h2>صورتجلسهٔ دفاع از پایان‌نامه</h2>
<table><tr><th>کد پرونده</th><td>${esc(t.thesisCode)}</td><th>گروه آموزشی</th><td>${esc(dep?.name)}</td></tr>
<tr><th>نام دانشجو</th><td>${esc(names[t.studentId ?? ''])}</td><th>شماره دانشجویی</th><td>${esc(stu?.studentNumber)}</td></tr>
<tr><th>عنوان</th><td colspan="3">${esc(t.titleFa)}</td></tr>
<tr><th>زمان دفاع</th><td>${esc(fd(t.defenseDate))}</td><th>محل</th><td>${esc(t.defenseLocation)}</td></tr>
<tr><th>درصد همانندجویی</th><td>${esc(t.similarityPercent ?? '—')}</td><th>کد ایرانداک</th><td>${esc(irc?.trackingCode ?? '—')}</td></tr></table>
<div class="box">نمرهٔ نهایی: <b>${sc}</b> از ۲۰ — درجه: <b>${grade}</b></div>
${comment ? `<p><b>توضیحات هیئت داوران:</b> ${esc(comment)}</p>` : ''}
<table class="sig"><tr><th>سمت</th><th>نام</th><th>نمره داوری</th><th>امضا</th></tr>
<tr><td>استاد راهنما</td><td>${esc(names[t.supervisorId ?? ''])}</td><td>—</td><td></td></tr>
${t.advisorId ? `<tr><td>استاد مشاور</td><td>${esc(names[t.advisorId])}</td><td>—</td><td></td></tr>` : ''}
${rv.map((r) => `<tr><td>${r.reviewerType === 'external' ? 'داور خارجی' : 'داور داخلی'}</td><td>${esc(names[r.reviewerId ?? ''])}</td><td>${r.score ?? '—'}</td><td></td></tr>`).join('')}
<tr><td>نمایندهٔ تحصیلات تکمیلی</td><td>${esc(p.fullName)}</td><td>—</td><td></td></tr></table>
<p style="font-size:9pt;color:#555">تاریخ صدور: ${esc(fd(now))} — سامانهٔ شمال‌داک</p></body></html>`;
          const pdf = await ZitePdf.renderHtml({ html, filename: `minutes-${t.thesisCode ?? t.id}.pdf` });
          upd.minutesPdf = [{ url: pdf.url, filename: `صورتجلسه-${t.thesisCode ?? ''}.pdf` }];
          to = 'DEFENDED';
        } else to = 'FINAL_REVISION';
        break;
      }
      case 'cancel':
        role = p.roles?.includes('admin') ? 'admin' : 'graduate_office';
        to = 'CANCELLED';
        break;
    }
    upd.status = to;
    await zite.theses.update({ id: t.id, record: upd });
    if (!input.action.startsWith('topic_change')) await audit({ action: input.action, actor: p.id, role, thesisId: t.id, from, to, comment: comment || undefined });
    return { status: to };
    });
  },
});
