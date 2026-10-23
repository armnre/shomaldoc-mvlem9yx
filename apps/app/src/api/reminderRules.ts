import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, requireAuth, STATUS_FA, STATUS_ORDER } from '../lib/server';

const ROLES = ['group_manager', 'graduate_office', 'admin'] as const;

export default createEndpoint({
  description: 'Admin: lists, creates, edits and deletes reminder/escalation rules per waiting status',
  inputSchema: z.object({
    token: z.string(),
    op: z.enum(['list', 'save', 'delete']).default('list'),
    id: z.string().optional(),
    rule: z.object({
      statusKey: z.string(), notifyAfterDays: z.number().int().min(0).max(365), remindAfterDays: z.number().int().min(0).max(365),
      escalateAfterDays: z.number().int().min(0).max(365), escalateToRole: z.enum(ROLES), isActive: z.boolean(),
    }).optional(),
  }),
  outputSchema: z.object({
    rules: z.array(z.object({ id: z.string(), statusKey: z.string(), statusLabel: z.string(), notifyAfterDays: z.number(), remindAfterDays: z.number(), escalateAfterDays: z.number(), escalateToRole: z.string(), isActive: z.boolean() })),
    statuses: z.array(z.object({ key: z.string(), label: z.string() })),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['admin']);
    if (input.op === 'save') {
      const r = input.rule;
      if (!r || !STATUS_ORDER.includes(r.statusKey)) bad('وضعیت نامعتبر است.');
      if (!(r.notifyAfterDays <= r.remindAfterDays && r.remindAfterDays <= r.escalateAfterDays)) bad('روزها باید به ترتیب اعلان ≤ یادآوری ≤ ارتقا باشند.');
      const dup = await zite.reminderRules.findOne({ filters: { statusKey: r.statusKey } });
      if (dup && dup.id !== input.id) bad('برای این وضعیت قبلاً قاعده تعریف شده است.');
      if (input.id) await zite.reminderRules.update({ id: input.id, record: r });
      else await zite.reminderRules.create({ record: r });
      await audit({ action: 'ذخیرهٔ قاعدهٔ یادآوری/ارتقا', actor: p.id, role: 'admin', comment: `${STATUS_FA[r.statusKey]}: ${r.notifyAfterDays}/${r.remindAfterDays}/${r.escalateAfterDays} روز → ${r.escalateToRole}` });
    }
    if (input.op === 'delete' && input.id) {
      await zite.reminderRules.delete({ id: input.id });
      await audit({ action: 'حذف قاعدهٔ یادآوری', actor: p.id, role: 'admin', comment: input.id });
    }
    const { records } = await zite.reminderRules.findAll({ limit: 200 });
    return {
      rules: records.map((r) => ({
        id: r.id, statusKey: r.statusKey ?? '', statusLabel: STATUS_FA[r.statusKey ?? ''] ?? r.statusKey ?? '', notifyAfterDays: r.notifyAfterDays ?? 0,
        remindAfterDays: r.remindAfterDays ?? 0, escalateAfterDays: r.escalateAfterDays ?? 0, escalateToRole: r.escalateToRole ?? 'group_manager', isActive: r.isActive !== false,
      })).sort((a, b) => STATUS_ORDER.indexOf(a.statusKey) - STATUS_ORDER.indexOf(b.statusKey)),
      statuses: STATUS_ORDER.map((k) => ({ key: k, label: STATUS_FA[k] ?? k })),
    };
  },
});
