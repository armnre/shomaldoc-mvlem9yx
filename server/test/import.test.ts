// Excel bulk import: initial passwords, forced change, auto-created departments/programs, re-import, RBAC.
import { beforeAll, describe, expect, it } from 'vitest';
import { boot, call, ok, PW, seed, sql, uniq, type World } from './helpers';

let w: World;
const studentRow = (u: string, nc: string, dep: string, prog: string) => ({
  username: u, fullName: 'آزاده محمودخاني', department: dep, studentNumber: u, nationalCode: nc,
  programName: prog, degree: 'کارشناسی ارشد', eligible: true, academicRank: '', capacity: 0,
});
const profRow = (u: string, dep: string) => ({
  username: u, fullName: 'سيدمجتبي كاوسي داودي', department: dep, academicRank: 'استاديار', capacity: 12,
  studentNumber: '', nationalCode: '', programName: '', degree: '', eligible: false,
});

describe('ورود گروهی از اکسل', () => {
  beforeAll(async () => { await boot(); w = await seed([{ u: uniq('stu'), roles: ['student'] }]); });

  it('دانشجو با کد ملی وارد می‌شود و باید رمز را تغییر دهد؛ گروه و رشته خودکار ساخته می‌شوند', async () => {
    const dep = `کامپیوتر${Date.now()}`;
    const u = String(4031117000 + Math.floor(Math.random() * 999));
    const r = await ok('adminImportUsers', { token: w.admin, kind: 'student', rows: [studentRow(u, '2190209994', dep, 'مهندسي كامپيوتر-هوش مصنوعي و رباتيك'), studentRow(u, '2190209994', dep, 'x')] });
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.departmentsCreated).toHaveLength(1);
    expect(r.programsCreated).toHaveLength(1);
    const login = await call('login', { username: u, password: '2190209994' });
    expect(login.status).toBe(200);
    const me = await ok('me', { token: login.body.token });
    expect(JSON.stringify(me)).toMatch(/mustChangePassword"?:true/);
    expect((await call('login', { username: u, password: 'wrong-pass1' })).status).not.toBe(200);
    const { rows } = await sql(`SELECT p."eligibleForThesis", p."degree", p."nationalCode", (SELECT count(*) FROM "ProfilesPrograms" pp WHERE pp."profilesId" = p.id) AS progs FROM "Profiles" p WHERE p."username" = $1`, [u]);
    expect(rows[0]).toMatchObject({ eligibleForThesis: true, degree: 'کارشناسی ارشد', nationalCode: '2190209994' });
    expect(Number(rows[0].progs)).toBe(1);
    await ok('changePassword', { token: login.body.token, currentPassword: '2190209994', newPassword: PW });
    expect((await call('login', { username: u, password: PW })).status).toBe(200);

    // Re-import with the same department name (Arabic letters) reuses it and keeps the changed password.
    const again = await ok('adminImportUsers', { token: w.admin, kind: 'student', rows: [studentRow(u, '2190209994', dep.replace('ی', 'ي'), 'مهندسي كامپيوتر-هوش مصنوعي و رباتيك')] });
    expect(again).toMatchObject({ created: 0, updated: 1, departmentsCreated: [], programsCreated: [] });
    expect((await call('login', { username: u, password: PW })).status).toBe(200);
  });

  it('استاد با نام کاربری خودش به‌عنوان رمز وارد می‌شود', async () => {
    const u = String(380000 + Math.floor(Math.random() * 999));
    const r = await ok('adminImportUsers', { token: w.admin, kind: 'professor', rows: [profRow(u, `صنايع${Date.now()}`), profRow(u, 'x')] });
    expect(r).toMatchObject({ created: 1, skipped: 1 });
    const login = await call('login', { username: u, password: u });
    expect(login.status).toBe(200);
    const { rows } = await sql(`SELECT "academicRank", "baseCapacity", "roles", "mustChangePassword" FROM "Profiles" WHERE "username" = $1`, [u]);
    expect(rows[0]).toMatchObject({ academicRank: 'استادیار', baseCapacity: 12, mustChangePassword: true });
    expect(rows[0].roles).toContain('professor');
  });

  it('ردیف خراب گزارش می‌شود و بقیه وارد می‌شوند', async () => {
    const good = String(4049990000 + Math.floor(Math.random() * 999));
    const r = await ok('adminImportUsers', { token: w.admin, kind: 'student', rows: [studentRow('ب', '1', 'عمران', ''), studentRow(good, '123', 'عمران', '')] });
    expect(r.created).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect((await call('login', { username: good, password: '0000000123' })).status).toBe(200);
  });

  it('فقط مدیر سیستم اجازهٔ ورود گروهی دارد', async () => {
    const tok = Object.values(w.tokens)[0];
    const r = await call('adminImportUsers', { token: tok, kind: 'student', rows: [studentRow('4000000001', '2190209994', 'x', '')] });
    expect(r.status).toBe(403);
  });
});
