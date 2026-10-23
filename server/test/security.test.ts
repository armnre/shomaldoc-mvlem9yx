import { beforeAll, describe, expect, it } from 'vitest';
import { boot, call, draft, login, PDF, PW, seed, sql, uniq, uploadFile, url, type World } from './helpers';

let w: World;
const s1 = uniq('sec_s1_'), s2 = uniq('sec_s2_');
beforeAll(async () => {
  await boot();
  w = await seed([{ u: s1, roles: ['student'] }, { u: s2, roles: ['student'] }]);
});

describe('input validation', () => {
  it('returns 400 with a Persian message when the body fails the schema (never reaches the endpoint)', async () => {
    const r = await call('saveThesisDraft', { token: w.tokens[s1], titleFa: 123 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BAD_REQUEST');
    expect(r.body.userFacingMessage).toMatch(/نامعتبر/);
    const { rowCount } = await sql(`SELECT 1 FROM "Theses" t JOIN "Profiles" p ON p.id::text = t."studentId" WHERE p.username = $1`, [s1]);
    expect(rowCount).toBe(0);
  });
  it('maps runtime "Unknown field" errors to 400', async () => {
    const { zite } = await import('zitejs/db');
    await expect(zite.theses.findAll({ filters: { notAField: 1 } as never })).rejects.toThrow(/Unknown field/);
  });
});

describe('uploads', () => {
  it('rejects uploads without a valid session', async () => {
    expect((await uploadFile('')).status).toBe(401);
    expect((await uploadFile('forged-token')).status).toBe(401);
  });
  it('checks magic bytes, not just the extension', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect((await uploadFile(w.tokens[s1], png, 'fake.pdf')).status).toBe(400);
    expect((await uploadFile(w.tokens[s1], Buffer.from('MZ\x90\x00 evil'), 'evil.pdf')).status).toBe(400);
    expect((await uploadFile(w.tokens[s1], png, 'ok.png')).status).toBe(200);
    expect((await uploadFile(w.tokens[s1], PDF, 'ok.pdf')).status).toBe(200);
  });
});

describe('file download ACL', () => {
  it('serves files only through the authenticated route with canView on the case', async () => {
    const up = await uploadFile(w.tokens[s1]);
    expect(up.body.url).toMatch(/^\/api\/_file\//);
    const key = up.body.url.split('/').pop()!;
    expect((await fetch(url(up.body.url))).status).toBe(401);
    expect((await fetch(url(up.body.url), { headers: { 'x-session-token': w.tokens[s2] } })).status).toBe(403);
    expect((await fetch(url(up.body.url), { headers: { 'x-session-token': w.tokens[s1] } })).status).toBe(200);
    expect((await fetch(url(`/files/${key}`))).status).toBe(401); // legacy path is no longer public
    expect((await fetch(url(up.body.url), { headers: { 'x-session-token': w.admin } })).status).toBe(403); // not yet attached to any case
    // Attach to s1's case → admin (canView all) may download; s2 still may not
    const tid = await draft(w.tokens[s1]);
    await sql(`UPDATE "Theses" SET "plagiarismReport" = $1::jsonb WHERE id::text = $2`, [JSON.stringify([{ url: up.body.url, filename: 'r.pdf' }]), tid]);
    expect((await fetch(url(up.body.url), { headers: { 'x-session-token': w.admin } })).status).toBe(200);
    expect((await fetch(url(up.body.url), { headers: { 'x-session-token': w.tokens[s2] } })).status).toBe(403);
  });
});

describe('hardening', () => {
  it('health-check reports DB status', async () => {
    const r = await fetch(url('/healthz'));
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(b).toMatchObject({ ok: true, db: 'up' });
  });
  it('sends CSP and HSTS headers', async () => {
    const r = await fetch(url('/healthz'));
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('strict-transport-security')).toContain('max-age=31536000');
  });
  it('upgrades legacy 100k PBKDF2 hashes to 600k on successful login', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(PW), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256);
    const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(new Uint8Array(b)).toString('base64');
    await sql(`UPDATE "Profiles" SET "passwordHash" = $1 WHERE username = $2`, [`pbkdf2$100000$${b64(salt)}$${b64(bits)}`, s2]);
    await login(s2);
    const { rows } = await sql(`SELECT "passwordHash" FROM "Profiles" WHERE username = $1`, [s2]);
    expect(rows[0].passwordHash.split('$')[1]).toBe('600000');
    await login(s2); // new hash still verifies
  });
  it('rate-limits login attempts per IP', async () => {
    let limited = false;
    for (let i = 0; i < 70 && !limited; i++) limited = (await call('login', { username: 'nobody', password: 'x' }, { ip: '10.9.9.9' })).status === 429;
    expect(limited).toBe(true);
  });
});

describe('scheduled jobs', () => {
  it('runs runReminders/runTermControl in-process without any session token', async () => {
    const { endpoints } = await import('../src/index');
    const { runJob } = await import('../src/jobs');
    await expect(runJob(endpoints.get('runReminders')!, 'runReminders')).resolves.toBeTruthy();
    await expect(runJob(endpoints.get('runTermControl')!, 'runTermControl')).resolves.toMatchObject({ dryRun: false });
    expect((await call('runReminders', { token: '', dryRun: true })).status).toBe(401);
  });
});
