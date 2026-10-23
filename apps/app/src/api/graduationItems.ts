import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite, type ZiteAttachment } from 'zitejs/db';
import { audit, bad, canView, forbidden, has, notifyT, requireAuth } from '../lib/server';

const files = (a?: ZiteAttachment[]) => (a ?? []).map((f) => ({ url: f.url, name: f.originalName || f.filename }));

export default createEndpoint({
  description: 'Graduation checklist for a thesis: list items, student uploads documents, graduate office verifies or rejects',
  inputSchema: z.object({
    token: z.string(),
    thesisId: z.string(),
    op: z.enum(['list', 'submit', 'verify', 'reject']).default('list'),
    itemId: z.string().optional(),
    note: z.string().optional(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })).optional(),
  }),
  outputSchema: z.object({
    items: z.array(z.object({ id: z.string(), key: z.string(), status: z.string(), note: z.string(), files: z.array(z.object({ url: z.string(), name: z.string() })), verifiedAt: z.string() })),
    canSubmit: z.boolean(),
    canVerify: z.boolean(),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token);
    const t = await zite.theses.findOne({ id: input.thesisId });
    if (!t) bad('پرونده یافت نشد.');
    if (!(await canView(p, t))) forbidden('دسترسی به این پرونده مجاز نیست.');
    const open = t.status === 'GRADUATION_PROCESS' && !t.isLocked;
    const canSubmit = open && t.studentId === p.id;
    const canVerify = open && has(p, 'graduate_office');
    if (input.op !== 'list') {
      const item = input.itemId ? await zite.graduationItems.findOne({ id: input.itemId }) : undefined;
      if (!item || [item.thesis].flat()[0] !== t.id) bad('مورد چک‌لیست یافت نشد.');
      const vars = { code: t.thesisCode ?? '', title: t.titleFa ?? '' };
      if (input.op === 'submit') {
        if (!canSubmit) forbidden();
        if (!input.files?.length) bad('فایل مدرک را بارگذاری کنید.');
        await zite.graduationItems.update({ id: item.id, record: { files: input.files, itemStatus: 'submitted', note: input.note?.trim() || null } });
        await audit({ action: `بارگذاری مدرک فارغ‌التحصیلی: ${item.itemKey}`, actor: p.id, role: 'student', thesisId: t.id });
      } else {
        if (!canVerify) forbidden();
        const ok = input.op === 'verify';
        if (!ok && (input.note?.trim().length ?? 0) < 3) bad('علت رد مدرک را بنویسید.');
        await zite.graduationItems.update({ id: item.id, record: { itemStatus: ok ? 'verified' : 'rejected', note: input.note?.trim() || item.note || null, verifiedById: p.id, verifiedAt: new Date().toISOString() } });
        await audit({ action: `${ok ? 'تأیید' : 'رد'} مدرک فارغ‌التحصیلی: ${item.itemKey}`, actor: p.id, role: 'graduate_office', thesisId: t.id, comment: input.note });
        await notifyT([t.studentId ?? ''], 'graduation', { ...vars, result: `مدرک «${item.itemKey}» ${ok ? 'تأیید شد' : 'رد شد: ' + input.note}` }, t.id);
      }
    }
    const { records } = await zite.graduationItems.findAll({ filters: { thesis: t.id }, limit: 100 });
    return {
      items: records.map((r) => ({ id: r.id, key: r.itemKey ?? '', status: r.itemStatus ?? 'pending', note: r.note ?? '', files: files(r.files), verifiedAt: r.verifiedAt ?? '' })),
      canSubmit, canVerify,
    };
  },
});
