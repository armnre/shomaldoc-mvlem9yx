import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, authenticate, bad, checkPasswordPolicy, hashPassword, verifyPassword } from '../lib/server';

export default createEndpoint({
  description: 'Changes the signed-in user password and ends their other sessions',
  inputSchema: z.object({ token: z.string(), currentPassword: z.string(), newPassword: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const { profile, sessionId } = await authenticate(input.token);
    if (!(await verifyPassword(input.currentPassword, profile.passwordHash))) bad('رمز فعلی نادرست است.');
    if (input.currentPassword === input.newPassword) bad('رمز جدید باید با رمز فعلی متفاوت باشد.');
    checkPasswordPolicy(input.newPassword);
    await zite.profiles.update({ id: profile.id, record: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false } });
    const { records } = await zite.sessions.findAll({ filters: { profileId: profile.id, revoked: false }, limit: 500 });
    for (const s of records) if (s.id !== sessionId) await zite.sessions.update({ id: s.id, record: { revoked: true } });
    await audit({ action: 'تغییر رمز عبور', actor: profile.id, role: 'security' });
    return { ok: true };
  },
});
