import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import {
  assertEditable, audit, bad, chainSetting, findStudentThesis, first, forbidden, getSettings, newVersion, notifyT, requireAuth, STATUS_FA, STATUS_ORDER,
} from '../lib/server';

export default createEndpoint({
  description: 'Student requests a thesis topic change (old/new title, reason, files) for supervisor and group review',
  inputSchema: z.object({
    token: z.string(),
    newTitle: z.string(),
    newTitleEn: z.string(),
    reason: z.string(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })),
  }),
  outputSchema: z.object({ ok: z.boolean(), maxStatus: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await findStudentThesis(p.id);
    if (!t) bad('پرونده‌ای یافت نشد.');
    assertEditable(t);
    const maxStatus = (await getSettings()).topicChangeMaxStatus;
    const idx = STATUS_ORDER.indexOf(t.status ?? '');
    if (!t.topicApprovedAt || idx < 0 || idx > STATUS_ORDER.indexOf(maxStatus))
      forbidden(`درخواست تغییر موضوع فقط پس از تأیید موضوع و تا مرحلهٔ «${STATUS_FA[maxStatus] ?? maxStatus}» مجاز است.`);
    if (await zite.topicChanges.findOne({ filters: { thesis: t.id, changeStatus: { in: ['supervisor_review', 'group_review'] } } })) bad('یک درخواست تغییر موضوع در حال بررسی دارید.');
    const newTitle = input.newTitle.trim();
    if (newTitle.length < 5) bad('عنوان جدید باید حداقل ۵ نویسه باشد.');
    if (newTitle === (t.titleFa ?? '').trim()) bad('عنوان جدید با عنوان فعلی یکسان است.');
    if (input.reason.trim().length < 20) bad('دلیل تغییر باید حداقل ۲۰ نویسه باشد.');
    const chain = await chainSetting('topicChangeChain');
    const firstStep = chain[0] === 'group_manager' ? 'group_review' : 'supervisor_review';
    await zite.topicChanges.create({
      record: {
        label: `${t.thesisCode} — تغییر موضوع`, thesis: t.id, oldTitle: t.titleFa ?? '', newTitle, newTitleEn: input.newTitleEn.trim() || null,
        reason: input.reason.trim(), files: input.files, changeStatus: firstStep, prevStatus: t.status ?? null, requestedById: p.id, decisions: null,
      },
    });
    await newVersion({ thesisId: t.id, kind: 'topic', content: `درخواست تغییر موضوع\nعنوان قبلی: ${t.titleFa}\nعنوان جدید: ${newTitle}\nدلیل: ${input.reason.trim()}`, files: input.files, userId: p.id });
    await audit({ action: 'درخواست تغییر موضوع', actor: p.id, role: 'student', thesisId: t.id, comment: `«${t.titleFa}» ← «${newTitle}»` });
    let to: string[] = [t.supervisorId ?? ''];
    if (firstStep === 'group_review') {
      const { records } = await zite.profiles.findAll({ filters: { department: first(t.department) ?? '' }, limit: 200 });
      to = records.filter((r) => r.roles?.includes('group_manager')).map((r) => r.id);
    }
    await notifyT(to, 'topic_change', { code: t.thesisCode ?? '', title: t.titleFa ?? '', result: `دانشجو تغییر عنوان به «${newTitle}» را درخواست کرده و منتظر بررسی شماست.` }, t.id);
    return { ok: true, maxStatus };
  },
});
