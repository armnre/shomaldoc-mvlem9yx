// Real delivery providers for the self-hosted server. Installed into lib/server.ts CHANNELS at boot.
// When a provider isn't configured the original log provider stays in place (status "logged").
import nodemailer from 'nodemailer';
import { CHANNELS, type NotifyChannel } from '../../apps/app/src/lib/server';

type Msg = Parameters<NotifyChannel['send']>[0];

/** Swappable SMS gateway interface. */
export interface SmsProvider { name: string; send(to: string, text: string): Promise<void> }

export class KavenegarProvider implements SmsProvider {
  name = 'kavenegar';
  constructor(private apiKey: string, private sender?: string) {}
  async send(to: string, text: string) {
    const qs = new URLSearchParams({ receptor: to, message: text, ...(this.sender ? { sender: this.sender } : {}) });
    const res = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(this.apiKey)}/sms/send.json`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: qs, signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
    if (!res.ok || body?.return?.status !== 200) throw new Error(`Kavenegar ${body?.return?.status ?? res.status}: ${body?.return?.message ?? res.statusText}`);
  }
}

export function smsProviderFromEnv(): SmsProvider | null {
  if (process.env.SMS_PROVIDER === 'kavenegar' && process.env.KAVENEGAR_API_KEY) return new KavenegarProvider(process.env.KAVENEGAR_API_KEY, process.env.KAVENEGAR_SENDER);
  return null;
}

const asText = (m: Msg) => `${m.title}\n\n${m.body}${process.env.PUBLIC_URL ? `\n\n${process.env.PUBLIC_URL}` : ''}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function installDeliveryProviders() {
  const status: string[] = [];
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const email: NotifyChannel = {
      name: 'email',
      async send(m) {
        if (!m.profile.email) return { status: 'skipped', error: 'ایمیل کاربر ثبت نشده است' };
        try {
          await transport.sendMail({
            from: process.env.SMTP_FROM, to: m.profile.email, subject: m.title, text: asText(m),
            html: `<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9"><h3>${esc(m.title)}</h3><p>${esc(m.body).replace(/\n/g, '<br>')}</p>${process.env.PUBLIC_URL ? `<p><a href="${esc(process.env.PUBLIC_URL)}">ورود به شمال‌داک</a></p>` : ''}</div>`,
          });
          return { status: 'sent', recipient: m.profile.email };
        } catch (e) {
          return { status: 'failed', recipient: m.profile.email, error: String((e as Error).message ?? e).slice(0, 500) };
        }
      },
    };
    CHANNELS.email = email;
    status.push(`email=smtp(${process.env.SMTP_HOST})`);
  } else status.push('email=log (SMTP_HOST not set)');

  const sms = smsProviderFromEnv();
  if (sms) {
    CHANNELS.sms = {
      name: 'sms',
      async send(m) {
        if (!m.profile.phone) return { status: 'skipped', error: 'شماره موبایل ثبت نشده است' };
        try { await sms.send(m.profile.phone, asText(m)); return { status: 'sent', recipient: m.profile.phone }; }
        catch (e) { return { status: 'failed', recipient: m.profile.phone, error: String((e as Error).message ?? e).slice(0, 500) }; }
      },
    };
    status.push(`sms=${sms.name}`);
  } else status.push('sms=log (KAVENEGAR_API_KEY not set)');
  console.log('[notify]', status.join(', '));
}
