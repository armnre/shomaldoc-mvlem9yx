import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, requireAuth } from '../lib/server';

const COUNTED = ['THESIS_ACTIVE', 'EXTENSION_REQUIRED', 'EXTENSION_REQUESTED', 'SPECIAL_COMMISSION'];

export default createEndpoint({
  description: 'End-of-term control: for each ended, unprocessed term, counts a term on active theses and flags those needing extension',
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({
    processedTerms: z.array(z.string()),
    flagged: z.array(z.object({ code: z.string(), termsUsed: z.number(), allowedTerms: z.number() })),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['admin', 'graduate_office']);
    const today = new Date().toISOString().slice(0, 10);
    const { records: terms } = await zite.academicTerms.findAll({ filters: { processed: false }, limit: 200 });
    const due = terms.filter((t) => t.endDate && t.endDate < today).sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
    const flagged: { code: string; termsUsed: number; allowedTerms: number }[] = [];
    for (const term of due) {
      // Only theses approved before the term ended count this term.
      const { records: theses } = await zite.theses.findAll({ filters: { status: { in: COUNTED } }, limit: 2000 });
      for (const t of theses) {
        if (!t.thesisApprovedAt || t.thesisApprovedAt.slice(0, 10) > (term.endDate ?? '')) continue;
        const used = (t.termsUsed ?? 0) + 1;
        const allowed = t.allowedTerms ?? 0;
        const needs = t.status === 'THESIS_ACTIVE' && used >= allowed;
        await zite.theses.update({ id: t.id, record: { termsUsed: used, ...(needs ? { status: 'EXTENSION_REQUIRED' } : {}) } });
        if (needs) {
          flagged.push({ code: t.thesisCode ?? '', termsUsed: used, allowedTerms: allowed });
          await audit({ action: 'کنترل پایان ترم: نیازمند تمدید', actor: p.id, role: 'system', thesisId: t.id, from: t.status, to: 'EXTENSION_REQUIRED', comment: `${term.name} — ترم ${used} از ${allowed}` });
        }
      }
      await zite.academicTerms.update({ id: term.id, record: { processed: true, processedAt: new Date().toISOString() } });
      await audit({ action: 'اجرای کنترل پایان ترم', actor: p.id, role: 'system', comment: term.name ?? '' });
    }
    return { processedTerms: due.map((t) => t.name ?? ''), flagged };
  },
});
