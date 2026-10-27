import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { MASTERS_DEGREE, requireAuth } from '../lib/server';

const spec = z.object({ programId: z.string(), name: z.string().nullable() });
export default createEndpoint({
  description: "Lists active Master's programs grouped as faculty → major → specialization",
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({
    faculties: z.array(z.object({ name: z.string(), majors: z.array(z.object({ name: z.string(), specializations: z.array(spec) })) })),
  }),
  execute: async ({ input }) => {
    await requireAuth(input.token);
    const { records } = await zite.programs.findAll({ filters: { degree: MASTERS_DEGREE }, limit: 2000 });
    const tree = new Map<string, Map<string, z.infer<typeof spec>[]>>();
    for (const r of records) {
      if (r.isActive === false || r.degree !== MASTERS_DEGREE || !r.faculty || !r.name) continue;
      const f = tree.get(r.faculty) ?? new Map();
      tree.set(r.faculty, f);
      const m = f.get(r.name) ?? [];
      f.set(r.name, m);
      m.push({ programId: r.id, name: r.specialization || null });
    }
    const cmp = (a: string, b: string) => a.localeCompare(b, 'fa');
    return {
      faculties: [...tree].sort(([a], [b]) => cmp(a, b)).map(([name, majors]) => ({
        name,
        majors: [...majors].sort(([a], [b]) => cmp(a, b)).map(([n, specs]) => ({ name: n, specializations: specs.sort((a, b) => cmp(a.name ?? '', b.name ?? '')) })),
      })),
    };
  },
});
