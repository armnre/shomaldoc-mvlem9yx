import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Admin: lists all user accounts with roles and academic profile',
  inputSchema: z.object({ token: z.string(), search: z.string().optional() }),
  outputSchema: z.object({
    users: z.array(z.object({
      profileId: z.string(), username: z.string(), fullName: z.string(), roles: z.array(z.string()),
      departmentId: z.string(), studentNumber: z.string(), nationalCodeMasked: z.string(), degree: z.string(),
      programName: z.string(), academicRank: z.string(), baseCapacity: z.number(), eligibleForThesis: z.boolean(),
      disabled: z.boolean(), locked: z.boolean(), mustChangePassword: z.boolean(),
    })),
  }),
  execute: async ({ input }) => {
    await requireAuth(input.token, ['admin']);
    const { rows } = await zite.sql({
      query: `SELECT p.id, p."username", p."fullName", p."roles", dp."departmentsId" AS dep, p."studentNumber", p."nationalCode",
        p."degree", p."programName", p."academicRank", p."baseCapacity", p."eligibleForThesis", p."disabled", p."mustChangePassword",
        (p."lockedUntil" > now()) AS locked
        FROM "Profiles" p LEFT JOIN "DepartmentsProfiles" dp ON dp."profilesId" = p.id
        WHERE ($1 = '' OR p."fullName" ILIKE '%' || $1 || '%' OR p."username" ILIKE '%' || $1 || '%' OR p."studentNumber" ILIKE '%' || $1 || '%')
        ORDER BY p.created_at DESC LIMIT 1000`,
      params: [input.search?.trim() ?? ''],
    });
    const s = (v: unknown) => (v == null ? '' : String(v));
    const mask = (c: string) => (c.length >= 4 ? `${'*'.repeat(c.length - 4)}${c.slice(-4)}` : c);
    return {
      users: rows.map((r) => ({
        profileId: s(r.id), username: s(r.username), fullName: s(r.fullName), roles: Array.isArray(r.roles) ? (r.roles as string[]) : [],
        departmentId: s(r.dep), studentNumber: s(r.studentNumber), nationalCodeMasked: mask(s(r.nationalCode)), degree: s(r.degree),
        programName: s(r.programName), academicRank: s(r.academicRank), baseCapacity: Number(r.baseCapacity ?? 0),
        eligibleForThesis: !!r.eligibleForThesis, disabled: !!r.disabled, locked: !!r.locked, mustChangePassword: !!r.mustChangePassword,
      })),
    };
  },
});
