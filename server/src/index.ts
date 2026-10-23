// ShomalDoc self-hosted API server: Express + PostgreSQL.
// Every file in apps/app/src/api becomes POST /api/<name>, exactly like on the Zite platform.
import { requestCtx } from './bootstrap'; // must stay first: sets PBKDF2 / lock / job hooks
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STATUS, ZiteError, type EndpointDef } from './shims/backend';
import { UPLOAD_DIR } from './shims/pdf';
import { pool } from './shims/runtime';
import { handleDownload, handleUpload } from './files';
import { installDeliveryProviders } from './notify';
import { startJobs, runJob } from './jobs';

const here = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(here, '../../apps/app/src/api');
const WEB_DIR = path.resolve(here, '../web-dist');
const PORT = Number(process.env.PORT ?? 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 20);

export const endpoints = new Map<string, EndpointDef>();
for (const f of (await readdir(API_DIR)).filter((f) => f.endsWith('.ts'))) {
  const mod = await import(pathToFileURL(path.join(API_DIR, f)).href);
  endpoints.set(f.replace(/\.ts$/, ''), mod.default);
}
installDeliveryProviders();

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "font-src 'self' data:", "connect-src 'self'", "frame-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  if (req.secure || process.env.FORCE_HSTS === 'true') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '5mb' }));

app.get(['/healthz', '/api/_health'], async (_req, res) => {
  const t0 = Date.now();
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up', dbLatencyMs: Date.now() - t0, endpoints: endpoints.size, uptimeSec: Math.round(process.uptime()) });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: String((e as Error).message ?? e), endpoints: endpoints.size });
  }
});

const limitMsg = (msg: string) => ({ code: 'RATE_LIMITED', userFacingMessage: msg });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: Number(process.env.RATE_LOGIN ?? 10), standardHeaders: 'draft-7', legacyHeaders: false, message: limitMsg('تلاش‌های ورود بیش از حد مجاز است. ۱۵ دقیقه دیگر تلاش کنید.') });
const uploadLimiter = rateLimit({ windowMs: 15 * 60_000, limit: Number(process.env.RATE_UPLOAD ?? 60), standardHeaders: 'draft-7', legacyHeaders: false, message: limitMsg('تعداد بارگذاری‌ها بیش از حد مجاز است. کمی بعد تلاش کنید.') });

// Files: upload needs a valid session; download only via canView on the owning case. No static /files.
await mkdir(UPLOAD_DIR, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
app.post('/api/_upload', uploadLimiter, (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(400).json({ code: 'BAD_REQUEST', userFacingMessage: `حجم فایل بیش از ${MAX_UPLOAD_MB} مگابایت یا درخواست نامعتبر است.` });
  next();
}), wrap(handleUpload));
app.get('/api/_file/:key', wrap(handleDownload));
app.get('/files/:key', wrap(handleDownload)); // legacy URLs: same authenticated check

function setSessionCookie(req: Request, res: Response, token: string | null) {
  const base = `sd_session=${token ? encodeURIComponent(token) : ''}; Path=/api; HttpOnly; SameSite=Strict${req.secure ? '; Secure' : ''}`;
  res.append('Set-Cookie', token ? `${base}; Max-Age=${12 * 3600}` : `${base}; Max-Age=0`);
}

app.post('/api/login', loginLimiter);
app.post('/api/:name', async (req, res) => {
  const name = req.params.name;
  const ep = endpoints.get(name);
  if (!ep) return res.status(404).json({ code: 'NOT_FOUND', message: 'Unknown endpoint', userFacingMessage: 'سرویس درخواستی وجود ندارد.' });
  const parsed = ep.inputSchema.safeParse(req.body ?? {}) as { success: boolean; data?: unknown; error?: { issues?: { path: (string | number)[]; message: string }[] } };
  if (!parsed.success) {
    const fields = [...new Set((parsed.error?.issues ?? []).map((i) => i.path.join('.') || 'ورودی'))].slice(0, 5);
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'Input validation failed', fields, userFacingMessage: `اطلاعات ارسالی نامعتبر است${fields.length ? ` (${fields.join('، ')})` : ''}. لطفاً فرم را بررسی و دوباره ارسال کنید.` });
  }
  const input = parsed.data as Record<string, unknown>;
  const token = typeof input?.token === 'string' ? input.token : undefined;
  try {
    const out = await requestCtx.run({ token }, () => ep.execute({ input, context: { request: { ip: req.ip ?? '', userAgent: req.get('user-agent') ?? '' } } }));
    if (name === 'login' && out && typeof (out as { token?: unknown }).token === 'string') setSessionCookie(req, res, (out as { token: string }).token);
    else if (name === 'logout') setSessionCookie(req, res, null);
    else if (token && !/(?:^|;\s*)sd_session=/.test(req.headers.cookie ?? '')) setSessionCookie(req, res, token);
    res.json(out ?? null);
  } catch (e) {
    const err = e as ZiteError;
    const msg = String((err as Error)?.message ?? '');
    const isSchemaErr = /^(Unknown field|Unsupported filter operator|filter value for)/.test(msg);
    const code = err instanceof ZiteError ? err.code : isSchemaErr ? 'BAD_REQUEST' : (err as { code?: string })?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    if (code === 'INTERNAL_ERROR' || isSchemaErr) console.error(`[${name}]`, e);
    res.status(STATUS[code] ?? 500).json({
      code,
      message: code === 'INTERNAL_ERROR' || isSchemaErr ? 'Request failed' : err.message,
      userFacingMessage: err.userFacingMessage ?? (isSchemaErr ? 'درخواست شامل فیلد یا فیلتر نامعتبر است.' : code === 'INTERNAL_ERROR' ? 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' : err.message),
    });
  }
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[${req.method} ${req.path}]`, err);
  res.status(500).json({ code: 'INTERNAL_ERROR', userFacingMessage: 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' });
});

if (existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/files\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));
}

// `node src/index.ts run-job runReminders` → run once and exit (used by deploy/cron.sh for manual runs).
if (process.argv[2] === 'run-job') {
  const ep = endpoints.get(process.argv[3] ?? '');
  if (!ep) { console.error('Usage: run-job runReminders|runTermControl'); process.exit(2); }
  await runJob(ep, process.argv[3]).then(() => process.exit(0), () => process.exit(1));
} else if (process.env.NODE_ENV !== 'test') {
  startJobs(endpoints);
  const HOST = process.env.HOST ?? '127.0.0.1';
  app.listen(PORT, HOST, () => console.log(`ShomalDoc listening on ${HOST}:${PORT} (${endpoints.size} endpoints)`));
}
