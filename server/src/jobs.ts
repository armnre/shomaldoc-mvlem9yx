// In-process scheduler: replaces the admin-token cron. Jobs call the endpoints with the per-boot internal key.
import cron from 'node-cron';
import type { EndpointDef } from './shims/backend';
import { INTERNAL_KEY } from './bootstrap';

export function startJobs(endpoints: Map<string, EndpointDef>) {
  if (process.env.DISABLE_JOBS === 'true') return console.log('[jobs] disabled (DISABLE_JOBS=true)');
  const tz = process.env.TZ_JOBS ?? 'Asia/Tehran';
  const jobs: [string, string, string][] = [
    ['runReminders', process.env.CRON_REMINDERS ?? '0 7 * * *', 'یادآوری‌های روزانه'],
    ['runTermControl', process.env.CRON_TERM ?? '30 3 * * *', 'کنترل پایان ترم'],
  ];
  for (const [name, expr, label] of jobs) {
    const ep = endpoints.get(name);
    if (!ep) continue;
    cron.schedule(expr, () => runJob(ep, name, label), { timezone: tz });
    console.log(`[jobs] ${name} scheduled "${expr}" (${tz})`);
  }
}

export async function runJob(ep: EndpointDef, name: string, label = name) {
  const t0 = Date.now();
  try {
    const out = await ep.execute({ input: { token: INTERNAL_KEY, dryRun: false }, context: { request: { ip: '127.0.0.1', userAgent: 'shomaldoc-cron' } } });
    console.log(`[jobs] ${label} done in ${Date.now() - t0}ms`, JSON.stringify(out).slice(0, 300));
    return out;
  } catch (e) {
    console.error(`[jobs] ${label} failed`, e);
    throw e;
  }
}
