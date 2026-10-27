// Two-step literature approval (supervisor → group manager), admin-configurable supervisor/advisor caps,
// committee from real profiles, proposal gating and concurrency — against the real server + PostgreSQL.
import { beforeAll, describe, expect, it } from 'vitest';
import { boot, call, ok, seed, sql, uniq, uploadFile, type World } from './helpers';

let w: World;
let id = '';
const sfx = uniq('');
const U = (k: string) => `${k}_${sfx}`;
const T = (k: string) => w.tokens[U(k)];
const status = async () => (await sql(`SELECT status FROM "Theses" WHERE id::text=$1`, [id])).rows[0].status as string;
const act = (k: string, action: string, extra: Record<string, unknown> = {}) => call('thesisAction', { token: T(k), thesisId: id, action, ...extra });
const lit = (k = 'stu') => call('submitDocument', { token: T(k), kind: 'literature', content: 'مرور مطالعات مرتبط و شکاف پژوهشی '.repeat(3), files: [] });
const setting = (updates: Record<string, string>, token = w.admin) => call('adminSettings', { token, updates });
let files: { url: string; filename: string }[] = [];
let programId = '';

beforeAll(async () => {
  await boot();
  w = await seed([
    { u: U('stu'), roles: ['student'] }, { u: U('stu2'), roles: ['student'] }, { u: U('sup'), roles: ['professor'], cap: 5 },
    { u: U('gm'), roles: ['group_manager', 'professor'] }, { u: U('p2'), roles: ['professor'] }, { u: U('p3'), roles: ['professor'] },
    { u: U('p4'), roles: ['professor'] }, { u: U('go'), roles: ['graduate_office'] },
  ]);
  id = (await ok<{ thesisId: string }>('saveThesisDraft', { token: T('stu'), titleFa: 'تحلیل داده‌های آموزشی دانشگاه' })).thesisId;
  await ok('requestSupervisor', { token: T('stu'), professorId: w.ids[U('sup')], files: [] });
  await ok('thesisAction', { token: T('sup'), thesisId: id, action: 'supervisor_accept' });
  files = [(await uploadFile(T('stu'))).body];
  programId = (await sql(`INSERT INTO "Programs"(name, degree, faculty, "isActive") VALUES ('مهندسی نرم‌افزار','کارشناسی ارشد','دانشکده آزمون',true) RETURNING id::text`)).rows[0].id;
});

describe('literature review: supervisor then group manager', () => {
  it('blocks literature before the topic is approved', async () => {
    expect(await status()).toBe('GROUP_REVIEW');
    expect((await lit()).status).toBe(403);
  });
  it('opens literature after topic approval; GM cannot approve before the supervisor', async () => {
    await ok('thesisAction', { token: T('gm'), thesisId: id, action: 'group_approve_topic' });
    expect(await status()).toBe('LITERATURE_REVIEW');
    expect((await lit()).status).toBe(200);
    expect(await status()).toBe('LITERATURE_SUPERVISOR_REVIEW');
    expect((await act('gm', 'literature_gm_approve')).status).toBe(403);
  });
  it('requires a reason to return; student sees it; versions are kept', async () => {
    expect((await act('sup', 'literature_revision', { comment: '' })).status).toBe(400);
    expect((await act('sup', 'literature_revision', { comment: 'منابع جدیدتر اضافه شود' })).status).toBe(200);
    expect(await status()).toBe('LITERATURE_REVISION');
    const d = await ok<{ versions: { kind: string; reviewComment: string; isActive: boolean }[] }>('thesisDetail', { token: T('stu') });
    expect(d.versions.find((v) => v.kind === 'literature' && v.isActive)!.reviewComment).toBe('منابع جدیدتر اضافه شود');
    expect((await lit()).status).toBe(200);
    expect(await status()).toBe('LITERATURE_SUPERVISOR_REVIEW');
  });
  it('supervisor approval forwards to GM (not final); unauthorised roles are refused', async () => {
    for (const k of ['stu', 'p2', 'go']) expect((await act(k, 'literature_approve')).status, k).toBe(403);
    expect((await act('sup', 'literature_approve')).status).toBe(200);
    expect(await status()).toBe('LITERATURE_GROUP_REVIEW');
    expect((await act('sup', 'literature_gm_approve')).status).toBe(403);
    const n = await ok<{ nextActor: { roleLabel: string; people: string[] } }>('thesisDetail', { token: T('stu') });
    expect(n.nextActor.roleLabel).toBe('مدیر گروه');
    expect(n.nextActor.people).toContain(`کاربر ${U('gm')}`);
  });
  it('proposal is blocked until both approvals', async () => {
    const r = await call('submitDocument', { token: T('stu'), kind: 'proposal', content: 'متن پروپوزال '.repeat(10), files });
    expect(r.status).toBe(403);
  });
  it('GM return requires reason; resubmission restarts at the supervisor', async () => {
    expect((await act('gm', 'literature_gm_revision', { comment: '' })).status).toBe(400);
    expect((await act('gm', 'literature_gm_revision', { comment: 'روش‌شناسی مرور مشخص نیست' })).status).toBe(200);
    expect(await status()).toBe('LITERATURE_REVISION');
    expect((await lit()).status).toBe(200);
    expect(await status()).toBe('LITERATURE_SUPERVISOR_REVIEW');
    const v = await sql(`SELECT "versionNumber", "reviewStatus", "isActive" FROM "DocumentVersions" dv JOIN "DocumentVersionsTheses" l ON l."documentVersionsId"=dv.id WHERE l."thesesId"::text=$1 AND kind='literature' ORDER BY "versionNumber"`, [id]);
    expect(v.rows.map((r) => r.versionNumber)).toEqual([1, 2, 3]);
    expect(v.rows.filter((r) => r.isActive)).toHaveLength(1);
  });
  it('concurrent duplicate approvals apply exactly one transition', async () => {
    const rs = await Promise.all([act('sup', 'literature_approve'), act('sup', 'literature_approve'), act('sup', 'literature_approve')]);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await status()).toBe('LITERATURE_GROUP_REVIEW');
    expect((await act('gm', 'literature_gm_approve')).status).toBe(200);
    expect(await status()).toBe('PROPOSAL_DRAFT');
    const logs = await sql(`SELECT a.action, a."actorRole" FROM "AuditLogs" a JOIN "AuditLogsTheses" l ON l."auditLogsId"=a.id WHERE l."thesesId"::text=$1`, [id]);
    const acts = logs.rows.map((r) => `${r.action}|${r.actorRole}`);
    expect(acts.filter((a) => a === 'literature_approve|supervisor')).toHaveLength(2);
    expect(acts).toContain('literature_gm_approve|group_manager');
    expect(acts).toContain('literature_gm_revision|group_manager');
  });
});

