import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, findStudentThesis, first, forbidden, newVersion, remainingCapacity, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Student submits the topic and requests a supervisor (capacity-checked)',
  inputSchema: z.object({
    token: z.string(),
    professorId: z.string(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await findStudentThesis(p.id);
    if (!t) bad('ابتدا پیش‌نویس موضوع را ذخیره کنید.');
    if (!['DRAFT', 'SUPERVISOR_REJECTED'].includes(t.status ?? '')) forbidden('در وضعیت فعلی امکان درخواست استاد راهنما نیست.');
    if (!t.titleFa || !t.problemStatement || !t.objectives) bad('عنوان، شرح مسئله و اهداف الزامی است.');
    const prof = await zite.profiles.findOne({ id: input.professorId });
    if (!prof || !prof.roles?.includes('professor') || first(prof.department) !== first(t.department)) bad('استاد انتخاب‌شده در گروه شما نیست.');
    const prior = await zite.supervisorRequests.findOne({ filters: { thesis: t.id, professorId: prof.id } });
    if (prior) bad('قبلاً از این استاد درخواست کرده‌اید.');
    if ((await remainingCapacity(prof)) <= 0) bad('ظرفیت این استاد تکمیل است.');

    const req = await zite.supervisorRequests.create({
      record: { summary: `${t.thesisCode} → ${prof.fullName ?? ''}`, thesis: t.id, professorId: prof.id, requestStatus: 'pending', reason: null, decidedAt: null },
    });
    // Optimistic race guard: re-check after reserving; roll back if oversubscribed.
    if ((await remainingCapacity(prof)) < 0) {
      await zite.supervisorRequests.update({ id: req.id, record: { requestStatus: 'withdrawn', reason: 'ظرفیت هم‌زمان تکمیل شد' } });
      throw new ZiteError({ code: 'CONFLICT', message: 'capacity race', userFacingMessage: 'ظرفیت این استاد هم‌زمان تکمیل شد. استاد دیگری انتخاب کنید.' });
    }
    await newVersion({
      thesisId: t.id, kind: 'topic', userId: p.id, files: input.files,
      content: `عنوان: ${t.titleFa}\nعنوان انگلیسی: ${t.titleEn ?? ''}\nکلیدواژه‌ها: ${t.keywords ?? ''}\n\nشرح مسئله:\n${t.problemStatement}\n\nاهداف:\n${t.objectives}`,
    });
    await zite.theses.update({ id: t.id, record: { status: 'WAITING_SUPERVISOR' } });
    await audit({ action: 'درخواست استاد راهنما', actor: p.id, role: 'student', thesisId: t.id, from: t.status, to: 'WAITING_SUPERVISOR', comment: prof.fullName ?? '' });
    return { ok: true };
  },
});
