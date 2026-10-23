import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, hashPassword, intSetting, needsRehash, newToken, SESSION_HOURS, sha256, verifyPassword } from '../lib/server';

const GENERIC = 'نام کاربری یا رمز عبور نادرست است.';
function fail(msg: string): never {
  throw new ZiteError({ code: 'UNAUTHORIZED', message: 'login failed', userFacingMessage: msg });
}

export default createEndpoint({
  description: 'Username/password sign-in with lockout after repeated failures; returns a session token',
  inputSchema: z.object({ username: z.string(), password: z.string(), userAgent: z.string().optional() }),
  outputSchema: z.object({ token: z.string(), mustChangePassword: z.boolean() }),
  execute: async ({ input }) => {
    const username = input.username.trim().toLowerCase();
    const p = await zite.profiles.findOne({ filters: { username } });
    if (!p) {
      await hashPassword(input.password); // equalise timing for unknown users
      fail(GENERIC);
    }
    if (p.disabled) fail('حساب کاربری شما غیرفعال است.');
    if (p.lockedUntil && new Date(p.lockedUntil) > new Date()) {
      const mins = Math.ceil((new Date(p.lockedUntil).getTime() - Date.now()) / 60000);
      fail(`حساب به دلیل ورودهای ناموفق موقتاً قفل است. ${mins} دقیقه دیگر تلاش کنید.`);
    }
    if (!(await verifyPassword(input.password, p.passwordHash))) {
      const n = (p.failedLogins ?? 0) + 1;
      const max = await intSetting('maxLoginAttempts');
      const lock = n >= max;
      await zite.profiles.update({
        id: p.id,
        record: { failedLogins: lock ? 0 : n, lockedUntil: lock ? new Date(Date.now() + (await intSetting('lockMinutes')) * 60000).toISOString() : null },
      });
      await audit({ action: lock ? 'قفل حساب پس از ورود ناموفق' : 'ورود ناموفق', actor: p.id, role: 'security' });
      fail(lock ? 'به دلیل ورودهای ناموفق، حساب موقتاً قفل شد.' : GENERIC);
    }
    const token = newToken();
    await zite.sessions.create({
      record: {
        tokenHash: await sha256(token), profileId: p.id, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000).toISOString(),
        lastSeenAt: new Date().toISOString(), userAgent: (input.userAgent ?? '').slice(0, 200), ipAddress: null, revoked: false,
      },
    });
    if (p.failedLogins || p.lockedUntil || needsRehash(p.passwordHash)) {
      // Transparent upgrade of old hashes to the current iteration count after a successful login.
      await zite.profiles.update({
        id: p.id,
        record: { failedLogins: 0, lockedUntil: null, ...(needsRehash(p.passwordHash) ? { passwordHash: await hashPassword(input.password) } : {}) },
      });
    }
    await audit({ action: 'ورود به سامانه', actor: p.id, role: 'security' });
    return { token, mustChangePassword: !!p.mustChangePassword };
  },
});