describe('supervisor/advisor caps (admin setting) and committee', () => {
  it('only admin can change caps; values are validated and audited', async () => {
    expect((await setting({ maxAdvisors: '2' }, T('go'))).status).toBe(403);
    expect((await setting({ maxSupervisors: '0' })).status).toBe(400);
    expect((await setting({ maxAdvisors: 'x' })).status).toBe(400);
    expect((await setting({ maxSupervisors: '2', maxAdvisors: '2' })).status).toBe(200);
    const a = await sql(`SELECT 1 FROM "AuditLogs" WHERE action LIKE 'تغییر تنظیم:%استاد مشاور%'`);
    expect(a.rowCount).toBeGreaterThan(0);
  });
  it('saves a draft server-side without submitting', async () => {
    const draft = { answers: {}, content: 'x', coSupervisorIds: [w.ids[U('p2')]], advisorIds: [], files: [], step: 3 };
    expect((await call('saveProposalDraft', { token: T('stu'), draft })).status).toBe(200);
    expect((await call('saveProposalDraft', { token: T('stu2'), draft })).status).toBeGreaterThanOrEqual(400);
    const d = await ok<{ proposalDraft: string }>('thesisDetail', { token: T('stu') });
    expect(JSON.parse(d.proposalDraft).coSupervisorIds).toEqual([w.ids[U('p2')]]);
    expect(await status()).toBe('PROPOSAL_DRAFT');
  });
  const submit = (co: string[], adv: string[]) => call('submitDocument', { token: T('stu'), kind: 'proposal', content: 'متن پروپوزال '.repeat(10), files, coSupervisorIds: co, advisorIds: adv });
  it('enforces program, caps, real profiles and no duplicates on the server', async () => {
    expect((await submit([], [])).status).toBe(400); // program not chosen
    const prog = (await sql(`SELECT faculty, name FROM "Programs" WHERE id::text=$1`, [programId])).rows[0];
    await ok('setThesisProgram', { token: T('stu'), thesisId: id, programId, faculty: prog.faculty, major: prog.name });
    expect((await submit([w.ids[U('p2')], w.ids[U('p3')]], [])).status).toBe(400); // 3 supervisors > 2
    expect((await submit([], [w.ids[U('p2')], w.ids[U('p3')], w.ids[U('p4')]])).status).toBe(400); // 3 advisors > 2
    expect((await submit([w.ids[U('p2')]], [w.ids[U('p2')]])).status).toBe(400); // duplicate
    expect((await submit([], [w.ids[U('go')]])).status).toBe(400); // not a professor
    expect((await submit([], [w.ids[U('sup')]])).status).toBe(400); // same as primary supervisor
    expect((await submit([w.ids[U('p2')]], [w.ids[U('p3')], w.ids[U('p4')]])).status).toBe(200);
    expect(await status()).toBe('PROPOSAL_REVIEW');
    const c = await ok<{ committee: { role: string; position: number; isActive: boolean }[] }>('thesisDetail', { token: T('stu') });
    expect(c.committee.filter((x) => x.isActive).map((x) => `${x.role}${x.position}`).sort()).toEqual(['advisor1', 'advisor2', 'supervisor1', 'supervisor2']);
  });
  it('a committee member can view the case; an unrelated student cannot', async () => {
    expect((await call('thesisDetail', { token: T('p4'), thesisId: id })).status).toBe(200);
    expect((await call('thesisDetail', { token: T('stu2'), thesisId: id })).status).toBe(403);
  });
  it('lowering a cap does not break an in-review case; it applies at the next write', async () => {
    expect((await setting({ maxAdvisors: '1' })).status).toBe(200);
    const d = await ok<{ committee: { isActive: boolean }[]; allowedActions: string[] }>('thesisDetail', { token: T('sup'), thesisId: id });
    expect(d.committee.filter((x) => x.isActive)).toHaveLength(4);
    expect(d.allowedActions).toContain('proposal_approve');
    expect((await act('sup', 'proposal_revision', { comment: 'اصلاح جدول زمان‌بندی' })).status).toBe(200);
    expect((await submit([w.ids[U('p2')]], [w.ids[U('p3')], w.ids[U('p4')]])).status).toBe(400);
    expect((await submit([w.ids[U('p2')]], [w.ids[U('p3')]])).status).toBe(200);
    const hist = await sql(`SELECT "isActive", "removedById" FROM "ThesisCommittee" WHERE "thesisId"=$1 AND "professorId"=$2`, [id, w.ids[U('p4')]]);
    expect(hist.rows[0]).toMatchObject({ isActive: false, removedById: w.ids[U('stu')] });
  });
});
