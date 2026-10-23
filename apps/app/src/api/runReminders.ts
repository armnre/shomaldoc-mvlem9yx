import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite, type ThesesRecordType } from 'zitejs/db';
import { audit, first, notifyT, requireAuth, STATUS_FA } from '../lib/server';

const DAY = 86_400_000;
const STUDENT_STATUSES = ['DRAFT', 'SUPERVISOR_REJECTED', 'TOPIC_REVISION', 'LITERATURE_REVIEW', 'LITERATURE_REVISION', 'PROPOSAL_DRAFT', 'PROPOSAL_REVISION', 'IRANDOC_PENDING', 'EXTENSION_REQUIRED', 'FINAL_REVISION'];

async function usersWithRole(role: string, departmentId?: string) {
  const { records } = await zite.profiles.findAll({ filters: { disabled: false }, limit: 2000 });
  return records.filter((r) => r.roles?.includes(role) && (!departmentId || first(r.department) === departmentId)).map((r) => r.id);
}

/** Who must act on a thesis in its current status, and which role they hold. */
async function responsible(t: ThesesRecordType): Promise<{ ids: string[]; role: string }> {
  const s = t.status ?? '';
  const dep = first(t.department);
  if (STUDENT_STATUSES.includes(s)) return { ids: [t.studentId ?? ''], role: 'student' };
  if (s === 'WAITING_SUPERVISOR') {
    const { records } = await zite.supervisorRequests.findAll({ filters: { thesis: t.id, requestStatus: 'pending' }, limit: 20 });
    return { ids: records.map((r) => r.professorId ?? ''), role: 'professor' };
  }
  if (['LITERATURE_SUPERVISOR_REVIEW', 'FINAL_SUPERVISOR_REVIEW', 'DEFENDED'].includes(s)) return { ids: [t.supervisorId ?? ''], role: 'professor' };
  if (['GROUP_ASSIGNMENT', 'GROUP_REVIEW', 'REVIEWER_ASSIGNMENT'].includes(s)) return { ids: await usersWithRole('group_manager', dep), role: 'group_manager' };
  if (['IRANDOC_REVIEW', 'PLAGIARISM_CHECK', 'DEFENSE_SCHEDULING', 'SPECIAL_COMMISSION', 'THESIS_COMPLETED', 'GRADUATION_PROCESS'].includes(s)) return { ids: await usersWithRole('graduate_office'), role: 'graduate_office' };
  if (s === 'REVIEWING') {
    const { records } = await zite.reviews.findAll({ filters: { thesis: t.id, verdict: 'pending' }, limit: 20 });
    return { ids: records.map((r) => r.reviewerId ?? ''), role: 'reviewer' };
  }
  if (['PROPOSAL_REVIEW', 'EXTENSION_REQUESTED'].includes(s)) {
    const step = t.proposalStep ?? '';
    if (step === 'supervisor') return { ids: [t.supervisorId ?? ''], role: 'professor' };
    if (step === 'group_manager') return { ids: await usersWithRole('group_manager', dep), role: 'group_manager' };
    if (step) return { ids: await usersWithRole(step), role: step };
  }
  return { ids: [], role: '' };
}

export default createEndpoint({
  description: 'Daily reminder/escalation run: finds case files waiting past their deadlines, sends reminders and escalates to the higher manager without duplicates',
  inputSchema: z.object({ token: z.string(), dryRun: z.boolean().default(false) }),
  outputSchema: z.object({
    dryRun: z.boolean(),
    events: z.array(z.object({ code: z.string(), status: z.string(), days: z.number(), stage: z.string(), recipients: z.number(), duplicate: z.boolean() })),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['admin', 'graduate_office']);
    const { records: rules } = await zite.reminderRules.findAll({ filters: { isActive: true }, limit: 200 });
    const events: { code: string; status: string; days: number; stage: string; recipients: number; duplicate: boolean }[] = [];
    for (const rule of rules) {
      if (!rule.statusKey) continue;
      const { records: theses } = await zite.theses.findAll({ filters: { status: rule.statusKey, isLocked: false }, limit: 2000 });
      if (!theses.length) continue;
      const { rows } = await zite.sql({
        query: `SELECT al."thesesId" AS tid, MAX(a."created") AS since FROM "AuditLogs" a JOIN "AuditLogsTheses" al ON al."auditLogsId" = a.id
                WHERE a."toStatus" = $1 GROUP BY al."thesesId"`,
        params: [rule.statusKey],
      });
      const sinceMap = new Map(rows.map((r) => [String(r.tid), String(r.since)]));
      for (const t of theses) {
        const since = sinceMap.get(t.id);
        if (!since) continue;
        const days = Math.floor((Date.now() - new Date(since).getTime()) / DAY);
        const stages: ['notify' | 'remind' | 'escalate', number | null | undefined][] = [['notify', rule.notifyAfterDays], ['remind', rule.remindAfterDays], ['escalate', rule.escalateAfterDays]];
        const stage = stages.filter(([, d]) => d != null && d > 0 && days >= d).pop()?.[0];
        if (!stage) continue;
        const key = `${t.id}|${rule.statusKey}|${since}|${stage}`;
        const duplicate = !!(await zite.reminderLogs.findOne({ filters: { dedupeKey: key } }));
        const resp = await responsible(t);
        let recipients = resp.ids.filter(Boolean);
        if (stage === 'escalate') {
          // Escalation ladder: group manager → graduate office (→ admin if the responsible party is already at that level)
          let target = rule.escalateToRole ?? 'group_manager';
          if (target === 'group_manager' && resp.role === 'group_manager') target = 'graduate_office';
          if (target === 'graduate_office' && resp.role === 'graduate_office') target = 'admin';
          recipients = await usersWithRole(target, target === 'group_manager' ? first(t.department) : undefined);
        }
        events.push({ code: t.thesisCode ?? '', status: STATUS_FA[rule.statusKey] ?? rule.statusKey, days, stage, recipients: recipients.length, duplicate });
        if (input.dryRun || duplicate || !recipients.length) continue;
        await notifyT(recipients, stage === 'escalate' ? 'escalation' : 'reminder', { code: t.thesisCode ?? '', title: t.titleFa ?? '', days: String(days), status: STATUS_FA[rule.statusKey] ?? rule.statusKey }, t.id);
        await zite.reminderLogs.create({ record: { dedupeKey: key, thesisId: t.id, stage, recipients: recipients.join(',') } });
        await audit({ action: stage === 'escalate' ? 'ارتقای خودکار تأخیر به مدیر بالادست' : 'یادآوری خودکار مهلت اقدام', actor: p.id, role: 'system', thesisId: t.id, comment: `${days} روز در «${STATUS_FA[rule.statusKey] ?? rule.statusKey}» — ${recipients.length} گیرنده` });
      }
    }
    if (!input.dryRun) await audit({ action: 'اجرای روزانهٔ یادآوری/ارتقا', actor: p.id, role: 'system', comment: `${events.filter((e) => !e.duplicate).length} اعلان جدید، ${events.filter((e) => e.duplicate).length} تکراری حذف شد` });
    return { dryRun: input.dryRun, events };
  },
});
