import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { assertEditable, bad, findStudentThesis, forbidden, requireAuth } from '../lib/server';

const DRAFT_STATUSES = ['PROPOSAL_DRAFT', 'PROPOSAL_REVISION'];
const draft = z.object({
  answers: z.record(z.string(), z.string()),
  content: z.string(),
  coSupervisorIds: z.array(z.string()),
  advisorIds: z.array(z.string()),
  files: z.array(z.object({ url: z.string(), filename: z.string() })),
  step: z.number().int().min(0).max(20),
});

export default createEndpoint({
  description: 'Saves the student proposal form draft server-side (autosave between steps); does not submit it',
  inputSchema: z.object({ token: z.string(), draft }),
  outputSchema: z.object({ savedAt: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await findStudentThesis(p.id);
    if (!t) bad('پرونده‌ای یافت نشد.');
    assertEditable(t);
    if (!DRAFT_STATUSES.includes(t.status ?? '')) forbidden('در وضعیت فعلی پرونده، ویرایش فرم پروپوزال مجاز نیست.');
    const parsed = draft.safeParse(input.draft);
    if (!parsed.success) bad('ساختار پیش‌نویس نامعتبر است.');
    const savedAt = new Date().toISOString();
    const json = JSON.stringify({ ...parsed.data, savedAt });
    if (json.length > 200_000) bad('حجم پیش‌نویس بیش از حد مجاز است.');
    await zite.theses.update({ id: t.id, record: { proposalDraft: json } });
    return { savedAt };
  },
});
