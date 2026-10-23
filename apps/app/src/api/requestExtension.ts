import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, chainSetting, findStudentThesis, forbidden, intSetting, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Student requests a thesis extension; routes to the special commission past the term threshold',
  inputSchema: z.object({
    token: z.string(),
    reason: z.string(),
    documents: z.array(z.object({ url: z.string(), filename: z.string() })),
  }),
  outputSchema: z.object({ needsCommission: z.boolean() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await findStudentThesis(p.id);
    if (!t) bad('پرونده‌ای یافت نشد.');
    if (!['EXTENSION_REQUIRED', 'THESIS_ACTIVE'].includes(t.status ?? '')) forbidden('در وضعیت فعلی امکان درخواست تمدید نیست.');
    if (input.reason.trim().length < 20) bad('دلیل تمدید باید حداقل ۲۰ نویسه باشد.');
    const term = (t.termsUsed ?? 0) + 1;
    const needsCommission = term >= (await intSetting('commissionTermThreshold'));
    if (needsCommission && input.documents.length === 0) bad('برای کمیسیون موارد خاص، بارگذاری مدارک الزامی است.');
    const chain = await chainSetting(needsCommission ? 'commissionFollowupChain' : 'extensionApprovalChain');
    await zite.extensions.create({
      record: {
        label: `${t.thesisCode} — تمدید ترم ${term}`, thesis: t.id, reason: input.reason.trim(), documents: input.documents,
        needsCommission, commissionResult: null, commissionNotes: null, commissionFiles: null,
        extensionStatus: needsCommission ? 'commission' : 'in_review', chain: chain.join(','), decisions: '', termNumber: term,
      },
    });
    const to = needsCommission ? 'SPECIAL_COMMISSION' : 'EXTENSION_REQUESTED';
    await zite.theses.update({ id: t.id, record: { status: to, proposalStep: needsCommission ? null : chain[0] } });
    await audit({ action: needsCommission ? 'درخواست کمیسیون موارد خاص' : 'درخواست تمدید', actor: p.id, role: 'student', thesisId: t.id, from: t.status, to });
    return { needsCommission };
  },
});
