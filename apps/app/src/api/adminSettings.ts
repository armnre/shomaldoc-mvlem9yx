import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, getSettings, requireAuth, SETTING_DEFAULTS, STATUS_FA, STATUS_ORDER, STEPS } from '../lib/server';

export default createEndpoint({
  description: 'Admin: reads and optionally updates configurable system settings and approval chains',
  inputSchema: z.object({ token: z.string(), updates: z.record(z.string()).optional() }),
  outputSchema: z.object({
    settings: z.array(z.object({ key: z.string(), value: z.string(), description: z.string(), kind: z.string() })),
    statuses: z.array(z.object({ key: z.string(), label: z.string() })),
  }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, ['admin']);
    if (input.updates) {
      const before = await getSettings();
      for (const [key, value] of Object.entries(input.updates)) {
        const def = SETTING_DEFAULTS[key];
        if (!def) bad(`کلید نامعتبر: ${key}`);
        if (def.kind === 'int' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)) bad(`مقدار «${def.description}» باید عدد ۱ تا ۱۰۰ باشد.`);
        if (def.kind === 'chain') {
          const parts = value.split(',').map((x) => x.trim());
          if (!parts.length || parts.some((x) => !STEPS.includes(x as never)) || new Set(parts).size !== parts.length) bad(`«${def.description}» نامعتبر است.`);
        }
        if (def.kind === 'status' && !STATUS_ORDER.includes(value)) bad(`«${def.description}» نامعتبر است.`);
        if (def.kind === 'list' && !value.split(',').map((x) => x.trim()).filter(Boolean).length) bad(`«${def.description}» حداقل یک مورد لازم دارد.`);
        if (before[key] === value) continue;
        await zite.settings.bulkCreate({ records: [{ key, value, description: def.description }], matchOn: ['key'] });
        await audit({ action: `تغییر تنظیم: ${def.description}`, actor: admin.id, role: 'admin', from: before[key], to: value });
      }
    }
    const s = await getSettings();
    return { settings: Object.entries(SETTING_DEFAULTS).map(([key, d]) => ({ key, value: s[key], description: d.description, kind: d.kind })), statuses: STATUS_ORDER.map((k) => ({ key: k, label: STATUS_FA[k] ?? k })) };
  },
});
