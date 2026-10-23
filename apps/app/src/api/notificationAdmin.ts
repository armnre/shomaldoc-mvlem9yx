import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, getTemplate, requireAuth, TEMPLATE_DEFAULTS } from '../lib/server';

const CH = z.enum(['inApp', 'email', 'sms']);

export default createEndpoint({
  description: 'Admin: notification templates (edit title/body/channels) and the delivery log of every channel',
  inputSchema: z.object({
    token: z.string(),
    save: z.object({ key: z.string(), title: z.string(), body: z.string(), channels: z.array(CH), isActive: z.boolean() }).optional(),
    logChannel: z.enum(['all', 'inApp', 'email', 'sms']).default('all'),
    logPage: z.number().int().min(0).default(0),
  }),
  outputSchema: z.object({
    templates: z.array(z.object({ key: z.string(), description: z.string(), title: z.string(), body: z.string(), channels: z.array(z.string()), isActive: z.boolean() })),
    logs: z.array(z.object({ id: z.string(), title: z.string(), channel: z.string(), recipient: z.string(), status: z.string(), error: z.string(), templateKey: z.string(), at: z.string(), userName: z.string() })),
    logTotal: z.number(),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['admin']);
    if (input.save) {
      const s = input.save;
      if (!TEMPLATE_DEFAULTS[s.key]) bad('کلید قالب نامعتبر است.');
      if (s.title.trim().length < 3 || s.body.trim().length < 3) bad('عنوان و متن قالب الزامی است.');
      if (!s.channels.includes('inApp')) bad('کانال درون‌سامانه‌ای همیشه فعال است.');
      await zite.notificationTemplates.bulkCreate({ records: [{ key: s.key, title: s.title.trim(), body: s.body.trim(), channels: s.channels, isActive: s.isActive }], matchOn: ['key'] });
      await audit({ action: 'ویرایش قالب اعلان', actor: p.id, role: 'admin', comment: `${s.key} (${s.channels.join(',')})` });
    }
    const templates = await Promise.all(Object.keys(TEMPLATE_DEFAULTS).filter((k) => k !== 'generic').map(async (key) => {
      const t = await getTemplate(key);
      return { key, description: TEMPLATE_DEFAULTS[key].description, title: t.title, body: t.body, channels: t.channels, isActive: t.active };
    }));
    const where = input.logChannel === 'all' ? '' : `WHERE l."channel" = $1`;
    const params = input.logChannel === 'all' ? [] : [input.logChannel];
    const [{ rows }, { rows: cnt }] = await Promise.all([
      zite.sql({
        query: `SELECT l.id, l."title", l."channel", l."recipient", l."deliveryStatus", l."error", l."templateKey", l."created", p."fullName"
                FROM "NotificationLogs" l LEFT JOIN "Profiles" p ON p.id::text = l."profileId" ${where} ORDER BY l."created" DESC LIMIT 50 OFFSET ${input.logPage * 50}`,
        params,
      }),
      zite.sql({ query: `SELECT COUNT(*)::int AS c FROM "NotificationLogs" l ${where}`, params }),
    ]);
    const s = (v: unknown) => (v == null ? '' : String(v));
    return {
      templates,
      logs: rows.map((r) => ({ id: s(r.id), title: s(r.title), channel: s(r.channel), recipient: s(r.recipient), status: s(r.deliveryStatus), error: s(r.error), templateKey: s(r.templateKey), at: s(r.created), userName: s(r.fullName) })),
      logTotal: Number(cnt[0]?.c ?? 0),
    };
  },
});
