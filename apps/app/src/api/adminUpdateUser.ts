import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, checkPasswordPolicy, hashPassword, requireAuth } from '../lib/server';

const ROLES = ['student', 'professor', 'group_manager', 'graduate_office', 'finance', 'reviewer', 'admin'] as const;

export default createEndpoint({
  description: 'Admin: creates a new user account, or edits an existing one (roles, department, academic details, status)',
  inputSchema: z.object({
    token: z.string(),
    profileId: z.string().optional(),
    username: z.string(),
    tempPassword: z.string().optional(),
    fullName: z.string(),
    roles: z.array(z.enum(ROLES)),
    departmentId: z.string().nullable(),
    programId: z.string().nullable().optional(),
    studentNumber: z.string(),
    nationalCode: z.string().optional(),
    degree: z.string(),
    programName: z.string(),
    academicRank: z.string(),
    baseCapacity: z.number().int().min(0).max(50),
    eligibleForThesis: z.boolean(),
    disabled: z.boolean(),
  }),
  outputSchema: z.object({ profileId: z.string() }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, ['admin']);
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) bad('نام کاربری فقط حروف لاتین، عدد، نقطه و خط تیره (۳ تا ۴۰ نویسه).');
    if (input.fullName.trim().length < 3) bad('نام کامل الزامی است.');
    if (input.nationalCode && !/^\d{10}$/.test(input.nationalCode)) bad('کد ملی باید ۱۰ رقم باشد.');
    if (input.roles.includes('group_manager') && !input.departmentId) bad('مدیر گروه باید گروه آموزشی داشته باشد.');
    if (input.roles.includes('student') && !input.studentNumber.trim()) bad('شماره دانشجویی الزامی است.');
    const dup = await zite.profiles.findOne({ filters: { username } });
    if (dup && dup.id !== input.profileId) bad('این نام کاربری قبلاً استفاده شده است.');

    const record = {
      username, fullName: input.fullName.trim(), roles: input.roles, department: input.departmentId,
      ...(input.programId !== undefined ? { program: input.programId } : {}),
      studentNumber: input.studentNumber.trim() || null, ...(input.nationalCode ? { nationalCode: input.nationalCode } : {}),
      degree: input.degree || null, programName: input.programName.trim() || null, academicRank: input.academicRank || null,
      baseCapacity: input.baseCapacity, eligibleForThesis: input.eligibleForThesis, disabled: input.disabled,
    };
    if (input.profileId) {
      const target = await zite.profiles.findOne({ id: input.profileId });
      if (!target) bad('کاربر یافت نشد.');
      if (target.id === admin.id && (!input.roles.includes('admin') || input.disabled)) bad('نمی‌توانید دسترسی مدیر سیستم را از خودتان بگیرید.');
      await zite.profiles.update({ id: target.id, record });
      if (input.disabled && !target.disabled) {
        const { records } = await zite.sessions.findAll({ filters: { profileId: target.id, revoked: false }, limit: 500 });
        for (const s of records) await zite.sessions.update({ id: s.id, record: { revoked: true } });
      }
      await audit({ action: 'ویرایش کاربر و نقش‌ها', actor: admin.id, role: 'admin', from: (target.roles ?? []).join(','), to: input.roles.join(','), comment: `${username}${input.disabled ? ' (غیرفعال)' : ''}` });
      return { profileId: target.id };
    }
    if (!input.tempPassword) bad('رمز موقت الزامی است.');
    checkPasswordPolicy(input.tempPassword);
    const p = await zite.profiles.create({
      record: {
        ...record, nationalCode: input.nationalCode || null, passwordHash: await hashPassword(input.tempPassword),
        failedLogins: 0, lockedUntil: null, mustChangePassword: true,
      },
    });
    await audit({ action: 'ایجاد حساب کاربری', actor: admin.id, role: 'admin', to: input.roles.join(','), comment: username });
    return { profileId: p.id };
  },
});
