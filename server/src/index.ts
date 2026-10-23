// ShomalDoc self-hosted API server: Express + PostgreSQL.
// Every file in apps/app/src/api becomes POST /api/<name>, exactly like on the Zite platform.
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STATUS, ZiteError, type EndpointDef } from './shims/backend';
import { UPLOAD_DIR } from './shims/pdf';
import { pool } from './shims/runtime';

const here = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(here, '../../apps/app/src/api');
const WEB_DIR = path.resolve(here, '../web-dist');
const PORT = Number(process.env.PORT ?? 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 20);

const endpoints = new Map<string, EndpointDef>();
for (const f of (await readdir(API_DIR)).filter((f) => f.endsWith('.ts'))) {
  const mod = await import(pathToFileURL(path.join(API_DIR, f)).href);
  endpoints.set(f.replace(/\.ts$/, ''), mod.default);
}
console.log(`Loaded ${endpoints.size} endpoints`);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '5mb' }));

app.get('/healthz', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, endpoints: endpoints.size });
});

// File uploads (replacement for the platform's useUpload)
await mkdir(UPLOAD_DIR, { recursive: true });
const ALLOWED = /\.(pdf|docx?|jpe?g|png)$/i;
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.test(file.originalname)),
});
app.post('/api/_upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 'BAD_REQUEST', userFacingMessage: 'نوع یا حجم فایل مجاز نیست.' });
  res.json({ url: `/files/${req.file.filename}`, filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8') });
});
app.use('/files', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));

app.post('/api/:name', async (req, res) => {
  const ep = endpoints.get(req.params.name);
  if (!ep) return res.status(404).json({ code: 'NOT_FOUND', message: 'Unknown endpoint' });
  try {
    const parsed = ep.inputSchema.safeParse(req.body ?? {});
    const input = parsed.success ? parsed.data : req.body ?? {};
    const out = await ep.execute({ input, context: { request: { ip: req.ip ?? '', userAgent: req.get('user-agent') ?? '' } } });
    res.json(out ?? null);
  } catch (e) {
    const err = e as ZiteError;
    const code = err instanceof ZiteError ? err.code : (err as any)?.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    if (code === 'INTERNAL_ERROR') console.error(`[${req.params.name}]`, e);
    res.status(STATUS[code] ?? 500).json({
      code,
      message: code === 'INTERNAL_ERROR' ? 'Internal error' : err.message,
      userFacingMessage: err.userFacingMessage ?? (code === 'INTERNAL_ERROR' ? 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' : err.message),
    });
  }
});

if (existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/files\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));
}

app.listen(PORT, () => console.log(`ShomalDoc listening on :${PORT}`));
