// End-to-end: student registers a topic in the browser, the case is driven through every stage to graduation,
// and the result is verified in the UI (lock banner, advanced search by IranDoc code, Excel/PDF export).
import { expect, test, type Browser, type Page } from '@playwright/test';
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

const errors: string[] = [];
/** Real browser action: logs in as that role in its own context, opens the case and runs the action from the ActionPanel. */
async function uiAct(browser: Browser, username: string, thesisId: string, label: string, fill?: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ locale: 'fa-IR' });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${username}: ${m.text()}`); });
  p.on('response', (r) => { if (r.status() >= 500) errors.push(`${username}: ${r.status()} ${r.url()}`); });
  await uiLogin(p, username, 'Shomal1405x');
  await p.goto(`/thesis/${thesisId}`);
  await expect(p.getByText('این پرونده منتظر اقدام شماست')).toBeVisible();
  await p.getByRole('button', { name: label, exact: true }).click();
  if (fill) await fill(p);
  await p.getByRole('button', { name: 'تأیید و ثبت' }).click();
  await expect(p.getByText('عملیات با موفقیت ثبت شد.')).toBeVisible();
  await ctx.close();
}
const attach = async (p: Page) => {
  await p.getByRole('dialog').locator('input[type=file]').setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(p.getByRole('dialog').getByText('report.pdf')).toBeVisible();
};

test.beforeAll(async () => {
  w = await seed([
    { u: U('sup'), roles: ['professor'], cap: 3 }, { u: U('gm'), roles: ['group_manager', 'professor'] },
    { u: U('go'), roles: ['graduate_office'] }, { u: U('r1'), roles: ['reviewer'] }, { u: U('r2'), roles: ['reviewer'] }, { u: U('px'), roles: ['professor'] },
  ]);
  await ok('adminUpdateUser', {
    token: w.admin, username: U('stu'), tempPassword: 'Temp12345a', fullName: 'دانشجوی آزمون', roles: ['student'], departmentId: w.dep, programId: null,
    studentNumber: '4051234', degree: 'ارشد', programName: 'مهندسی کامپیوتر', academicRank: '', baseCapacity: 0, eligibleForThesis: true, disabled: false,
  });
});

test('topic registration → graduation', async ({ page, browser }) => {
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

  // 4) Remaining stages, each with that role's own session: approvals/decisions are clicked in the browser (uiAct);
  //    student uploads, reviewer assignment, reviews and defense scheduling go through the real API.
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
      case 'WAITING_SUPERVISOR': await uiAct(browser, U('sup'), id, 'پذیرش راهنمایی'); break;
      case 'GROUP_REVIEW': await uiAct(browser, U('gm'), id, 'تأیید موضوع'); break;
      case 'LITERATURE_REVIEW': await ok('submitDocument', { token: stu, kind: 'literature', content: 'پیشینهٔ تحقیق '.repeat(20), files }); break;
      case 'LITERATURE_SUPERVISOR_REVIEW': await uiAct(browser, U('sup'), id, 'تأیید پیشینه (استاد راهنما)'); break;
      case 'LITERATURE_GROUP_REVIEW': await uiAct(browser, U('gm'), id, 'تأیید نهایی پیشینه'); break;
      case 'PROPOSAL_DRAFT': await ok('submitDocument', { token: stu, kind: 'proposal', content: 'متن پروپوزال '.repeat(20), files, formAnswers: {} }); break;
      case 'PROPOSAL_REVIEW':
        for (const tk of [sup, gm, go]) {
          const a = (await ok<{ allowedActions: string[] }>('thesisDetail', { token: tk, thesisId: id })).allowedActions;
          if (a.includes('proposal_approve')) { await uiAct(browser, Object.keys(T).find((k) => T[k] === tk)!, id, 'تأیید پروپوزال'); break; }
        }
        break;
      case 'IRANDOC_PENDING': await ok('submitIranDoc', { token: stu, trackingCode: `IRD-${sfx}`, registeredOn: '2026-10-01', receipt: files, certificate: files }); break;
      case 'IRANDOC_REVIEW': await uiAct(browser, U('go'), id, 'تأیید ایرانداک و تصویب نهایی'); break;
      case 'THESIS_ACTIVE': await ok('submitDocument', { token: stu, kind: 'final', content: 'نسخهٔ نهایی پایان‌نامه برای بررسی استاد راهنما', files }); break;
      case 'FINAL_SUPERVISOR_REVIEW': await uiAct(browser, U('sup'), id, 'تأیید نسخهٔ نهایی'); break;
      case 'PLAGIARISM_CHECK': await uiAct(browser, U('go'), id, 'ثبت همانندجویی (قبول)', async (p) => { await p.locator('#sim').fill('9'); await attach(p); }); break;
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
      case 'DEFENSE_SCHEDULED': await uiAct(browser, U('go'), id, 'ثبت نتیجهٔ دفاع و صدور صورتجلسه', async (p) => { await p.locator('#sc').fill('19'); }); break;
      case 'DEFENDED': await uiAct(browser, U('sup'), id, 'تأیید تکمیل پایان‌نامه (پس از اصلاحات دفاع)'); break;
      case 'THESIS_COMPLETED': await uiAct(browser, U('go'), id, 'آغاز فرآیند فارغ‌التحصیلی'); break;
      case 'GRADUATION_PROCESS': {
        const list = await ok<{ items: { id: string }[] }>('graduationItems', { token: stu, thesisId: id, op: 'list' });
        for (const it of list.items) {
          await ok('graduationItems', { token: stu, thesisId: id, op: 'submit', itemId: it.id, files });
          await ok('graduationItems', { token: go, thesisId: id, op: 'verify', itemId: it.id });
        }
        await uiAct(browser, U('go'), id, 'تأیید فارغ‌التحصیلی و بستن پرونده');
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

  expect(errors, errors.join('\n')).toEqual([]);

  // 7) Access control in the browser: student cannot reach admin/report pages or another case; anonymous API → 401
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await uiLogin(page, U('stu'), 'Shomal1405x');
  for (const path of ['/admin/users', '/admin/audit', '/admin/config', '/reports', '/theses']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'دسترسی غیرمجاز' })).toBeVisible();
  }
  expect((await (await fetch('http://127.0.0.1:3100/api/runReminders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'invalid-session', dryRun: true }) })).status)).toBe(401);
  const other = await ok<{ token: string }>('login', { username: U('px'), password: 'Shomal1405x' });
  const denied = await fetch('http://127.0.0.1:3100/api/thesisDetail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: other.token, thesisId: id }) });
  expect([403, 404]).toContain(denied.status);

  // 8) Responsive: no horizontal overflow on the main pages at every required viewport
  for (const [wd, ht] of [[360, 800], [390, 844], [412, 915], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width: wd, height: ht });
    for (const path of ['/', `/thesis/${id}`, '/profile']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) await page.screenshot({ path: `test-results/overflow-${wd}-${path.replace(/\W/g, '_')}.png`, fullPage: true });
      expect(over, `overflow ${wd}x${ht} ${path}`).toBeLessThanOrEqual(1);
    }
  }
});
