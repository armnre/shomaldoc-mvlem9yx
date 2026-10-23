// Authenticated file storage: upload with magic-byte validation, download only through canView on the owning case.
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { zite } from 'zitejs/db';
import meta from './meta.json' with { type: 'json' };
import { authenticate, canView } from '../../apps/app/src/lib/server';
import { pool } from './shims/runtime';
import { UPLOAD_DIR } from './shims/pdf';

export const FILE_PREFIX = '/api/_file/';
const KEY_RE = /^[A-Za-z0-9._-]{1,200}$/;

type Kind = { ext: string[]; mime: string };
const KINDS: Record<string, Kind> = {
  pdf: { ext: ['.pdf'], mime: 'application/pdf' },
  doc: { ext: ['.doc'], mime: 'application/msword' },
  docx: { ext: ['.docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  jpg: { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg' },
  png: { ext: ['.png'], mime: 'image/png' },
};

/** Detects the real file type from its first bytes. */
export function sniff(buf: Buffer): keyof typeof KINDS | null {
  const b = (...xs: number[]) => xs.every((x, i) => buf[i] === x);
  if (b(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf';
  if (b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (b(0xff, 0xd8, 0xff)) return 'jpg';
  if (b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'doc';
  if (b(0x50, 0x4b, 0x03, 0x04) && buf.includes(Buffer.from('word/'))) return 'docx';
  return null;
}

export function tokenFrom(req: Request) {
  const cookie = /(?:^|;\s*)sd_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  return (req.get('x-session-token') ?? (cookie ? decodeURIComponent(cookie) : '') ?? '').trim();
}

const metaPath = (key: string) => path.join(UPLOAD_DIR, `.${key}.json`);
export async function saveFile(buf: Buffer, originalName: string, ownerId: string | null, mime: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^.\w]/g, '');
  const key = `${randomUUID()}${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, key), buf, { mode: 0o640 });
  await writeFile(metaPath(key), JSON.stringify({ owner: ownerId, filename: originalName, mime, createdAt: new Date().toISOString() }), { mode: 0o640 });
  return key;
}

export async function handleUpload(req: Request, res: Response) {
  const fail = (status: number, msg: string) => res.status(status).json({ code: status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST', userFacingMessage: msg });
  let profileId: string;
  try { profileId = (await authenticate(tokenFrom(req))).profile.id; } catch { return fail(401, 'برای بارگذاری فایل ابتدا وارد شوید.'); }
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) return fail(400, 'فایلی دریافت نشد یا حجم آن بیش از حد مجاز است.');
  const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const kind = sniff(file.buffer);
  const ext = path.extname(name).toLowerCase();
  if (!kind || !KINDS[kind].ext.includes(ext)) return fail(400, 'نوع فایل مجاز نیست. فقط PDF، Word (DOC/DOCX)، JPG و PNG پذیرفته می‌شود و پسوند باید با محتوای فایل مطابقت داشته باشد.');
  const key = await saveFile(file.buffer, name, profileId, KINDS[kind].mime);
  res.json({ url: FILE_PREFIX + key, filename: name });
}

type TableMeta = { fields: Record<string, { kind: string; table?: string; self?: string; other?: string; target?: string }> };
const q = (s: string) => `"${s.replace(/"/g, '')}"`;

/** file key → records that reference it → thesis ids. */
export async function thesisIdsForFile(key: string) {
  const ids = new Set<string>();
  for (const [table, t] of Object.entries(meta as Record<string, TableMeta>)) {
    const cols = Object.entries(t.fields).filter(([, d]) => d.kind === 'attachments').map(([f]) => f);
    if (!cols.length) continue;
    const link = table === 'Theses' ? null : Object.values(t.fields).find((d) => d.kind === 'link' && d.target === 'Theses');
    if (table !== 'Theses' && !link) continue;
    const sel = table === 'Theses' ? 'r.id::text AS tid' : `l.${q(link!.other!)}::text AS tid`;
    const join = table === 'Theses' ? '' : `JOIN ${q(link!.table!)} l ON l.${q(link!.self!)} = r.id`;
    const { rows } = await pool.query(`SELECT ${sel} FROM ${q(table)} r ${join} WHERE ${cols.map((c) => `r.${q(c)}::text LIKE $1`).join(' OR ')}`, [`%${key}%`]);
    rows.forEach((r) => r.tid && ids.add(r.tid));
  }
  return [...ids];
}

export async function handleDownload(req: Request, res: Response) {
  const key = req.params.key;
  const deny = (status: number, msg: string) => res.status(status).json({ code: status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', userFacingMessage: msg });
  if (!KEY_RE.test(key) || key.startsWith('.')) return deny(404, 'فایل یافت نشد.');
  let profile;
  try { profile = (await authenticate(tokenFrom(req) || String(req.query.token ?? ''))).profile; } catch { return deny(401, 'برای دریافت فایل ابتدا وارد شوید.'); }
  const full = path.join(UPLOAD_DIR, key);
  const st = await stat(full).catch(() => null);
  if (!st?.isFile()) return deny(404, 'فایل یافت نشد.');
  const info = JSON.parse(await readFile(metaPath(key), 'utf8').catch(() => '{}')) as { owner?: string; filename?: string; mime?: string };

  let allowed = info.owner === profile.id;
  if (!allowed) {
    for (const tid of await thesisIdsForFile(key)) {
      const t = await zite.theses.findOne({ id: tid });
      if (t && (await canView(profile, t))) { allowed = true; break; }
    }
  }
  if (!allowed) return deny(403, 'شما به این فایل دسترسی ندارید.');
  const kind = sniff(await readFile(full).then((b) => b.subarray(0, 4096)));
  const mime = info.mime ?? (kind ? KINDS[kind].mime : 'application/octet-stream');
  const inline = /^(application\/pdf|image\/(png|jpeg))$/.test(mime);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', String(st.size));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(info.filename ?? key)}`);
  createReadStream(full).pipe(res);
}
