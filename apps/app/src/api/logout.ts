import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, authenticate } from '../lib/server';

export default createEndpoint({
  description: 'Ends the current session',
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const { profile, sessionId } = await authenticate(input.token);
    await zite.sessions.update({ id: sessionId, record: { revoked: true } });
    await audit({ action: 'خروج از سامانه', actor: profile.id, role: 'security' });
    return { ok: true };
  },
});
