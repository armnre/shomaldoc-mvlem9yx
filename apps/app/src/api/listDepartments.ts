import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Lists university departments',
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({
    departments: z.array(z.object({ id: z.string(), name: z.string(), faculty: z.string() })),
  }),
  execute: async ({ input }) => {
    await requireAuth(input.token);
    const { records } = await zite.departments.findAll({ limit: 500 });
    return {
      departments: records
        .map((d) => ({ id: d.id, name: d.name ?? '', faculty: d.faculty ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fa')),
    };
  },
});
