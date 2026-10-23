import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Admin: creates or renames a department',
  inputSchema: z.object({ token: z.string(), id: z.string().optional(), name: z.string(), faculty: z.string() }),
  outputSchema: z.object({ id: z.string() }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, ['admin']);
    const name = input.name.trim();
    if (name.length < 2) bad('نام گروه الزامی است.');
    const record = { name, faculty: input.faculty.trim() || null };
    if (input.id) {
      await zite.departments.update({ id: input.id, record });
      await audit({ action: 'ویرایش گروه آموزشی', actor: admin.id, role: 'admin', comment: name });
      return { id: input.id };
    }
    const d = await zite.departments.create({ record: { ...record, programs: null, profiles: null, theses: null } });
    await audit({ action: 'ایجاد گروه آموزشی', actor: admin.id, role: 'admin', comment: name });
    return { id: d.id };
  },
});
