import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Lists the signed-in user notifications and optionally marks them read',
  inputSchema: z.object({ token: z.string(), markRead: z.array(z.string()).optional(), markAll: z.boolean().optional() }),
  outputSchema: z.object({
    items: z.array(z.object({ id: z.string(), title: z.string(), body: z.string(), thesisId: z.string(), isRead: z.boolean(), at: z.string() })),
    unread: z.number(),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token);
    if (input.markAll || input.markRead?.length) {
      const { records } = await zite.notifications.findAll({ filters: { profileId: p.id, isRead: false }, limit: 500 });
      const ids = input.markAll ? records.map((r) => r.id) : records.filter((r) => input.markRead!.includes(r.id)).map((r) => r.id);
      for (let i = 0; i < ids.length; i += 10)
        await Promise.all(ids.slice(i, i + 10).map((id) => zite.notifications.update({ id, record: { isRead: true } })));
    }
    const { rows } = await zite.sql({
      query: `SELECT id, "title", "body", "thesisId", "isRead", "created" FROM "Notifications" WHERE "profileId" = $1 ORDER BY "created" DESC LIMIT 50`,
      params: [p.id],
    });
    const { rows: c } = await zite.sql({ query: `SELECT COUNT(*)::int AS c FROM "Notifications" WHERE "profileId" = $1 AND COALESCE("isRead", false) = false`, params: [p.id] });
    const s = (v: unknown) => (v == null ? '' : String(v));
    return {
      items: rows.map((r) => ({ id: s(r.id), title: s(r.title), body: s(r.body), thesisId: s(r.thesisId), isRead: !!r.isRead, at: s(r.created) })),
      unread: Number(c[0]?.c ?? 0),
    };
  },
});
