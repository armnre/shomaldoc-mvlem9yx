import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, findStudentThesis, first, forbidden, newVersion, remainingCapacity, requireAuth, withProfileLock } from '../lib/server';

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
    if (!t.titleFa) bad('ثبت موضوع پایان‌نامه الزامی است.');
    const prof = await zite.profiles.findOne({ id: input.professorId });
    if (!prof || !prof.roles?.includes('professor') || first(prof.department) !== first(t.department)) bad('استاد انتخاب‌شده در گروه شما نیست.');
    const prior = await zite.supervisorRequests.findOne({ filters: { thesis: t.id, professorId: prof.id } });
    if (prior) bad('قبلاً از این استاد درخواست کرده‌اید.');
    // Capacity check + reservation are serialised per professor (row lock on the self-hosted server).
    await withProfileLock(prof.id, async () => {
      if ((await remainingCapacity(prof)) <= 0) bad('ظرفیت این استاد تکمیل است.');
      await zite.supervisorRequests.create({
        record: { summary: `${t.thesisCode} → ${prof.fullName ?? ''}`, thesis: t.id, professorId: prof.id, requestStatus: 'pending', reason: null, decidedAt: null },
      });
    });
    await newVersion({
      thesisId: t.id, kind: 'topic', userId: p.id, files: input.files,
      content: [`عنوان: ${t.titleFa}`, t.titleEn ? `عنوان انگلیسی: ${t.titleEn}` : ''].filter(Boolean).join('\n'),
    });
    await zite.theses.update({ id: t.id, record: { status: 'WAITING_SUPERVISOR' } });
    await audit({ action: 'درخواست استاد راهنما', actor: p.id, role: 'student', thesisId: t.id, from: t.status, to: 'WAITING_SUPERVISOR', comment: prof.fullName ?? '' });
    return { ok: true };
  },
});
