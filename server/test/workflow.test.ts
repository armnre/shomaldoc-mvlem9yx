// PRD rules + the complete workflow from topic registration to graduation, against the real server.
import { beforeAll, describe, expect, it } from 'vitest';
import { boot, call, draft, ok, seed, sql, uniq, uploadFile, url, type World } from './helpers';

let w: World;
const U = (k: string) => `${k}_${sfx}`;
const sfx = uniq('');
const status = async (id: string) => (await sql(`SELECT status, "isLocked" FROM "Theses" WHERE id::text = $1`, [id])).rows[0];

beforeAll(async () => {
  await boot();
  w = await seed([
    { u: U('stu'), roles: ['student'] }, { u: U('sup'), roles: ['professor'], cap: 3 },
    { u: U('gm'), roles: ['group_manager', 'professor'] }, { u: U('go'), roles: ['graduate_office'] },
    { u: U('r1'), roles: ['reviewer'] }, { u: U('r2'), roles: ['reviewer'] },
    { u: U('cap1'), roles: ['professor'], cap: 1 }, { u: U('race'), roles: ['professor'], cap: 1 },
    ...Array.from({ length: 6 }, (_, i) => ({ u: U(`rs${i}`), roles: ['student' as const] })),
    { u: U('ca'), roles: ['student'] }, { u: U('cb'), roles: ['student'] },
  ]);
});

describe('supervisor capacity', () => {
  it('blocks requests beyond the professor capacity', async () => {
    const file = (await uploadFile(w.tokens[U('ca')])).body;
    await draft(w.tokens[U('ca')]);
    await ok('requestSupervisor', { token: w.tokens[U('ca')], professorId: w.ids[U('cap1')], files: [file] });
    await draft(w.tokens[U('cb')]);
    const r = await call('requestSupervisor', { token: w.tokens[U('cb')], professorId: w.ids[U('cap1')], files: [file] });
    expect(r.status).toBe(400);
    expect(r.body.userFacingMessage).toMatch(/ظرفیت/);
  });

  it('race: 6 simultaneous requests for 1 seat → exactly one succeeds (row lock)', async () => {
    const students = Array.from({ length: 6 }, (_, i) => U(`rs${i}`));
    for (const s of students) await draft(w.tokens[s]);
    const results = await Promise.all(students.map((s) => call('requestSupervisor', { token: w.tokens[s], professorId: w.ids[U('race')], files: [] })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400).every((r) => /ظرفیت/.test(r.body.userFacingMessage ?? ''))).toBe(true);
    const { rows } = await sql(`SELECT COUNT(*)::int AS c FROM "SupervisorRequests" WHERE "professorId" = $1 AND "requestStatus" = 'pending'`, [w.ids[U('race')]]);
    expect(rows[0].c).toBe(1);
  });
});

