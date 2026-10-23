import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, checkPasswordPolicy, hashPassword, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Admin: sets a temporary password, unlocks the account and ends its sessions',
  inputSchema: z.object({ token: z.string(), profileId: z.string(), tempPassword: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, ['admin']);
    const target = await zite.profiles.findOne({ id: input.profileId });
    if (!target) bad('کاربر یافت نشد.');
    checkPasswordPolicy(input.tempPassword);
    await zite.profiles.update({
      id: target.id,
      record: { passwordHash: await hashPassword(input.tempPassword), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    const { records } = await zite.sessions.findAll({ filters: { profileId: target.id, revoked: false }, limit: 500 });
    for (const s of records) await zite.sessions.update({ id: s.id, record: { revoked: true } });
    await audit({ action: 'بازنشانی رمز و رفع قفل حساب', actor: admin.id, role: 'admin', comment: target.username ?? '' });
    return { ok: true };
  },
});
