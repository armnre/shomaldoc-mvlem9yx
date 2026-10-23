// Real delivery: SMTP via nodemailer (against a local SMTP sink) and the Kavenegar SMS provider (HTTP stubbed).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'node:net';
import { boot, seed, sql, uniq, type World } from './helpers';

const received: string[] = [];
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'],
  onData(stream, _s, cb) { let d = ''; stream.on('data', (c) => (d += c)); stream.on('end', () => { received.push(d); cb(); }); },
});
let w: World;
const u = uniq('mail_');

beforeAll(async () => {
  await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', () => r()));
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String((smtp.server.address() as AddressInfo).port);
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_FROM = 'ShomalDoc <noreply@shomal.ac.ir>';
  process.env.SMS_PROVIDER = 'kavenegar';
  process.env.KAVENEGAR_API_KEY = 'test-key';
  await boot();
  w = await seed([{ u, roles: ['student'] }]);
  await sql(`UPDATE "Profiles" SET email = 'stu@example.ac.ir', phone = '09120000000', "notifyEmail" = true, "notifySms" = true WHERE username = $1`, [u]);
});
afterAll(() => smtp.close());

const kavenegar = (status: number, message: string) => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('api.kavenegar.com') ? new Response(JSON.stringify({ return: { status, message } }), { status: 200 }) : realFetch(input, init)));
};

describe('delivery providers', () => {
  it('sends real email over SMTP + SMS via Kavenegar and records "sent"', async () => {
    const { notifyT } = await import('../../apps/app/src/lib/server');
    kavenegar(200, 'تایید شد');
    await notifyT([w.ids[u]], 'status_change', { code: 'T-1', title: 'آزمون', status: 'بررسی گروه', comment: '' });
    vi.unstubAllGlobals();
    expect(received.some((m) => m.includes('stu@example.ac.ir'))).toBe(true);
    const { rows } = await sql(`SELECT channel, "deliveryStatus" FROM "NotificationLogs" WHERE "profileId" = $1`, [w.ids[u]]);
    expect(rows.find((x) => x.channel === 'email')?.deliveryStatus).toBe('sent');
    expect(rows.find((x) => x.channel === 'sms')?.deliveryStatus).toBe('sent');
  });

  it('records "failed" with the provider error when delivery is rejected', async () => {
    const { CHANNELS } = await import('../../apps/app/src/lib/server');
    kavenegar(418, 'invalid sender');
    const r = await CHANNELS.sms.send({ profile: { id: w.ids[u], phone: '09120000000' } as never, title: 't', body: 'b' });
    vi.unstubAllGlobals();
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/418/);
  });
});
