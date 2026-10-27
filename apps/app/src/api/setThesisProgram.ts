import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, first, forbidden, PROGRAM_EDITABLE, requireAuth, validateMastersProgram } from '../lib/server';

export default createEndpoint({
  description: "Sets the Master's program (faculty → major → specialization) of the signed-in student's own thesis",
  inputSchema: z.object({ token: z.string(), thesisId: z.string(), faculty: z.string(), major: z.string(), programId: z.string() }),
  outputSchema: z.object({ programId: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await zite.theses.findOne({ id: input.thesisId });
    if (!t) bad('پرونده یافت نشد.');
    if (t.studentId !== p.id) forbidden('فقط صاحب پرونده می‌تواند رشته را تعیین کند.');
    if (t.isLocked || !PROGRAM_EDITABLE.includes(t.status ?? '')) forbidden('در وضعیت فعلی پرونده امکان تغییر رشته نیست.');
    const prog = await validateMastersProgram(input);
    const before = first(t.program) ?? '';
    if (before === prog.id) return { programId: prog.id };
    await zite.theses.update({ id: t.id, record: { program: prog.id } });
    await audit({ action: 'تعیین رشته و گرایش', actor: p.id, role: 'student', thesisId: t.id, comment: `${prog.name}${prog.specialization ? ' — ' + prog.specialization : ' (بدون گرایش)'}` });
    return { programId: prog.id };
  },
});
