import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, first, requireAuth } from '../lib/server';

const DEGREES = ['کارشناسی ارشد', 'دکتری'] as const;

export default createEndpoint({
  description: 'Lists the academic structure (faculties, departments, programs); admins can create, edit or delete entries',
  inputSchema: z.object({
    token: z.string(),
    op: z.enum(['list', 'saveFaculty', 'deleteFaculty', 'saveProgram', 'deleteProgram', 'linkDepartment']),
    id: z.string().optional(),
    name: z.string().optional(),
    code: z.string().optional(),
    specialization: z.string().optional(),
    degree: z.enum(DEGREES).optional(),
    departmentId: z.string().optional(),
    facultyId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  }),
  outputSchema: z.object({
    faculties: z.array(z.object({ id: z.string(), name: z.string(), code: z.string() })),
    departments: z.array(z.object({ id: z.string(), name: z.string(), facultyId: z.string() })),
    programs: z.array(z.object({ id: z.string(), name: z.string(), specialization: z.string(), degree: z.string(), departmentId: z.string(), isActive: z.boolean() })),
  }),
  execute: async ({ input }) => {
    const admin = await requireAuth(input.token, input.op === 'list' ? undefined : ['admin']);
    const name = input.name?.trim() ?? '';
    const log = (action: string, comment: string) => audit({ action, actor: admin.id, role: 'admin', comment });
    switch (input.op) {
      case 'saveFaculty':
        if (name.length < 2) bad('نام دانشکده الزامی است.');
        if (input.id) await zite.faculties.update({ id: input.id, record: { name, code: input.code?.trim() || null } });
        else await zite.faculties.create({ record: { name, code: input.code?.trim() || null } });
        await log(input.id ? 'ویرایش دانشکده' : 'ایجاد دانشکده', name);
        break;
      case 'deleteFaculty': {
        if (!input.id) bad('شناسه لازم است.');
        const f = await zite.faculties.findOne({ id: input.id });
        if (f?.departments && [f.departments].flat().length) bad('این دانشکده گروه آموزشی دارد و قابل حذف نیست.');
        await zite.faculties.delete({ id: input.id });
        await log('حذف دانشکده', f?.name ?? '');
        break;
      }
      case 'linkDepartment':
        if (!input.departmentId) bad('گروه را انتخاب کنید.');
        await zite.departments.update({ id: input.departmentId, record: { facultyRef: input.facultyId ?? null } });
        await log('اتصال گروه به دانشکده', `${input.departmentId} → ${input.facultyId ?? '—'}`);
        break;
      case 'saveProgram': {
        if (name.length < 2) bad('نام رشته الزامی است.');
        if (!input.degree) bad('مقطع را انتخاب کنید.');
        if (!input.departmentId) bad('گروه آموزشی رشته را انتخاب کنید.');
        const record = { name, specialization: input.specialization?.trim() || null, degree: input.degree, department: input.departmentId, isActive: input.isActive ?? true };
        if (input.id) await zite.programs.update({ id: input.id, record });
        else await zite.programs.create({ record });
        await log(input.id ? 'ویرایش رشته/گرایش' : 'ایجاد رشته/گرایش', `${name} ${record.specialization ?? ''} (${input.degree})`);
        break;
      }
      case 'deleteProgram': {
        if (!input.id) bad('شناسه لازم است.');
        const pr = await zite.programs.findOne({ id: input.id });
        if ((pr?.profiles && [pr.profiles].flat().length) || (pr?.theses && [pr.theses].flat().length)) bad('این رشته به کاربر یا پرونده متصل است؛ به‌جای حذف، غیرفعالش کنید.');
        await zite.programs.delete({ id: input.id });
        await log('حذف رشته/گرایش', pr?.name ?? '');
        break;
      }
    }
    const [{ records: fs }, { records: ds }, { records: ps }] = await Promise.all([
      zite.faculties.findAll({ limit: 500 }), zite.departments.findAll({ limit: 500 }), zite.programs.findAll({ limit: 2000 }),
    ]);
    const fa = (a: string, b: string) => a.localeCompare(b, 'fa');
    return {
      faculties: fs.map((f) => ({ id: f.id, name: f.name ?? '', code: f.code ?? '' })).sort((a, b) => fa(a.name, b.name)),
      departments: ds.map((d) => ({ id: d.id, name: d.name ?? '', facultyId: first(d.facultyRef) ?? '' })).sort((a, b) => fa(a.name, b.name)),
      programs: ps.map((p) => ({ id: p.id, name: p.name ?? '', specialization: p.specialization ?? '', degree: p.degree ?? '', departmentId: first(p.department) ?? '', isActive: p.isActive !== false }))
        .sort((a, b) => fa(a.name + a.specialization, b.name + b.specialization)),
    };
  },
});
