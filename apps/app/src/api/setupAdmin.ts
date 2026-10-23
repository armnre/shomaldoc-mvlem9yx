import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, checkPasswordPolicy, forbidden, hashPassword } from '../lib/server';

export default createEndpoint({
  description: 'Creates the first system admin account; only works while no admin exists',
  inputSchema: z.object({ fullName: z.string(), username: z.string(), password: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const { rows } = await zite.sql({ query: `SELECT COUNT(*)::int AS c FROM "Profiles" WHERE "roles" ? 'admin'` });
    if (Number(rows[0]?.c ?? 0) > 0) forbidden('راه‌اندازی اولیه قبلاً انجام شده است.');
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) bad('نام کاربری فقط حروف لاتین، عدد، نقطه و خط تیره (۳ تا ۴۰ نویسه).');
    if (input.fullName.trim().length < 3) bad('نام کامل الزامی است.');
    checkPasswordPolicy(input.password);
    const p = await zite.profiles.create({
      record: {
        fullName: input.fullName.trim(), username, passwordHash: await hashPassword(input.password), roles: ['admin'],
        failedLogins: 0, lockedUntil: null, mustChangePassword: false, disabled: false,
        department: null, studentNumber: null, nationalCode: null, programName: null, degree: null,
        academicRank: null, baseCapacity: null, eligibleForThesis: false,
      },
    });
    await audit({ action: 'راه‌اندازی اولیه و ایجاد مدیر سیستم', actor: p.id, role: 'system' });
    return { ok: true };
  },
});
