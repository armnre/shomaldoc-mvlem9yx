import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, checkPasswordPolicy, hashPassword, requireAuth } from '../lib/server';

// Persian/Arabic letter normalisation so "مهندسي كامپيوتر" matches "مهندسی کامپیوتر".
const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ').trim();
const key = (s: string) => norm(s).replace(/^(گروه\s*)?(مهندسی\s*)?/, '').replace(/\s/g, '');
const RANKS = ['مربی', 'استادیار', 'دانشیار', 'استاد'];

const Row = z.object({
  username: z.string(), fullName: z.string(), department: z.string().default(''),
  studentNumber: z.string().default(''), nationalCode: z.string().default(''), programName: z.string().default(''),
  degree: z.string().default(''), eligible: z.boolean().default(true), academicRank: z.string().default(''), capacity: z.number().default(0),
});

export default createEndpoint({
  description: 'Admin: bulk-imports students or professors from an Excel sheet (creates new accounts, updates existing ones)',
  inputSchema: z.object({
    token: z.string(),
    kind: z.enum(['student', 'professor']),
    tempPassword: z.string(),
    rows: z.array(Row).max(2000),
  }),
  outputSchema: z.object({
    created: z.number(), updated: z.number(),
    errors: z.array(z.object({ row: z.number(), username: z.string(), message: z.string() })),
  }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, ['admin']);
    checkPasswordPolicy(input.tempPassword);
    if (!input.rows.length) bad('فایل هیچ ردیف معتبری ندارد.');
    const { records: deps } = await zite.departments.findAll({ limit: 500 });
    const findDep = (name: string) => {
      const k = key(name);
      if (!k) return null;
      return deps.find((d) => key(d.name ?? '') === k) ?? deps.find((d) => { const dk = key(d.name ?? ''); return dk && (dk.includes(k) || k.includes(dk)); }) ?? null;
    };
    const hash = await hashPassword(input.tempPassword);
    let created = 0, updated = 0;
    const errors: { row: number; username: string; message: string }[] = [];
    const seen = new Set<string>();

    for (const [i, r] of input.rows.entries()) {
      const rowNo = i + 2;
      const username = norm(r.username).toLowerCase();
      try {
        if (seen.has(username)) continue; // duplicate row in the same file
        seen.add(username);
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('نام کاربری نامعتبر است.');
        const fullName = norm(r.fullName);
        if (fullName.length < 3) throw new Error('نام کامل خالی است.');
        const nc = r.nationalCode.replace(/\D/g, '');
        const nationalCode = nc ? nc.padStart(10, '0') : '';
        if (nationalCode && nationalCode.length !== 10) throw new Error('کد ملی باید ۱۰ رقم باشد.');
        const dep = findDep(r.department);
        const rank = RANKS.find((x) => norm(r.academicRank) === x) ?? (norm(r.academicRank) || null);
        const fields = input.kind === 'student'
          ? { studentNumber: norm(r.studentNumber) || username, programName: norm(r.programName) || null, degree: norm(r.degree) || 'کارشناسی ارشد', eligibleForThesis: r.eligible, ...(nationalCode ? { nationalCode } : {}) }
          : { academicRank: rank, baseCapacity: Math.max(0, Math.min(50, Math.round(r.capacity) || 0)) };

        const existing = await zite.profiles.findOne({ filters: { username } });
        if (existing) {
          const roles = Array.from(new Set([...(existing.roles ?? []), input.kind]));
          await zite.profiles.update({ id: existing.id, record: { fullName, roles, ...(dep ? { department: dep.id } : {}), ...fields } as never });
          updated++;
        } else {
          await zite.profiles.create({
            record: {
              username, fullName, roles: [input.kind], department: dep?.id ?? null, disabled: false,
              studentNumber: null, nationalCode: null, degree: null, programName: null, academicRank: null, baseCapacity: 0, eligibleForThesis: false,
              ...fields, passwordHash: hash, failedLogins: 0, lockedUntil: null, mustChangePassword: true,
            } as never,
          });
          created++;
        }
        if (r.department && !dep) errors.push({ row: rowNo, username, message: `ثبت شد، ولی گروه «${r.department}» در سامانه پیدا نشد؛ گروه را دستی تعیین کنید.` });
      } catch (e) {
        errors.push({ row: rowNo, username, message: e instanceof Error ? e.message : String(e) });
      }
    }
    await audit({ action: 'ورود گروهی کاربران از اکسل', actor: admin.id, role: 'admin', to: input.kind, comment: `${created} جدید، ${updated} به‌روزرسانی` });
    return { created, updated, errors };
  },
});
