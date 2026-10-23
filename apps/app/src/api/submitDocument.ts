import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, chainSetting, findStudentThesis, forbidden, newVersion, requireAuth } from '../lib/server';

const RULES = {
  topic: { from: ['TOPIC_REVISION'], to: 'GROUP_REVIEW', label: 'ارسال مجدد موضوع' },
  literature: { from: ['LITERATURE_REVIEW', 'LITERATURE_REVISION'], to: 'LITERATURE_SUPERVISOR_REVIEW', label: 'ارسال پیشینه تحقیق' },
  proposal: { from: ['PROPOSAL_DRAFT', 'PROPOSAL_REVISION'], to: 'PROPOSAL_REVIEW', label: 'ارسال پروپوزال' },
  final: { from: ['THESIS_ACTIVE', 'FINAL_REVISION'], to: 'FINAL_SUPERVISOR_REVIEW', label: 'ارسال نسخهٔ نهایی پایان‌نامه' },
} as const;

export default createEndpoint({
  description: 'Student submits a new version of topic, literature review or proposal',
  inputSchema: z.object({
    token: z.string(),
    kind: z.enum(['topic', 'literature', 'proposal', 'final']),
    content: z.string(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await findStudentThesis(p.id);
    if (!t) bad('پرونده‌ای یافت نشد.');
    const rule = RULES[input.kind];
    if (!(rule.from as readonly string[]).includes(t.status ?? '')) forbidden('در وضعیت فعلی پرونده این ارسال مجاز نیست.');
    if (input.content.trim().length < 20) bad('متن ارسالی باید حداقل ۲۰ نویسه باشد.');
    if ((input.kind === 'proposal' || input.kind === 'final') && input.files.length === 0) bad('بارگذاری فایل (Word یا PDF) الزامی است.');
    await newVersion({ thesisId: t.id, kind: input.kind, content: input.content.trim(), files: input.files, userId: p.id });
    const record: { status: string; proposalStep?: string } = { status: rule.to };
    if (input.kind === 'proposal') record.proposalStep = (await chainSetting('proposalApprovalChain'))[0];
    await zite.theses.update({ id: t.id, record });
    await audit({ action: rule.label, actor: p.id, role: 'student', thesisId: t.id, from: t.status, to: rule.to });
    return { ok: true };
  },
});
