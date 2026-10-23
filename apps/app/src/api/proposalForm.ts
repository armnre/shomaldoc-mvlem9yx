import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, loadProposalForm, requireAuth } from '../lib/server';

const TYPES = ['text', 'textarea', 'number', 'select', 'date'] as const;
const field = z.object({
  id: z.string(), label: z.string(), key: z.string(), type: z.string(), required: z.boolean(), order: z.number(),
  options: z.array(z.string()), minLength: z.number().nullable(), maxLength: z.number().nullable(), helpText: z.string(),
});

export default createEndpoint({
  description: 'Returns the active dynamic proposal form; admins can save its field definitions',
  inputSchema: z.object({
    token: z.string(),
    save: z.object({
      name: z.string(),
      fields: z.array(z.object({
        label: z.string(), key: z.string(), type: z.enum(TYPES), required: z.boolean(), options: z.array(z.string()),
        minLength: z.number().int().min(0).nullable(), maxLength: z.number().int().min(1).nullable(), helpText: z.string(),
      })),
    }).optional(),
  }),
  outputSchema: z.object({ formId: z.string().nullable(), name: z.string(), fields: z.array(field) }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, input.save ? ['admin'] : undefined);
    if (input.save) {
      const fs = input.save.fields;
      const keys = fs.map((f) => f.key.trim());
      if (keys.some((k) => !/^[a-z][a-z0-9_]{1,40}$/.test(k))) bad('کلید هر فیلد باید با حرف لاتین کوچک شروع شود (a-z, 0-9, _).');
      if (new Set(keys).size !== keys.length) bad('کلید فیلدها نباید تکراری باشد.');
      if (fs.some((f) => f.label.trim().length < 2)) bad('عنوان همهٔ فیلدها الزامی است.');
      if (fs.some((f) => f.type === 'select' && f.options.filter(Boolean).length < 2)) bad('فیلد انتخابی دست‌کم دو گزینه لازم دارد.');
      if (fs.some((f) => f.minLength != null && f.maxLength != null && f.minLength > f.maxLength)) bad('حداقل طول نباید از حداکثر بیشتر باشد.');
      let form = await zite.dynamicForms.findOne({ filters: { kind: 'proposal', isActive: true } });
      if (!form) form = await zite.dynamicForms.create({ record: { name: input.save.name || 'فرم پروپوزال', kind: 'proposal', isActive: true } });
      else await zite.dynamicForms.update({ id: form.id, record: { name: input.save.name || form.name } });
      const { records: old } = await zite.formFields.findAll({ filters: { form: form.id }, limit: 200 });
      for (const o of old) await zite.formFields.delete({ id: o.id });
      if (fs.length) await zite.formFields.bulkCreate({
        records: fs.map((f, i) => ({
          label: f.label.trim(), form: form!.id, fieldKey: f.key.trim(), fieldType: f.type, required: f.required, sortOrder: i + 1,
          options: f.options.filter(Boolean).join('\n') || null, minLength: f.minLength, maxLength: f.maxLength, helpText: f.helpText || null,
        })),
      });
      await audit({ action: 'ویرایش فرم دینامیک پروپوزال', actor: p.id, role: 'admin', comment: `${fs.length} فیلد: ${keys.join(', ')}` });
    }
    return loadProposalForm();
  },
});
