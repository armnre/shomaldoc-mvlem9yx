import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { capacityFor, first, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Lists professors of a department with live capacity',
  inputSchema: z.object({ token: z.string(), departmentId: z.string().optional() }),
  outputSchema: z.object({
    professors: z.array(z.object({
      id: z.string(), name: z.string(), rank: z.string(), capacity: z.number(), used: z.number(), pending: z.number(), remaining: z.number(),
    })),
  }),
  execute: async ({ input }) => {
    const me = await requireAuth(input.token);
    const dep = input.departmentId ?? first(me.department);
    if (!dep) return { professors: [] };
    const { records: all } = await zite.profiles.findAll({ filters: { department: dep }, limit: 2000 });
    const records = all.filter((r) => r.roles?.includes('professor') && !r.disabled && r.fullName);
    const cap = await capacityFor(records.map((r) => r.id));
    return {
      professors: records.map((r) => {
        const capacity = r.baseCapacity ?? 0;
        const c = cap[r.id];
        return { id: r.id, name: r.fullName ?? '', rank: r.academicRank ?? '', capacity, used: c.used, pending: c.pending, remaining: capacity - c.used - c.pending };
      }),
    };
  },
});
