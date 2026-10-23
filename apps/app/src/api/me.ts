import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { authenticate, first, intSetting } from '../lib/server';

export default createEndpoint({
  description: 'Returns the signed-in user profile and roles',
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({
    id: z.string(),
    fullName: z.string(),
    username: z.string(),
    roles: z.array(z.string()),
    departmentId: z.string().nullable(),
    departmentName: z.string().nullable(),
    studentNumber: z.string().nullable(),
    eligibleForThesis: z.boolean(),
    commissionTermThreshold: z.number(),
    mustChangePassword: z.boolean(),
  }),
  execute: async ({ input }) => {
    const { profile: p } = await authenticate(input.token);
    const depId = first(p.department) ?? null;
    const dep = depId ? await zite.departments.findOne({ id: depId }) : undefined;
    const commissionTermThreshold = await intSetting('commissionTermThreshold');
    return {
      commissionTermThreshold,
      id: p.id, fullName: p.fullName ?? '', username: p.username ?? '', roles: p.roles ?? [],
      departmentId: depId, departmentName: dep?.name ?? null, studentNumber: p.studentNumber ?? null,
      eligibleForThesis: !!p.eligibleForThesis, mustChangePassword: !!p.mustChangePassword,
    };
  },
});