describe('full workflow: topic → graduation', () => {
  it('walks every stage and enforces min-gap, similarity cap and case lock', async () => {
    const T = w.tokens;
    const stu = T[U('stu')], sup = T[U('sup')], gm = T[U('gm')], go = T[U('go')];
    const pdf = (await uploadFile(stu)).body;
    const files = [pdf];
    const id = await draft(stu);
    const act = (token: string, action: string, extra: Record<string, unknown> = {}) => ok('thesisAction', { token, thesisId: id, action, ...extra });
    const allowed = async (token: string) => (await ok<{ allowedActions: string[] }>('thesisDetail', { token, thesisId: id })).allowedActions;
    const seen: string[] = [];
    let checkedGap = false, checkedSim = false, programSet = false;

    for (let i = 0; i < 60; i++) {
      const s = (await status(id)).status as string;
      seen.push(s);
      if (s === 'GRADUATED') break;
      switch (s) {
        case 'DRAFT': await ok('requestSupervisor', { token: stu, professorId: w.ids[U('sup')], files }); break;
        case 'WAITING_SUPERVISOR': await act(sup, 'supervisor_accept'); break;
        case 'GROUP_ASSIGNMENT': await act(gm, 'group_assign_supervisor', { targetId: w.ids[U('sup')] }); break;
        case 'GROUP_REVIEW': await act(gm, 'group_approve_topic'); break;
        case 'LITERATURE_REVIEW': await ok('submitDocument', { token: stu, kind: 'literature', content: 'پیشینهٔ تحقیق '.repeat(20), files }); break;
        case 'LITERATURE_SUPERVISOR_REVIEW': await act(sup, 'literature_approve'); break;
        case 'LITERATURE_GROUP_REVIEW': await act(gm, 'literature_gm_approve'); break;
        case 'PROPOSAL_DRAFT':
          if (!programSet) {
            programSet = true;
            const pr = (await sql(`INSERT INTO "Programs"(name, degree, faculty, "isActive") VALUES ('مهندسی کامپیوتر','کارشناسی ارشد','دانشکده فنی',true) RETURNING id::text, name, faculty`)).rows[0];
            await ok('setThesisProgram', { token: stu, thesisId: id, programId: pr.id, faculty: pr.faculty, major: pr.name });
          }
          await ok('submitDocument', { token: stu, kind: 'proposal', content: 'متن پروپوزال '.repeat(20), files, formAnswers: {} }); break;
        case 'PROPOSAL_REVIEW': {
          let done = false;
          for (const tk of [sup, gm, go]) if ((await allowed(tk)).includes('proposal_approve')) { await act(tk, 'proposal_approve'); done = true; break; }
          expect(done, 'someone in the proposal chain can approve').toBe(true);
          break;
        }
        case 'IRANDOC_PENDING': await ok('submitIranDoc', { token: stu, trackingCode: 'IRD-1405-7788', registeredOn: '2026-10-01', receipt: files, certificate: files }); break;
        case 'IRANDOC_REVIEW': await act(go, 'irandoc_approve'); break;
        case 'THESIS_ACTIVE': await ok('submitDocument', { token: stu, kind: 'final', content: 'نسخهٔ نهایی پایان‌نامه برای بررسی استاد راهنما', files }); break;
        case 'FINAL_SUPERVISOR_REVIEW': await act(sup, 'final_approve'); break;
        case 'PLAGIARISM_CHECK': {
          const over = await call('thesisAction', { token: go, thesisId: id, action: 'plagiarism_pass', similarity: 45, files });
          expect(over.status).toBe(400);
          expect(over.body.userFacingMessage).toMatch(/حد مجاز/);
          checkedSim = true;
          await act(go, 'plagiarism_pass', { similarity: 12, files });
          break;
        }
        case 'REVIEWER_ASSIGNMENT': await act(gm, 'assign_reviewers', { reviewers: [{ id: w.ids[U('r1')], type: 'internal' }, { id: w.ids[U('r2')], type: 'external' }] }); break;
        case 'REVIEWING':
          for (const r of [U('r1'), U('r2')]) {
            const mine = await ok<{ items: { reviewId: string; thesisId: string; verdict: string }[] }>('myReviews', { token: T[r] });
            const it = mine.items.find((x) => x.thesisId === id && x.verdict === 'pending');
            if (it) await ok('submitReview', { token: T[r], reviewId: it.reviewId, verdict: 'approve', score: 18, comment: 'پایان‌نامه قابل دفاع است.', files: [] });
          }
          break;
        case 'DEFENSE_SCHEDULING': {
          const when = new Date(Date.now() + 7 * 86400_000).toISOString();
          const early = await call('thesisAction', { token: go, thesisId: id, action: 'schedule_defense', defenseDate: when, defenseLocation: 'سالن ۱' });
          expect(early.status).toBe(400);
          expect(early.body.userFacingMessage).toMatch(/ماه/);
          checkedGap = true;
          await act(go, 'schedule_defense', { defenseDate: when, defenseLocation: 'سالن ۱', gapException: true, comment: 'مجوز شورای تحصیلات تکمیلی شمارهٔ ۱۲' });
          break;
        }
        case 'DEFENSE_SCHEDULED': await act(go, 'record_defense', { score: 18.5, files }); break;
        case 'DEFENDED': await act(sup, 'confirm_completion'); break;
        case 'THESIS_COMPLETED': await act(go, 'start_graduation'); break;
        case 'GRADUATION_PROCESS': {
          const list = await ok<{ items: { id: string; status: string }[] }>('graduationItems', { token: stu, thesisId: id, op: 'list' });
          for (const item of list.items) {
            if (item.status !== 'verified') {
              await ok('graduationItems', { token: stu, thesisId: id, op: 'submit', itemId: item.id, files });
              await ok('graduationItems', { token: go, thesisId: id, op: 'verify', itemId: item.id });
            }
          }
          await act(go, 'graduate');
          break;
        }
        default: throw new Error(`unexpected status ${s} after ${seen.join(' → ')}`);
      }
    }
    const end = await status(id);
    expect(end.status, seen.join(' → ')).toBe('GRADUATED');
    expect(checkedGap && checkedSim).toBe(true);

    // Case lock: closed file is read-only for everyone except admin reopen
    expect(end.isLocked).toBe(true);
    expect(await allowed(go)).toEqual([]);
    expect(await allowed(w.admin)).toEqual(['reopen_case']);
    const edit = await call('submitDocument', { token: stu, kind: 'final', content: 'x', files });
    expect(edit.status).toBeGreaterThanOrEqual(400);

    // IranDoc tracking code is searchable in the advanced report
    const rep = await ok<{ rows: { code: string }[] }>('reportTheses', { token: w.admin, scope: 'admin', op: 'rows', filters: { q: 'IRD-1405-7788' } });
    expect(rep.rows.length).toBe(1);
    // Real PDF export with logo, downloadable only with a session
    const pdfRep = await ok<{ pdfUrl: string }>('reportTheses', { token: w.admin, scope: 'admin', op: 'pdf', filters: {} });
    const dl = await fetch(url(pdfRep.pdfUrl), { headers: { 'x-session-token': w.admin } });
    expect(dl.status).toBe(200);
    expect(Buffer.from(await dl.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await fetch(url(pdfRep.pdfUrl))).status).toBe(401);
    console.log('Workflow path:', seen.join(' → '));
  });
});
