import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { first, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Lists professors and reviewers who can be assigned to review a thesis',
  inputSchema: z.object({ token: z.string(), thesisId: z.string() }),
  outputSchema: z.object({ people: z.array(z.object({ id: z.string(), name: z.string(), department: z.string(), isReviewer: z.boolean(), sameDepartment: z.boolean() })) }),
  execute: async ({ input }) => {
    await requireAuth(input.token, ['group_manager', 'graduate_office', 'admin']);
    const t = await zite.theses.findOne({ id: input.thesisId });
    const exclude = [t?.supervisorId, t?.advisorId, t?.studentId].filter(Boolean);
    const dep = first(t?.department);
    const [{ records }, { records: deps }] = await Promise.all([
      zite.profiles.findAll({ limit: 2000 }),
      zite.departments.findAll({ limit: 500 }),
    ]);
    const depName = Object.fromEntries(deps.map((d) => [d.id, d.name ?? '']));
    const people = records
      .filter((r) => !r.disabled && (r.roles?.includes('reviewer') || r.roles?.includes('professor')) && !exclude.includes(r.id))
      .map((r) => ({
        id: r.id, name: r.fullName ?? r.username ?? '', department: depName[first(r.department) ?? ''] ?? '',
        isReviewer: !!r.roles?.includes('reviewer'), sameDepartment: !!dep && first(r.department) === dep,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return { people };
  },
});
