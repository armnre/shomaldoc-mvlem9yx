import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { first, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Aggregated thesis reports: stage funnel, supervisor load, defenses, extensions, similarity and durations',
  inputSchema: z.object({ token: z.string(), scope: z.enum(['group_manager', 'graduate_office', 'admin']) }),
  outputSchema: z.object({
    supervisors: z.array(z.object({ name: z.string(), active: z.number(), defended: z.number(), capacity: z.number() })),
    grades: z.array(z.object({ grade: z.string(), count: z.number() })),
    monthly: z.array(z.object({ month: z.string(), defended: z.number() })),
    kpis: z.object({
      total: z.number(), active: z.number(), defended: z.number(), avgScore: z.number(), avgSimilarity: z.number(),
      avgDaysToDefense: z.number(), extensions: z.number(), extensionsApproved: z.number(), overdue: z.number(),
    }),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, [input.scope]);
    const dep = input.scope === 'group_manager' ? first(p.department) : undefined;
    const params = dep ? [dep] : [];
    const tf = `FROM "Theses" t LEFT JOIN "DepartmentsTheses" dt ON dt."thesesId" = t.id ${dep ? 'WHERE dt."departmentsId" = $1' : ''}`;
    const and = dep ? 'AND' : 'WHERE';
    const [k, sup, gr, mo, ex] = await Promise.all([
      zite.sql({
        query: `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE t."status" NOT IN ('DEFENDED','REJECTED','CANCELLED'))::int AS active,
          COUNT(*) FILTER (WHERE t."status" = 'DEFENDED')::int AS defended,
          COALESCE(AVG(t."defenseScore") FILTER (WHERE t."status" = 'DEFENDED'), 0)::float AS avgscore,
          COALESCE(AVG(t."similarityPercent"), 0)::float AS avgsim,
          COALESCE(AVG(EXTRACT(EPOCH FROM (t."defendedAt" - t."thesisApprovedAt")) / 86400) FILTER (WHERE t."defendedAt" IS NOT NULL), 0)::float AS days,
          COUNT(*) FILTER (WHERE t."status" IN ('EXTENSION_REQUIRED','SPECIAL_COMMISSION'))::int AS overdue ${tf}`,
        params,
      }),
      zite.sql({
        query: `SELECT pr."fullName" AS name, COALESCE(pr."baseCapacity",0)::int AS cap,
          COUNT(*) FILTER (WHERE t."status" NOT IN ('DEFENDED','REJECTED','CANCELLED'))::int AS active,
          COUNT(*) FILTER (WHERE t."status" = 'DEFENDED')::int AS defended
          FROM "Theses" t JOIN "Profiles" pr ON pr.id::text = t."supervisorId"
          LEFT JOIN "DepartmentsTheses" dt ON dt."thesesId" = t.id ${dep ? 'WHERE dt."departmentsId" = $1' : ''}
          GROUP BY pr.id, pr."fullName", pr."baseCapacity" ORDER BY active DESC LIMIT 30`,
        params,
      }),
      zite.sql({ query: `SELECT t."defenseGrade" AS g, COUNT(*)::int AS c ${tf} ${and} t."status" = 'DEFENDED' GROUP BY 1 ORDER BY 2 DESC`, params }),
      zite.sql({
        query: `SELECT to_char(date_trunc('month', t."defendedAt"), 'YYYY-MM') AS m, COUNT(*)::int AS c ${tf} ${and} t."defendedAt" IS NOT NULL
          AND t."defendedAt" > now() - interval '12 months' GROUP BY 1 ORDER BY 1`,
        params,
      }),
      zite.sql({
        query: `SELECT COUNT(*)::int AS c, COUNT(*) FILTER (WHERE e."extensionStatus" = 'approved')::int AS ok
          FROM "Extensions" e JOIN "ExtensionsTheses" el ON el."extensionsId" = e.id JOIN "Theses" t ON t.id = el."thesesId"
          LEFT JOIN "DepartmentsTheses" dt ON dt."thesesId" = t.id ${dep ? 'WHERE dt."departmentsId" = $1' : ''}`,
        params,
      }),
    ]);
    const r = k.rows[0] ?? {};
    const n = (v: unknown) => Math.round(Number(v ?? 0) * 10) / 10;
    return {
      supervisors: sup.rows.map((x) => ({ name: String(x.name ?? '—'), active: n(x.active), defended: n(x.defended), capacity: n(x.cap) })),
      grades: gr.rows.map((x) => ({ grade: String(x.g ?? '—'), count: n(x.c) })),
      monthly: mo.rows.map((x) => ({ month: String(x.m), defended: n(x.c) })),
      kpis: {
        total: n(r.total), active: n(r.active), defended: n(r.defended), avgScore: n(r.avgscore), avgSimilarity: n(r.avgsim),
        avgDaysToDefense: Math.round(Number(r.days ?? 0)), extensions: n(ex.rows[0]?.c), extensionsApproved: n(ex.rows[0]?.ok), overdue: n(r.overdue),
      },
    };
  },
});
