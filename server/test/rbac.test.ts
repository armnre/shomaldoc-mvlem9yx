// Every role gets 403 on every endpoint outside its permission set (server-side RBAC).
import { beforeAll, describe, expect, it } from 'vitest';
import { boot, call, seed, uniq, type World } from './helpers';

const ROLES = ['student', 'professor', 'group_manager', 'graduate_office', 'finance', 'reviewer'] as const;
type R = (typeof ROLES)[number] | 'admin';
const f = [{ url: '/api/_file/x.pdf', filename: 'x.pdf' }];

// [endpoint, allowed roles, input]
const CASES: [string, R[], Record<string, unknown>][] = [
  ['adminListUsers', ['admin'], {}],
  ['adminAuditLog', ['admin'], {}],
  ['adminSettings', ['admin'], {}],
  ['adminSaveDepartment', ['admin'], { name: 'x', faculty: 'y' }],
  ['adminResetPassword', ['admin'], { profileId: '00000000-0000-0000-0000-000000000000', tempPassword: 'Temp12345a' }],
  ['notificationAdmin', ['admin'], {}],
  ['reminderRules', ['admin'], {}],
  ['academicTerms', ['admin', 'graduate_office'], {}],
  ['runReminders', ['admin', 'graduate_office'], { dryRun: true }],
  ['runTermControl', ['admin', 'graduate_office'], { dryRun: true }],
  ['dashboardStats', ['admin'], { scope: 'admin' }],
  ['reports', ['admin'], { scope: 'admin' }],
  ['reportTheses', ['admin'], { scope: 'admin', op: 'rows' }],
  ['reports', ['graduate_office'], { scope: 'graduate_office' }],
  ['reportTheses', ['group_manager'], { scope: 'group_manager', op: 'rows' }],
  ['listTheses', ['admin'], { scope: 'admin' }],
  ['listTheses', ['finance'], { scope: 'finance' }],
  ['saveThesisDraft', ['student'], { titleFa: 'x', titleEn: 'x', keywords: 'x', problemStatement: 'x', objectives: 'x' }],
  ['requestSupervisor', ['student'], { professorId: 'x', files: f }],
  ['submitDocument', ['student'], { kind: 'literature', content: 'x', files: f }],
  ['submitIranDoc', ['student'], { trackingCode: '1', registeredOn: '2026-01-01', receipt: f, certificate: f }],
  ['requestExtension', ['student'], { reason: 'x', documents: f }],
  ['requestTopicChange', ['student'], { newTitle: 'x', newTitleEn: 'x', reason: 'x', files: f }],
];

let w: World;
const user = (r: string) => `rbac_${r}_${suffix}`;
const suffix = uniq('');
beforeAll(async () => {
  await boot();
  w = await seed(ROLES.map((r) => ({ u: user(r), roles: [r] })));
});

describe('403 for every role outside the allowed set', () => {
  for (const role of ROLES) {
    it(`role: ${role}`, async () => {
      const checked: string[] = [];
      for (const [ep, allowed, input] of CASES) {
        if (allowed.includes(role)) continue;
        const r = await call(ep, { token: w.tokens[user(role)], ...input });
        expect(r.status, `${role} → ${ep} (${JSON.stringify(input).slice(0, 40)}) returned ${r.status}: ${r.body?.userFacingMessage}`).toBe(403);
        checked.push(ep);
      }
      expect(checked.length).toBeGreaterThan(5);
    });
  }
  it('unauthenticated calls get 401', async () => {
    expect((await call('adminListUsers', { token: '' })).status).toBe(401);
    expect((await call('saveThesisDraft', { token: 'bogus', titleFa: 'x', titleEn: 'x', keywords: 'x', problemStatement: 'x', objectives: 'x' })).status).toBe(401);
  });
});
