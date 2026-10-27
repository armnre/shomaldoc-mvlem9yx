import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { APPROVAL_DATE_EDITABLE, audit, bad, forbidden, has, requireAuth } from '../lib/server';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Official approval day (Gregorian YYYY-MM-DD) stored as Tehran midnight, independent of when it is recorded. */
const toTehranMidnight = (day: string) => new Date(`${day}T00:00:00+03:30`);

export default createEndpoint({
  description: 'Graduate office records or corrects the official proposal approval date (audited)',
  inputSchema: z.object({ token: z.string(), thesisId: z.string(), approvalDate: z.string(), reason: z.string().optional() }),
  outputSchema: z.object({ proposalApprovedAt: z.string(), approvalDateSetAt: z.string() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['graduate_office', 'admin']);
    const t = await zite.theses.findOne({ id: input.thesisId });
    if (!t) bad('پرونده یافت نشد.');
    if (t.isLocked || !APPROVAL_DATE_EDITABLE.includes(t.status ?? '')) forbidden('ثبت تاریخ تصویب فقط پس از تصویب پروپوزال و پیش از زمان‌بندی دفاع مجاز است.');
    if (!ISO_DAY.test(input.approvalDate)) bad('قالب تاریخ نامعتبر است.');
    const d = toTehranMidnight(input.approvalDate);
    const [y, m, dd] = input.approvalDate.split('-').map(Number);
    const cal = new Date(Date.UTC(y, m - 1, dd));
    if (isNaN(d.getTime()) || cal.getUTCFullYear() !== y || cal.getUTCMonth() !== m - 1 || cal.getUTCDate() !== dd) bad('تاریخ نامعتبر است.');
    if (d.getTime() > Date.now()) bad('تاریخ تصویب نمی‌تواند در آینده باشد.');
    if (t.topicApprovedAt && d.getTime() < new Date(new Date(t.topicApprovedAt).toISOString().slice(0, 10) + 'T00:00:00+03:30').getTime()) bad('تاریخ تصویب پروپوزال نمی‌تواند پیش از تأیید موضوع باشد.');
    const reason = input.reason?.trim() ?? '';
    const prev = t.proposalApprovedAt ? new Date(t.proposalApprovedAt).toISOString() : '';
    if (t.approvalDateSetAt && reason.length < 3) bad('برای اصلاح تاریخ ثبت‌شده، ذکر علت الزامی است.');
    const now = new Date().toISOString();
    await zite.theses.update({ id: t.id, record: { proposalApprovedAt: d.toISOString(), approvalDateSetById: p.id, approvalDateSetAt: now } });
    await audit({
      action: t.approvalDateSetAt ? 'اصلاح تاریخ تصویب پروپوزال' : 'ثبت تاریخ تصویب پروپوزال',
      actor: p.id, role: has(p, 'graduate_office') ? 'graduate_office' : 'admin', thesisId: t.id,
      comment: `تاریخ رسمی: ${input.approvalDate}${prev ? ` (قبلی: ${prev.slice(0, 10)})` : ''}${reason ? ` — ${reason}` : ''}`,
    });
    return { proposalApprovedAt: d.toISOString(), approvalDateSetAt: now };
  },
});
