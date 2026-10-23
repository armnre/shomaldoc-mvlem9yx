import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { audit, bad, requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Reads or updates the signed-in user\'s contact details and notification channel preferences',
  inputSchema: z.object({
    token: z.string(),
    save: z.object({ email: z.string(), phone: z.string(), notifyEmail: z.boolean(), notifySms: z.boolean() }).optional(),
  }),
  outputSchema: z.object({ email: z.string(), phone: z.string(), notifyEmail: z.boolean(), notifySms: z.boolean() }),
  execute: async ({ input }) => {
    let p = await requireAuth(input.token);
    if (input.save) {
      const email = input.save.email.trim().toLowerCase();
      const phone = input.save.phone.replace(/[\s-]/g, '');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('ایمیل نامعتبر است.');
      if (phone && !/^09\d{9}$/.test(phone)) bad('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
      if (input.save.notifyEmail && !email) bad('برای دریافت ایمیل، نشانی ایمیل را وارد کنید.');
      if (input.save.notifySms && !phone) bad('برای دریافت پیامک، شماره موبایل را وارد کنید.');
      p = await zite.profiles.update({ id: p.id, record: { email: email || null, phone: phone || null, notifyEmail: input.save.notifyEmail, notifySms: input.save.notifySms } });
      await audit({ action: 'به‌روزرسانی ترجیحات اعلان', actor: p.id, role: 'self', comment: `ایمیل:${input.save.notifyEmail ? 'بله' : 'خیر'} پیامک:${input.save.notifySms ? 'بله' : 'خیر'}` });
    }
    return { email: p.email ?? '', phone: p.phone ?? '', notifyEmail: p.notifyEmail !== false, notifySms: !!p.notifySms };
  },
});
