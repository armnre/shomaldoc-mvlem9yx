import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, authenticate, bad } from '../lib/server';

export default createEndpoint({
  description: 'Lists the signed-in user active sessions, optionally ending one',
  inputSchema: z.object({ token: z.string(), revokeId: z.string().optional() }),
  outputSchema: z.object({
    sessions: z.array(z.object({ id: z.string(), userAgent: z.string(), createdAt: z.string(), lastSeenAt: z.string(), current: z.boolean() })),
  }),
  execute: async ({ input }) => {
    const { profile, sessionId } = await authenticate(input.token);
    if (input.revokeId) {
      const s = await zite.sessions.findOne({ id: input.revokeId });
      if (!s || s.profileId !== profile.id) bad('نشست یافت نشد.');
      await zite.sessions.update({ id: s.id, record: { revoked: true } });
      await audit({ action: 'پایان دادن به نشست', actor: profile.id, role: 'security' });
    }
    const { records } = await zite.sessions.findAll({ filters: { profileId: profile.id, revoked: false, expiresAt: { gt: new Date().toISOString() } }, limit: 100 });
    return {
      sessions: records
        .map((s) => ({ id: s.id, userAgent: s.userAgent ?? '', createdAt: s.created ?? '', lastSeenAt: s.lastSeenAt ?? '', current: s.id === sessionId }))
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
    };
  },
});
