// Topic-only first stage, manual proposal approval date (RBAC + validation + audit) and Master's program filter, against the real server.
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { boot, call, ok, seed, sql, uniq, type World } from './helpers';

let w: World;
const sfx = uniq('');
const U = (k: string) => `${k}_${sfx}`;

beforeAll(async () => {
  await boot();
  w = await seed([
    { u: U('stu'), roles: ['student'] }, { u: U('stu2'), roles: ['student'] }, { u: U('sup'), roles: ['professor'], cap: 3 },
    { u: U('gm'), roles: ['group_manager', 'professor'] }, { u: U('go'), roles: ['graduate_office'] },
  ]);
});

describe('initial request: topic only', () => {
  it('creates a case with only the Persian title and sends it to a supervisor', async () => {
    const r = await ok<{ thesisId: string }>('saveThesisDraft', { token: w.tokens[U('stu')], titleFa: 'بهینه‌سازی زمان‌بندی کلاس‌ها' });
    const row = (await sql(`SELECT status, "studentId" FROM "Theses" WHERE id::text=$1`, [r.thesisId])).rows[0];
    expect(row).toMatchObject({ status: 'DRAFT', studentId: w.ids[U('stu')] });
    await ok('requestSupervisor', { token: w.tokens[U('stu')], professorId: w.ids[U('sup')], files: [] });
    expect((await sql(`SELECT status FROM "Theses" WHERE id::text=$1`, [r.thesisId])).rows[0].status).toBe('WAITING_SUPERVISOR');
    const logs = await sql(`SELECT a.action FROM "AuditLogs" a JOIN "AuditLogsTheses" l ON l."auditLogsId"=a.id WHERE l."thesesId"::text=$1`, [r.thesisId]);
    expect(logs.rows.map((x) => x.action)).toContain('ایجاد پرونده پایان‌نامه');
  });
  it('rejects a too-short topic', async () => {
    const r = await call('saveThesisDraft', { token: w.tokens[U('stu2')], titleFa: 'کوتا' });
    expect(r.status).toBe(400);
  });
  it('blocks literature upload before the topic is approved', async () => {
    const r = await call('submitDocument', { token: w.tokens[U('stu')], kind: 'literature', content: 'x'.repeat(50), files: [] });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('manual proposal approval date', () => {
  let id = '';
  const setStatus = (s: string) => sql(`UPDATE "Theses" SET status=$2, "topicApprovedAt"='2026-01-10T08:00:00Z' WHERE id::text=$1`, [id, s]);
  beforeAll(async () => {
    id = (await sql(`SELECT id::text FROM "Theses" WHERE "studentId"=$1`, [w.ids[U('stu')]])).rows[0].id;
  });
  it('is refused before the proposal is approved', async () => {
    await setStatus('PROPOSAL_REVIEW');
    const r = await call('setProposalApprovalDate', { token: w.tokens[U('go')], thesisId: id, approvalDate: '2026-03-01' });
    expect(r.status).toBe(403);
  });
  it('is refused for student, supervisor and group manager (direct API)', async () => {
    await setStatus('IRANDOC_PENDING');
    for (const u of ['stu', 'sup', 'gm']) {
      const r = await call('setProposalApprovalDate', { token: w.tokens[U(u)], thesisId: id, approvalDate: '2026-03-01' });
      expect(r.status).toBe(403);
    }
  });
  it('rejects invalid, future and pre-topic dates', async () => {
    for (const d of ['2026-02-30', '1405/01/01', '2999-01-01', '2025-12-01']) {
      const r = await call('setProposalApprovalDate', { token: w.tokens[U('go')], thesisId: id, approvalDate: d });
      expect(r.status, d).toBe(400);
    }
  });
  it('records the official date separately from the recording time, and audits corrections', async () => {
    const r = await ok<{ proposalApprovedAt: string; approvalDateSetAt: string }>('setProposalApprovalDate', { token: w.tokens[U('go')], thesisId: id, approvalDate: '2026-03-01' });
    expect(r.proposalApprovedAt).toBe(new Date('2026-03-01T00:00:00+03:30').toISOString());
    expect(r.approvalDateSetAt).not.toBe(r.proposalApprovedAt);
    const noReason = await call('setProposalApprovalDate', { token: w.tokens[U('go')], thesisId: id, approvalDate: '2026-03-05' });
    expect(noReason.status).toBe(400);
    await ok('setProposalApprovalDate', { token: w.tokens[U('go')], thesisId: id, approvalDate: '2026-03-05', reason: 'اصلاح طبق صورتجلسه' });
    const d = await ok<{ thesis: { proposalApprovedAt: string; approvalDateSetBy: string }; timeline: { action: string }[] }>('thesisDetail', { token: w.tokens[U('stu')], thesisId: id });
    expect(d.thesis.proposalApprovedAt.slice(0, 10)).toBe('2026-03-04'); // Tehran midnight in UTC
    expect(d.thesis.approvalDateSetBy).toContain('کاربر');
    const acts = d.timeline.map((x) => x.action);
    expect(acts).toContain('ثبت تاریخ تصویب پروپوزال');
    expect(acts).toContain('اصلاح تاریخ تصویب پروپوزال');
  });
  it('is locked once the defense is scheduled', async () => {
    await setStatus('DEFENSE_SCHEDULED');
    const r = await call('setProposalApprovalDate', { token: w.tokens[U('go')], thesisId: id, approvalDate: '2026-03-06', reason: 'تست' });
    expect(r.status).toBe(403);
  });
});

describe("Master's programs", () => {
  it('seed is idempotent and imports only Master\'s rows (dry-run first)', async () => {
    const run = (...a: string[]) => execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'scripts/seed-masters-programs.ts', ...a], { env: process.env, encoding: 'utf8' });
    expect(run('--dry-run')).toMatch(/\[dry-run\] .*37 inserted/);
    expect(Number((await sql(`SELECT COUNT(*)::int c FROM "Programs" WHERE degree='کارشناسی ارشد'`)).rows[0].c)).toBe(0);
    expect(run()).toMatch(/37 inserted, 0 already/);
    expect(run()).toMatch(/0 inserted, 37 already/);
    const { rows } = await sql(`SELECT COUNT(*)::int c, COUNT(DISTINCT faculty||'|'||name)::int m, COUNT(specialization)::int s FROM "Programs" WHERE degree='کارشناسی ارشد'`);
    expect(rows[0]).toEqual({ c: 37, m: 21, s: 28 });
  });
  it('lists faculty → major → specialization, excluding other degrees and inactive rows', async () => {
    await sql(`INSERT INTO "Programs"(name, degree, faculty, "isActive") VALUES ('مهندسی کامپیوتر','کارشناسی','دانشکده فنی و مهندسی',true), ('رشته غیرفعال','کارشناسی ارشد','دانشکده فنی و مهندسی',false)`);
    const r = await ok<{ faculties: { name: string; majors: { name: string; specializations: { programId: string; name: string | null }[] }[] }[] }>('listMastersPrograms', { token: w.tokens[U('stu2')] });
    expect(r.faculties).toHaveLength(3);
    const all = r.faculties.flatMap((f) => f.majors);
    expect(all).toHaveLength(21);
    expect(all.map((m) => m.name)).not.toContain('رشته غیرفعال');
    expect(all.find((m) => m.name === 'مهندسی عمران')!.specializations).toHaveLength(6);
    expect(all.find((m) => m.name === 'مهندسی معماری')!.specializations).toEqual([expect.objectContaining({ name: null })]);
  });
  it('validates the selection on the server (faculty, major, degree, ownership)', async () => {
    const stuId = (await sql(`SELECT id::text FROM "Theses" WHERE "studentId"=$1`, [w.ids[U('stu')]])).rows[0].id;
    await sql(`UPDATE "Theses" SET status='PROPOSAL_DRAFT' WHERE id::text=$1`, [stuId]);
    const pick = async (name: string, spec: string | null, degree = 'کارشناسی ارشد') =>
      (await sql(`SELECT id::text, faculty FROM "Programs" WHERE name=$1 AND degree=$3 AND specialization IS NOT DISTINCT FROM $2`, [name, spec, degree])).rows[0];
    const civil = await pick('مهندسی عمران', 'سازه');
    const base = { token: w.tokens[U('stu')], thesisId: stuId };
    expect((await call('setThesisProgram', { ...base, faculty: 'دانشکده علوم انسانی', major: 'مهندسی عمران', programId: civil.id })).status).toBe(400);
    expect((await call('setThesisProgram', { ...base, faculty: civil.faculty, major: 'مهندسی شیمی', programId: civil.id })).status).toBe(400);
    const bsc = await pick('مهندسی کامپیوتر', null, 'کارشناسی');
    expect((await call('setThesisProgram', { ...base, faculty: bsc.faculty, major: 'مهندسی کامپیوتر', programId: bsc.id })).status).toBe(400);
    expect((await call('setThesisProgram', { ...base, token: w.tokens[U('stu2')], faculty: civil.faculty, major: 'مهندسی عمران', programId: civil.id })).status).toBe(403);
    await ok('setThesisProgram', { ...base, faculty: civil.faculty, major: 'مهندسی عمران', programId: civil.id });
    const d = await ok<{ thesis: { programMajor: string; programFaculty: string } }>('thesisDetail', base);
    expect(d.thesis).toMatchObject({ programMajor: 'مهندسی عمران', programFaculty: 'دانشکده فنی و مهندسی' });
    const arch = await pick('مهندسی معماری', null);
    await ok('setThesisProgram', { ...base, faculty: arch.faculty, major: 'مهندسی معماری', programId: arch.id });
    await sql(`UPDATE "Theses" SET status='IRANDOC_PENDING' WHERE id::text=$1`, [stuId]);
    expect((await call('setThesisProgram', { ...base, faculty: civil.faculty, major: 'مهندسی عمران', programId: civil.id })).status).toBe(403);
  });
});
