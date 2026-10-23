// Test harness: boots the real Express app against a throwaway PostgreSQL database.
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const PW = 'Shomal1405x';
let base = '';
let pool: pg.Pool;

export async function boot() {
  if (base) return;
  const url = new URL(process.env.DATABASE_URL!);
  const admin = new pg.Client({ connectionString: url.toString().replace(url.pathname, '/postgres') });
  await admin.connect();
  const db = url.pathname.slice(1);
  await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${db}"`);
  await admin.end();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const { app } = await import('../src/index');
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}
/** Points the helpers at an already-running server + database (used by Playwright). */
export function useRemote(baseUrl: string, dbUrl: string) {
  base = baseUrl;
  pool = new pg.Pool({ connectionString: dbUrl });
}
export const sql = (q: string, p: unknown[] = []) => pool.query(q, p);
export const url = (p: string) => base + p;

export async function call<T = any>(name: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(url(`/api/${name}`), { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': headers.ip ?? '10.0.0.1', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => null)) as T & { userFacingMessage?: string }, headers: res.headers };
}
export async function ok<T = any>(name: string, body: Record<string, unknown>) {
  const r = await call<T>(name, body);
  if (r.status !== 200) throw new Error(`${name} → ${r.status}: ${r.body?.userFacingMessage ?? JSON.stringify(r.body)}`);
  return r.body;
}

export async function login(username: string, password = PW) {
  return (await ok<{ token: string }>('login', { username, password })).token;
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
export async function uploadFile(token: string, buf = PDF, name = 'doc.pdf') {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), name);
  const res = await fetch(url('/api/_upload'), { method: 'POST', body: fd, headers: token ? { 'x-session-token': token } : {} });
  return { status: res.status, body: (await res.json()) as { url: string; filename: string; userFacingMessage?: string } };
}

type Role = 'student' | 'professor' | 'group_manager' | 'graduate_office' | 'finance' | 'reviewer' | 'admin';
export type World = { admin: string; dep: string; tokens: Record<string, string>; ids: Record<string, string> };

/** Creates admin, a department and users; each user changes their temp password and gets a token. */
export async function seed(users: { u: string; roles: Role[]; cap?: number }[]): Promise<World> {
  const existing = await sql(`SELECT 1 FROM "Profiles" LIMIT 1`);
  if (!existing.rowCount) await ok('setupAdmin', { fullName: 'مدیر سیستم', username: 'admin', password: PW });
  const admin = await login('admin');
  const dep = (await ok<{ id: string }>('adminSaveDepartment', { token: admin, name: `گروه ${Date.now()}`, faculty: 'فنی و مهندسی' })).id;
  const tokens: Record<string, string> = {}; const ids: Record<string, string> = {};
  for (const x of users) {
    const r = await ok<{ profileId: string }>('adminUpdateUser', {
      token: admin, username: x.u, tempPassword: 'Temp12345a', fullName: `کاربر ${x.u}`, roles: x.roles, departmentId: dep, programId: null,
      studentNumber: x.roles.includes('student') ? `40${Math.floor(Math.random() * 1e7)}` : '', degree: 'ارشد', programName: 'مهندسی کامپیوتر',
      academicRank: '', baseCapacity: x.cap ?? 0, eligibleForThesis: true, disabled: false,
    });
    ids[x.u] = r.profileId;
    const t = await login(x.u, 'Temp12345a');
    await ok('changePassword', { token: t, currentPassword: 'Temp12345a', newPassword: PW });
    tokens[x.u] = await login(x.u);
  }
  return { admin, dep, tokens, ids };
}

export const uniq = (p: string) => `${p}${Math.random().toString(36).slice(2, 7)}`;
export async function draft(token: string) {
  return (await ok<{ thesisId: string }>('saveThesisDraft', {
    token, titleFa: 'تحلیل داده‌های سامانه‌های آموزشی', titleEn: 'Educational data analytics', keywords: 'داده، آموزش',
    problemStatement: 'شرح مسئلهٔ پژوهش به‌اندازهٔ کافی طولانی برای اعتبارسنجی فرم.', objectives: 'اهداف پژوهش به‌اندازهٔ کافی طولانی.',
  })).thesisId;
}
