import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, findStudentThesis, forbidden, requireAuth } from '../lib/server';

const file = z.object({ url: z.string(), filename: z.string() });

export default createEndpoint({
  description: 'Student registers IranDoc tracking code, date, receipt and certificate for review',
  inputSchema: z.object({
    token: z.string(),
    trackingCode: z.string(),
    registeredOn: z.string(),
    receipt: z.array(file),
    certificate: z.array(file),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t = await findStudentThesis(p.id);
    if (!t) bad('پرونده‌ای یافت نشد.');
    if (t.status !== 'IRANDOC_PENDING') forbidden('ثبت ایرانداک فقط پس از تصویب پروپوزال ممکن است.');
    const code = input.trackingCode.trim();
    if (!/^[A-Za-z0-9-]{4,40}$/.test(code)) bad('کد رهگیری ایرانداک نامعتبر است.');
    const d = new Date(input.registeredOn);
    if (isNaN(d.getTime()) || d > new Date()) bad('تاریخ ثبت نامعتبر است.');
    if (!input.receipt.length) bad('بارگذاری رسید ایرانداک الزامی است.');
    const { records } = await zite.iranDocRecords.findAll({ filters: { thesis: t.id, isActive: true }, limit: 50 });
    for (const r of records) await zite.iranDocRecords.update({ id: r.id, record: { isActive: false } });
    await zite.iranDocRecords.create({
      record: {
        trackingCode: code, thesis: t.id, registeredOn: input.registeredOn.slice(0, 10), receipt: input.receipt,
        certificate: input.certificate, reviewStatus: 'submitted', reviewComment: null, isActive: true,
      },
    });
    await zite.theses.update({ id: t.id, record: { status: 'IRANDOC_REVIEW' } });
    await audit({ action: 'ثبت اطلاعات ایرانداک', actor: p.id, role: 'student', thesisId: t.id, from: t.status, to: 'IRANDOC_REVIEW', comment: code });
    return { ok: true };
  },
});
