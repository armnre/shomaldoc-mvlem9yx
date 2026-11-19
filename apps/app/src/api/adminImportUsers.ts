import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, hashPassword, requireAuth } from '../lib/server';

// Persian/Arabic letter normalisation so "مهندسي كامپيوتر" matches "مهندسی کامپیوتر".
const norm = (s: string) => (s ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\s+/g, ' ').trim();
const key = (s: string) => norm(s).replace(/^گروه\s*/, '').replace(/^مهندسی\s*/, '').replace(/[\s\u200c]/g, '');
const RANKS = ['مربی', 'استادیار', 'دانشیار', 'استاد'];
const DEGREES = ['کارشناسی ارشد', 'دکتری'] as const;

const Row = z.object({
  username: z.string(), fullName: z.string(), department: z.string().default(''),
  studentNumber: z.string().default(''), nationalCode: z.string().default(''), programName: z.string().default(''),
  degree: z.string().default(''), eligible: z.boolean().default(true), academicRank: z.string().default(''), capacity: z.number().default(0),
});

/**
 * Bulk import. Initial passwords:
 *  - students: national code (10 digits)
 *  - professors: their username
 * Everyone must change the password on first login. Missing departments and programs are created automatically.
 */
export default createEndpoint({
  description: 'Admin: bulk-imports students or professors from an Excel sheet; creates missing departments/programs automatically',
  inputSchema: z.object({
    token: z.string(),
    kind: z.enum(['student', 'professor']),
    resetPasswords: z.boolean().default(false),
    rows: z.array(Row).max(3000),
  }),
  outputSchema: z.object({
    created: z.number(), updated: z.number(), skipped: z.number(),
    departmentsCreated: z.array(z.string()), programsCreated: z.array(z.string()),
    errors: z.array(z.object({ row: z.number(), username: z.string(), message: z.string() })),
  }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, ['admin']);
    if (!input.rows.length) bad('فایل هیچ ردیف معتبری ندارد.');

    // ----- departments (find or create) -----
    const deps = (await zite.departments.findAll({ limit: 1000 })).records.map((d) => ({ id: d.id, name: d.name ?? '' }));
    const departmentsCreated: string[] = [];
    const depFor = async (raw: string) => {
      const name = norm(raw);
      const k = key(name);
      if (!k) return null;
      const hit = deps.find((d) => key(d.name) === k);
      if (hit) return hit.id;
      const label = name.startsWith('مهندسی') || name.startsWith('گروه') ? name.replace(/^گروه\s*/, '') : `مهندسی ${name}`;
      const d = await zite.departments.create({ record: { name: label, faculty: 'فنی و مهندسی', programs: null, profiles: null, theses: null } as never });
      deps.push({ id: d.id, name: label });
      departmentsCreated.push(label);
      return d.id;
    };

    // ----- programs (find or create), e.g. "مهندسی عمران - سازه" → name + specialization -----
    const progs = (await zite.programs.findAll({ limit: 2000 })).records.map((p) => ({
      id: p.id, name: norm(p.name ?? ''), spec: norm(p.specialization ?? ''), degree: String(p.degree ?? ''),
      dep: Array.isArray(p.department) ? String(p.department[0] ?? '') : String(p.department ?? ''),
    }));
    const programsCreated: string[] = [];
    const programFor = async (raw: string, degree: string, depId: string | null) => {
      const full = norm(raw);
      if (!full || !depId) return null;
      const [name, ...rest] = full.split(/\s*-\s*/);
      const spec = rest.join(' - ');
      const hit = progs.find((p) => key(p.name) === key(name) && key(p.spec) === key(spec) && p.degree === degree);
      if (hit) return hit.id;
      const p = await zite.programs.create({ record: { name, specialization: spec || null, degree, department: depId, isActive: true } as never });
      progs.push({ id: p.id, name, spec, degree, dep: depId });
      programsCreated.push(`${full} (${degree})`);
      return p.id;
    };

    let created = 0, updated = 0, skipped = 0;
    const errors: { row: number; username: string; message: string }[] = [];
    const seen = new Set<string>();

    for (const [i, r] of input.rows.entries()) {
      const rowNo = i + 2;
      const username = norm(r.username).toLowerCase();
      try {
        if (seen.has(username)) { skipped++; continue; }
        seen.add(username);
        if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('نام کاربری نامعتبر است.');
        const fullName = norm(r.fullName);
        if (fullName.length < 3) throw new Error('نام کامل خالی است.');
        const depId = await depFor(r.department);

        let fields: Record<string, unknown>;
        let initialPassword: string;
        if (input.kind === 'student') {
          const nc = norm(r.nationalCode).replace(/\D/g, '');
          const nationalCode = nc ? nc.padStart(10, '0') : '';
          if (nationalCode.length !== 10) throw new Error('کد ملی (رمز اولیه) معتبر نیست.');
          const degree = DEGREES.find((d) => norm(r.degree).includes(d)) ?? 'کارشناسی ارشد';
          const programId = await programFor(r.programName, degree, depId);
          fields = {
            studentNumber: norm(r.studentNumber) || username, nationalCode, programName: norm(r.programName) || null, degree,
            eligibleForThesis: r.eligible, ...(programId ? { program: programId } : {}),
          };
          initialPassword = nationalCode;
        } else {
          const rank = RANKS.find((x) => norm(r.academicRank) === x) ?? (norm(r.academicRank) || null);
          fields = { academicRank: rank, baseCapacity: Math.max(0, Math.min(50, Math.round(r.capacity) || 0)) };
          initialPassword = username;
        }

        const existing = await zite.profiles.findOne({ filters: { username } });
        if (existing) {
          const roles = Array.from(new Set([...(existing.roles ?? []), input.kind]));
          await zite.profiles.update({
            id: existing.id,
            record: {
              fullName, roles, ...(depId ? { department: depId } : {}), ...fields,
              ...(input.resetPasswords ? { passwordHash: await hashPassword(initialPassword), mustChangePassword: true, failedLogins: 0, lockedUntil: null } : {}),
            } as never,
          });
          updated++;
        } else {
          await zite.profiles.create({
            record: {
              username, fullName, roles: [input.kind], department: depId, disabled: false,
              studentNumber: null, nationalCode: null, degree: null, programName: null, academicRank: null, baseCapacity: 0, eligibleForThesis: false,
              ...fields, passwordHash: await hashPassword(initialPassword), failedLogins: 0, lockedUntil: null, mustChangePassword: true,
            } as never,
          });
          created++;
        }
      } catch (e) {
        errors.push({ row: rowNo, username, message: e instanceof Error ? e.message : String(e) });
      }
    }
    await audit({
      action: 'ورود گروهی کاربران از اکسل', actor: admin.id, role: 'admin', to: input.kind,
      comment: `${created} جدید، ${updated} به‌روزرسانی، ${departmentsCreated.length} گروه و ${programsCreated.length} رشتهٔ جدید`,
    });
    return { created, updated, skipped, departmentsCreated, programsCreated, errors };
  },
});
