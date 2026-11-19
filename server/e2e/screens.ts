// Responsive audit: logs in as every role, opens every page of its menu on phone/tablet/desktop,
// reports horizontal overflow + console errors and saves screenshots (used for QA and the user guides).
// Run: DATABASE_URL=... CHROMIUM_PATH=... npx tsx --tsconfig tsconfig.json e2e/screens.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { boot, draft, ok, seed, uploadFile } from '../test/helpers';

const OUT = process.env.SHOTS_DIR ?? '/tmp/shots';
const VIEWPORTS = [
  { name: 'phone', width: 360, height: 780 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];
const ROUTES: Record<string, string[]> = {
  student: ['/', '/profile'],
  professor: ['/', '/theses', '/profile'],
  group_manager: ['/', '/theses', '/reports'],
  graduate_office: ['/', '/theses', '/terms', '/reports'],
  reviewer: ['/'],
  finance: ['/', '/theses'],
  admin: ['/', '/theses', '/admin/users', '/admin/departments', '/admin/config', '/terms', '/reports', '/admin/settings', '/admin/audit'],
};

await boot();
const w = await seed([
  { u: 'student1', roles: ['student'] }, { u: 'prof1', roles: ['professor'], cap: 4 }, { u: 'gmanager', roles: ['group_manager'] },
  { u: 'gradoffice', roles: ['graduate_office'] }, { u: 'reviewer1', roles: ['reviewer'] }, { u: 'finance1', roles: ['finance'] },
]);
const file = (await uploadFile(w.tokens.student1)).body;
const thesisId = await draft(w.tokens.student1);
await ok('requestSupervisor', { token: w.tokens.student1, professorId: w.ids.prof1, files: [file] });
ROUTES.professor.push(`/thesis/${thesisId}`);
ROUTES.admin.push(`/thesis/${thesisId}`);

const tokens: Record<string, string> = { ...w.tokens, admin: w.admin };
const userOf: Record<string, string> = { student: 'student1', professor: 'prof1', group_manager: 'gmanager', graduate_office: 'gradoffice', reviewer: 'reviewer1', finance: 'finance1', admin: 'admin' };
const base = (await import('../test/helpers')).url('');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report: string[] = [];

const only = process.env.ROLES?.split(',');
// Login page on every device
for (const vp of only ? [] : VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'fa-IR', deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(base + '/'); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/login-${vp.name}.png` });
  await ctx.close();
}

for (const [role, routes] of Object.entries(ROUTES)) {
  if (only && !only.includes(role)) continue;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'fa-IR', deviceScaleFactor: 2 });
    await ctx.addInitScript(([t, r]) => { localStorage.setItem('shomaldoc-session', t); localStorage.setItem('shomaldoc-role', r); }, [tokens[userOf[role]], role]);
    const p = await ctx.newPage();
    const errs: string[] = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push(e.message));
    for (const r of routes) {
      await p.goto(base + r); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
      const o = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const offenders = [...document.querySelectorAll('body *')].filter((el) => {
          const b = el.getBoundingClientRect();
          if (!b.width) return false;
          let a: Element | null = el.parentElement; // ignore content inside an intentional horizontal scroller
          while (a) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX) && a !== document.body && a !== document.documentElement) return false; a = a.parentElement; }
          return b.right > vw + 1 || b.left < -1;
        }).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 70)}`);
        return { sw: document.documentElement.scrollWidth, vw, offenders };
      });
      const tag = `${role}${r.replace(/\//g, '_').replace(/_thesis_.*/, '_thesis') || '_home'}`;
      await p.screenshot({ path: `${OUT}/${tag}-${vp.name}.png`, fullPage: vp.name !== 'desktop' ? false : false });
      if (o.sw > o.vw + 1 || o.offenders.length) report.push(`OVERFLOW ${role} ${r} ${vp.name}: scroll=${o.sw} vw=${o.vw} ${o.offenders.join(' | ')}`);
    }
    if (errs.length) report.push(`ERRORS ${role} ${vp.name}: ${[...new Set(errs)].slice(0, 3).join(' || ')}`);
    await ctx.close();
  }
}
await browser.close();
await writeFile(`${OUT}/report-${only?.join('-') ?? 'all'}.txt`, report.join('\n') || 'OK');
console.log(report.join('\n') || 'NO RESPONSIVE ISSUES');
process.exit(0);
