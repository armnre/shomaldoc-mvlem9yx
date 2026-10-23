// End-to-end: student registers a topic in the browser, the case is driven through every stage to graduation,
// and the result is verified in the UI (lock banner, advanced search by IranDoc code, Excel/PDF export).
import { expect, test, type Page } from '@playwright/test';
import { login, ok, PDF, seed, sql, uniq, useRemote, type World } from '../test/helpers';

useRemote('http://127.0.0.1:3100', process.env.E2E_DATABASE_URL ?? 'postgres://shomal:pw@127.0.0.1:5433/shomaldoc_e2e');
const sfx = uniq('');
const U = (k: string) => `${k}_${sfx}`;
let w: World;

async function uiLogin(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.locator('#un').fill(username);
  await page.locator('#pw').fill(password);
  await page.getByRole('button', { name: /ورود/ }).click();
  await page.waitForFunction(() => !!(localStorage.getItem('shomaldoc-session') || sessionStorage.getItem('shomaldoc-session')));
}

test.beforeAll(async () => {
  w = await seed([
    { u: U('sup'), roles: ['professor'], cap: 3 }, { u: U('gm'), roles: ['group_manager', 'professor'] },
    { u: U('go'), roles: ['graduate_office'] }, { u: U('r1'), roles: ['reviewer'] }, { u: U('r2'), roles: ['reviewer'] },
  ]);
  await ok('adminUpdateUser', {
    token: w.admin, username: U('stu'), tempPassword: 'Temp12345a', fullName: 'دانشجوی آزمون', roles: ['student'], departmentId: w.dep, programId: null,
    studentNumber: '4051234', degree: 'ارشد', programName: 'مهندسی کامپیوتر', academicRank: '', baseCapacity: 0, eligibleForThesis: true, disabled: false,
  });
});

