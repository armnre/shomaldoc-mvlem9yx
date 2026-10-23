import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

export default createEndpoint({
  description: 'Tells the login page whether the system still needs its first admin account',
  inputSchema: z.object({}),
  outputSchema: z.object({ needsSetup: z.boolean() }),
  execute: async () => {
    const { rows } = await zite.sql({ query: `SELECT COUNT(*)::int AS c FROM "Profiles" WHERE "roles" ? 'admin'` });
    return { needsSetup: Number(rows[0]?.c ?? 0) === 0 };
  },
});
