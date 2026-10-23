import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { first, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Thesis counts by status and department for the dashboard, scoped to the caller role',
  inputSchema: z.object({ token: z.string(), scope: z.enum(['group_manager', 'graduate_office', 'admin']) }),
  outputSchema: z.object({
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
    byDepartment: z.array(z.object({ name: z.string(), count: z.number() })),
    total: z.number(),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, [input.scope]);
    const dep = input.scope === 'group_manager' ? first(p.department) : undefined;
    if (input.scope === 'group_manager' && !dep) return { byStatus: [], byDepartment: [], total: 0 };
    const filter = dep ? `WHERE dt."departmentsId" = $1` : '';
    const params = dep ? [dep] : [];
    const from = `FROM "Theses" t LEFT JOIN "DepartmentsTheses" dt ON dt."thesesId" = t.id LEFT JOIN "Departments" d ON d.id = dt."departmentsId" ${filter}`;
    const [{ rows: s }, { rows: d }] = await Promise.all([
      zite.sql({ query: `SELECT t."status" AS status, COUNT(*)::int AS c ${from} GROUP BY t."status"`, params }),
      zite.sql({ query: `SELECT COALESCE(d."name", '—') AS name, COUNT(*)::int AS c ${from} GROUP BY 1 ORDER BY 2 DESC`, params }),
    ]);
    const byStatus = s.map((r) => ({ status: String(r.status ?? ''), count: Number(r.c) }));
    return {
      byStatus,
      byDepartment: d.map((r) => ({ name: String(r.name), count: Number(r.c) })),
      total: byStatus.reduce((a, b) => a + b.count, 0),
    };
  },
});