test('topic registration → graduation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('© ۱۴۰۵ دانشگاه شمال، معاونت پژوهش و فناوری — کلیه حقوق محفوظ است.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'طراحی و توسعه: پارامیس تک' })).toHaveAttribute('href', 'https://paramistech.ir/');

  // 1) Student: first login → forced password change (UI)
  await uiLogin(page, U('stu'), 'Temp12345a');
  await page.locator('#cp').fill('Temp12345a');
  await page.locator('#np').fill('Shomal1405x');
  await page.locator('#rp').fill('Shomal1405x');
  await page.getByRole('button', { name: 'تغییر رمز' }).click();

  // 2) Topic form (UI)
  await page.locator('#tf').fill('تحلیل داده‌های آموزشی دانشگاه شمال');
  await page.locator('#te').fill('Educational data analytics at Shomal University');
  await page.locator('#kw').fill('داده‌کاوی، آموزش');
  await page.locator('#ps').fill('شرح مسئلهٔ پژوهش با جزئیات کافی برای ارزیابی گروه آموزشی.');
  await page.locator('#ob').fill('اهداف پژوهش با جزئیات کافی برای ارزیابی.');
  await page.getByRole('button', { name: 'ذخیره پیش‌نویس' }).click();

  // 3) Supervisor + PDF upload through the authenticated upload route (UI)
  await page.getByRole('radio', { name: new RegExp(`کاربر ${U('sup')}`) }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'topic.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByText('topic.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'ثبت نهایی موضوع و ارسال درخواست' }).click();
  await expect(page.getByText(/در انتظار استاد راهنما/).first()).toBeVisible();

  // 4) Remaining stages through the real API, each with that role's own session
  const T = { ...w.tokens, stu: await login(U('stu')) };
  const { rows } = await sql(`SELECT t.id::text AS id FROM "Theses" t JOIN "Profiles" p ON p.id::text = t."studentId" WHERE p.username = $1`, [U('stu')]);
  const id = rows[0].id as string;
  const files = (await sql(`SELECT files FROM "DocumentVersions" v JOIN "DocumentVersionsTheses" l ON l."documentVersionsId" = v.id WHERE l."thesesId"::text = $1 LIMIT 1`, [id])).rows[0].files
    .map((f: { url: string; filename: string }) => ({ url: f.url, filename: f.filename }));
  expect(files[0].url).toMatch(/^\/api\/_file\//);
  const act = (tk: string, action: string, extra: Record<string, unknown> = {}) => ok('thesisAction', { token: tk, thesisId: id, action, ...extra });
  const sup = T[U('sup')], gm = T[U('gm')], go = T[U('go')], stu = T.stu;
  for (let i = 0; i < 60; i++) {
    const s = (await sql(`SELECT status FROM "Theses" WHERE id::text = $1`, [id])).rows[0].status as string;
    if (s === 'GRADUATED') break;
    switch (s) {
      case 'WAITING_SUPERVISOR': await act(sup, 'supervisor_accept'); break;
      case 'GROUP_REVIEW': await act(gm, 'group_approve_topic'); break;
      case 'LITERATURE_REVIEW': await ok('submitDocument', { token: stu, kind: 'literature', content: 'پیشینهٔ تحقیق '.repeat(20), files }); break;
      case 'LITERATURE_SUPERVISOR_REVIEW': await act(sup, 'literature_approve'); break;
      case 'PROPOSAL_DRAFT': await ok('submitDocument', { token: stu, kind: 'proposal', content: 'متن پروپوزال '.repeat(20), files, formAnswers: {} }); break;
      case 'PROPOSAL_REVIEW':
        for (const tk of [sup, gm, go]) {
          const a = (await ok<{ allowedActions: string[] }>('thesisDetail', { token: tk, thesisId: id })).allowedActions;
          if (a.includes('proposal_approve')) { await act(tk, 'proposal_approve'); break; }
        }
        break;
      case 'IRANDOC_PENDING': await ok('submitIranDoc', { token: stu, trackingCode: `IRD-${sfx}`, registeredOn: '2026-10-01', receipt: files, certificate: files }); break;
      case 'IRANDOC_REVIEW': await act(go, 'irandoc_approve'); break;
      case 'THESIS_ACTIVE': await ok('submitDocument', { token: stu, kind: 'final', content: 'نسخهٔ نهایی پایان‌نامه برای بررسی استاد راهنما', files }); break;
      case 'FINAL_SUPERVISOR_REVIEW': await act(sup, 'final_approve'); break;
      case 'PLAGIARISM_CHECK': await act(go, 'plagiarism_pass', { similarity: 9, files }); break;
      case 'REVIEWER_ASSIGNMENT': await act(gm, 'assign_reviewers', { reviewers: [{ id: w.ids[U('r1')], type: 'internal' }, { id: w.ids[U('r2')], type: 'external' }] }); break;
      case 'REVIEWING':
        for (const r of [U('r1'), U('r2')]) {
          const it = (await ok<{ items: { reviewId: string; thesisId: string; verdict: string }[] }>('myReviews', { token: T[r] })).items.find((x) => x.thesisId === id && x.verdict === 'pending');
          if (it) await ok('submitReview', { token: T[r], reviewId: it.reviewId, verdict: 'approve', score: 18, comment: 'قابل دفاع است.', files: [] });
        }
        break;
      case 'DEFENSE_SCHEDULING':
        await act(go, 'schedule_defense', { defenseDate: new Date(Date.now() + 864e5 * 3).toISOString(), defenseLocation: 'سالن شورا', gapException: true, comment: 'مجوز شورای تحصیلات تکمیلی شمارهٔ ۴۵' });
        break;
      case 'DEFENSE_SCHEDULED': await act(go, 'record_defense', { score: 19, files }); break;
      case 'DEFENDED': await act(sup, 'confirm_completion'); break;
      case 'THESIS_COMPLETED': await act(go, 'start_graduation'); break;
      case 'GRADUATION_PROCESS': {
        const list = await ok<{ items: { id: string }[] }>('graduationItems', { token: stu, thesisId: id, op: 'list' });
        for (const it of list.items) {
          await ok('graduationItems', { token: stu, thesisId: id, op: 'submit', itemId: it.id, files });
          await ok('graduationItems', { token: go, thesisId: id, op: 'verify', itemId: it.id });
        }
        await act(go, 'graduate');
        break;
      }
      default: throw new Error(`unexpected status ${s}`);
    }
  }

  // 5) Student sees the closed, locked case (UI)
  await page.reload();
  await expect(page.getByText(/بسته و قفل شده است/).first()).toBeVisible();

  // 6) Graduate office: advanced search by IranDoc code + Excel/PDF export (UI)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await uiLogin(page, U('go'), 'Shomal1405x');
  await page.goto('/reports');
  await page.getByLabel(/کد پیگیری ایرانداک/).fill(`IRD-${sfx}`);
  await page.getByRole('button', { name: 'اعمال فیلتر' }).click();
  await expect(page.getByText('تحلیل داده‌های آموزشی دانشگاه شمال')).toBeVisible();
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  expect(pdf.url()).toContain('/api/_file/');
  const { readFile } = await import('node:fs/promises');
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe('%PDF-'); // fetched with the HttpOnly session cookie
});
