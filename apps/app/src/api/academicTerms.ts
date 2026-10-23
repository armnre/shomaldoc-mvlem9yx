import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Lists academic terms; admins can add or edit a term',
  inputSchema: z.object({
    token: z.string(),
    save: z.object({ id: z.string().optional(), name: z.string(), startDate: z.string(), endDate: z.string() }).optional(),
  }),
  outputSchema: z.object({
    terms: z.array(z.object({ id: z.string(), name: z.string(), startDate: z.string(), endDate: z.string(), processed: z.boolean(), processedAt: z.string() })),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['admin', 'graduate_office']);
    if (input.save) {
      if (!p.roles?.includes('admin')) bad('فقط مدیر سیستم می‌تواند ترم تعریف کند.');
      const { name, startDate, endDate, id } = input.save;
      if (name.trim().length < 3) bad('نام ترم الزامی است.');
      if (!startDate || !endDate || new Date(startDate) >= new Date(endDate)) bad('تاریخ پایان باید بعد از تاریخ شروع باشد.');
      const record = { name: name.trim(), startDate: startDate.slice(0, 10), endDate: endDate.slice(0, 10) };
      if (id) {
        const ex = await zite.academicTerms.findOne({ id });
        if (ex?.processed) bad('ترم پردازش‌شده قابل ویرایش نیست.');
        await zite.academicTerms.update({ id, record });
      } else await zite.academicTerms.create({ record: { ...record, processed: false, processedAt: null } });
      await audit({ action: id ? 'ویرایش ترم تحصیلی' : 'تعریف ترم تحصیلی', actor: p.id, role: 'admin', comment: record.name });
    }
    const { records } = await zite.academicTerms.findAll({ limit: 200 });
    return {
      terms: records
        .map((t) => ({ id: t.id, name: t.name ?? '', startDate: t.startDate ?? '', endDate: t.endDate ?? '', processed: !!t.processed, processedAt: t.processedAt ?? '' }))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    };
  },
});
