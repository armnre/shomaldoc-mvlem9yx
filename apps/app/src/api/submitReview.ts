import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, forbidden, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'A reviewer submits their verdict, score and comments for an assigned thesis',
  inputSchema: z.object({
    token: z.string(),
    reviewId: z.string(),
    verdict: z.enum(['approve', 'revise', 'reject']),
    score: z.number().min(0).max(20),
    comment: z.string(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })),
  }),
  outputSchema: z.object({ status: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token);
    const r = await zite.reviews.findOne({ id: input.reviewId });
    if (!r || r.reviewerId !== p.id) forbidden();
    if (r.verdict !== 'pending') bad('نظر داوری شما قبلاً ثبت شده است.');
    const thesisId = Array.isArray(r.thesis) ? r.thesis[0] : r.thesis;
    const t = thesisId ? await zite.theses.findOne({ id: thesisId }) : undefined;
    if (!t || t.status !== 'REVIEWING') bad('این پرونده در مرحلهٔ داوری نیست.');
    if (input.comment.trim().length < 10) bad('ثبت نظر داوری (حداقل ۱۰ نویسه) الزامی است.');
    await zite.reviews.update({
      id: r.id,
      record: { verdict: input.verdict, score: input.score, comment: input.comment.trim(), files: input.files, submittedAt: new Date().toISOString() },
    });
    await audit({ action: 'ثبت نظر داوری', actor: p.id, role: 'reviewer', thesisId: t.id, comment: input.comment.trim() });

    const { records } = await zite.reviews.findAll({ filters: { thesis: t.id }, limit: 100 });
    const round = records.filter((x) => (x.round ?? 1) === (r.round ?? 1));
    if (round.some((x) => x.verdict === 'pending')) return { status: t.status };
    const to = round.every((x) => x.verdict === 'approve') ? 'DEFENSE_SCHEDULING' : 'FINAL_REVISION';
    await zite.theses.update({ id: t.id, record: { status: to } });
    await audit({ action: to === 'DEFENSE_SCHEDULING' ? 'تأیید داوران و آمادگی دفاع' : 'برگشت برای اصلاح پس از داوری', actor: p.id, role: 'system', thesisId: t.id, from: t.status, to });
    return { status: to };
  },
});
