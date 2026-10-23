import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, findStudentThesis, forbidden, first, intSetting, requireAuth } from '../lib/server';

const EDITABLE = ['DRAFT', 'SUPERVISOR_REJECTED', 'TOPIC_REVISION'];

export default createEndpoint({
  description: 'Creates or updates the signed-in student thesis topic draft',
  inputSchema: z.object({
    token: z.string(),
    titleFa: z.string(),
    titleEn: z.string(),
    keywords: z.string(),
    problemStatement: z.string(),
    objectives: z.string(),
  }),
  outputSchema: z.object({ thesisId: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    if (!p.eligibleForThesis) forbidden('شما هنوز به‌عنوان واجد شرایط اخذ پایان‌نامه ثبت نشده‌اید.');
    const dep = first(p.department);
    if (!dep) bad('گروه آموزشی شما هنوز توسط مدیر سیستم تعیین نشده است.');
    if (input.titleFa.trim().length < 5) bad('عنوان فارسی باید حداقل ۵ نویسه باشد.');
    const rec = {
      titleFa: input.titleFa.trim(), titleEn: input.titleEn.trim(), keywords: input.keywords.trim(),
      problemStatement: input.problemStatement.trim(), objectives: input.objectives.trim(),
    };
    const existing = await findStudentThesis(p.id);
    if (existing) {
      if (!EDITABLE.includes(existing.status ?? '')) forbidden('در وضعیت فعلی پرونده امکان ویرایش موضوع نیست.');
      await zite.theses.update({ id: existing.id, record: rec });
      await audit({ action: 'ویرایش پیش‌نویس موضوع', actor: p.id, role: 'student', thesisId: existing.id });
      return { thesisId: existing.id };
    }
    const { rows } = await zite.sql({ query: `SELECT COUNT(*)::int AS c FROM "Theses"` });
    const year = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric' }).format(new Date()).replace(/\D/g, '');
    const code = `SHD-${year}-${String(Number(rows[0]?.c ?? 0) + 1).padStart(4, '0')}`;
    const t = await zite.theses.create({
      record: {
        ...rec, thesisCode: code, studentId: p.id, department: dep, program: first(p.program) ?? null, status: 'DRAFT', proposalStep: null,
        supervisorId: null, advisorId: null, supervisorRejections: 0, topicApprovedAt: null, proposalApprovedAt: null,
        thesisApprovedAt: null, termsUsed: 0, allowedTerms: await intSetting('baseAllowedTerms'),
        supervisorRequests: null, documentVersions: null, auditLogs: null,
      },
    });
    await audit({ action: 'ایجاد پرونده پایان‌نامه', actor: p.id, role: 'student', thesisId: t.id, to: 'DRAFT', comment: code });
    return { thesisId: t.id };
  },
});
