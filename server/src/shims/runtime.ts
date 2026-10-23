// PostgreSQL implementation of the `zitejs/db` client used by every endpoint in apps/app/src/api.
import pg from 'pg';
import meta from '../meta.json' with { type: 'json' };

type Field = { kind: string; table?: string; self?: string; other?: string; target?: string };
type Table = { accessor: string; fields: Record<string, Field> };
const TABLES = meta as Record<string, Table>;

// Return DATE columns as 'YYYY-MM-DD' strings and timestamps as ISO strings, matching the platform.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString());
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL ?? 10) });

const q = (id: string) => `"${id.replace(/"/g, '')}"`;

function toDb(f: Field, v: unknown) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return f.kind === 'text' ? (v ?? null) : null;
  switch (f.kind) {
    case 'number': return Number(v);
    case 'boolean': return v === true || v === 'true';
    case 'json': return JSON.stringify(Array.isArray(v) || typeof v === 'object' ? v : [v]);
    case 'attachments': {
      const list = (Array.isArray(v) ? v : [v]).map((a: any) => typeof a === 'string' ? { url: a } : a)
        .filter((a: any) => a?.url && /^(https?:\/\/|\/)/.test(a.url))
        .map((a: any) => {
          const filename = a.filename ?? decodeURIComponent(a.url.split('/').pop() ?? 'file');
          return { filename, originalName: a.originalName ?? filename, size: a.size ?? 0, mimeType: a.mimeType ?? '', url: a.url, uploadedAt: a.uploadedAt ?? new Date().toISOString() };
        });
      return JSON.stringify(list);
    }
    default: return v;
  }
}

function linkIds(v: unknown): string[] {
  if (v == null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
}

function selectSql(name: string) {
  const t = TABLES[name];
  const cols = ['t.id', 't.created_at', 't.updated_at'];
  for (const [f, d] of Object.entries(t.fields)) {
    if (d.kind === 'link') cols.push(`COALESCE((SELECT array_agg(l.${q(d.other!)}::text) FROM ${q(d.table!)} l WHERE l.${q(d.self!)} = t.id), '{}') AS ${q(f)}`);
    else cols.push(`t.${q(f)}`);
  }
  return `SELECT ${cols.join(', ')} FROM ${q(name)} t`;
}

function clean(row: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) if (v !== null && !(Array.isArray(v) && v.length === 0 && k !== 'id')) out[k] = v;
  return out;
}

function where(name: string, filters: Record<string, any> | undefined, params: unknown[]) {
  const t = TABLES[name];
  const parts: string[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  for (const [key, raw] of Object.entries(filters ?? {})) {
    if (raw === undefined) throw new Error(`filter value for "${key}" is undefined`);
    if (key === 'id') { parts.push(cond('t.id::text', { kind: 'text' }, raw, p)); continue; }
    const f = t.fields[key];
    if (!f) throw new Error(`Unknown field ${name}.${key}`);
    if (f.kind === 'link') {
      const sub = (op: string, v: unknown) => `${op} EXISTS (SELECT 1 FROM ${q(f.table!)} l WHERE l.${q(f.self!)} = t.id AND l.${q(f.other!)}::text ${Array.isArray(v) ? `= ANY(${p(v.map(String))})` : `= ${p(String(v))}`})`;
      if (raw === null) parts.push(`NOT EXISTS (SELECT 1 FROM ${q(f.table!)} l WHERE l.${q(f.self!)} = t.id)`);
      else if (typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [op, v] of Object.entries(raw)) {
          if (op === 'not' && v === null) parts.push(`EXISTS (SELECT 1 FROM ${q(f.table!)} l WHERE l.${q(f.self!)} = t.id)`);
          else if (op === 'in' || op === 'contains') parts.push((v as any[])?.length === 0 ? 'FALSE' : sub('', v));
          else if (op === 'not' || op === 'notIn') { if (!(Array.isArray(v) && !v.length)) parts.push(sub('NOT', v)); }
        }
      } else parts.push(sub('', raw));
      continue;
    }
    parts.push(cond(`t.${q(key)}`, f, raw, p));
  }
  return parts.length ? ' WHERE ' + parts.join(' AND ') : '';
}

function cond(col: string, f: Field, raw: any, p: (v: unknown) => string): string {
  const isJson = f.kind === 'json' || f.kind === 'attachments';
  const eq = (v: unknown) => v === null ? `${col} IS NULL` : isJson ? `${col} ? ${p(String(v))}` : `${col} = ${p(toDb(f, v))}`;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return Array.isArray(raw) ? raw.map(eq).join(' AND ') || 'TRUE' : eq(raw);
  const out: string[] = [];
  for (const [op, v] of Object.entries(raw)) {
    switch (op) {
      case 'contains': out.push(isJson ? `${col} ? ${p(String(v))}` : `${col}::text ILIKE ${p(`%${v}%`)}`); break;
      case 'not': out.push(v === null ? `${col} IS NOT NULL` : `(${col} IS NULL OR NOT (${eq(v)}))`); break;
      case 'in': out.push((v as any[]).length ? (isJson ? `${col} ?| ${p((v as any[]).map(String))}` : `${col} = ANY(${p((v as any[]).map((x) => toDb(f, x)))})`) : 'FALSE'); break;
      case 'notIn': if ((v as any[]).length) out.push(isJson ? `NOT (COALESCE(${col}, '[]') ?| ${p((v as any[]).map(String))})` : `(${col} IS NULL OR NOT (${col} = ANY(${p((v as any[]).map((x) => toDb(f, x)))})))`); break;
      case 'lt': out.push(`${col} < ${p(toDb(f, v))}`); break;
      case 'lte': out.push(`${col} <= ${p(toDb(f, v))}`); break;
      case 'gt': out.push(`${col} > ${p(toDb(f, v))}`); break;
      case 'gte': out.push(`${col} >= ${p(toDb(f, v))}`); break;
      default: throw new Error(`Unsupported filter operator ${op}`);
    }
  }
  return out.join(' AND ') || 'TRUE';
}

async function writeRecord(client: pg.PoolClient, name: string, rec: Record<string, any>, id?: string) {
  const t = TABLES[name];
  const cols: string[] = []; const vals: unknown[] = []; const links: [Field, string[]][] = [];
  for (const [k, v] of Object.entries(rec ?? {})) {
    const f = t.fields[k];
    if (!f || f.kind === 'created' || v === undefined) continue;
    if (f.kind === 'link') { links.push([f, linkIds(v)]); continue; }
    cols.push(q(k)); vals.push(toDb(f, v));
  }
  let rid = id;
  if (!rid) {
    const sql = cols.length
      ? `INSERT INTO ${q(name)} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`
      : `INSERT INTO ${q(name)} DEFAULT VALUES RETURNING id`;
    rid = (await client.query(sql, vals)).rows[0].id as string;
  } else {
    const sets = [...cols.map((c, i) => `${c} = $${i + 2}`), 'updated_at = now()'];
    const r = await client.query(`UPDATE ${q(name)} SET ${sets.join(', ')} WHERE id = $1`, [rid, ...vals]);
    if (!r.rowCount) throw Object.assign(new Error(`Record ${rid} not found in ${name}`), { code: 'NOT_FOUND' });
  }
  for (const [f, ids] of links) {
    await client.query(`DELETE FROM ${q(f.table!)} WHERE ${q(f.self!)} = $1`, [rid]);
    if (ids.length) await client.query(
      `INSERT INTO ${q(f.table!)} (${q(f.self!)}, ${q(f.other!)}) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [rid, ids]);
  }
  return rid!;
}

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

async function readOne(name: string, id: string) {
  const r = await pool.query(`${selectSql(name)} WHERE t.id = $1`, [id]);
  return r.rows[0] ? clean(r.rows[0]) : undefined;
}

const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

export function createTableClient<T = any, _I = any>(name: string) {
  return {
    async findAll(opts: { filters?: Record<string, any>; limit?: number; offset?: number } = {}) {
      const params: unknown[] = [];
      const limit = Math.min(opts.limit ?? 500, 2000);
      const sql = `${selectSql(name)}${where(name, opts.filters, params)} ORDER BY t.created_at DESC LIMIT ${limit + 1} OFFSET ${Number(opts.offset ?? 0)}`;
      const rows = (await pool.query(sql, params)).rows.map(clean);
      return { records: rows.slice(0, limit) as T[], hasMore: rows.length > limit };
    },
    async findOne(opts: { id?: string; filters?: Record<string, any> } = {}) {
      if (opts.id !== undefined) return isUuid(opts.id) ? (await readOne(name, opts.id)) as T | undefined : undefined;
      const params: unknown[] = [];
      const r = await pool.query(`${selectSql(name)}${where(name, opts.filters, params)} ORDER BY t.created_at DESC LIMIT 1`, params);
      return r.rows[0] ? clean(r.rows[0]) as T : undefined;
    },
    async create({ record }: { record: Record<string, any> }) {
      if (!record) throw new Error('Create requires record data');
      const id = await tx((c) => writeRecord(c, name, record));
      return (await readOne(name, id)) as T;
    },
    async update({ id, record }: { id: string; record: Record<string, any> }) {
      if (!id || !record) throw new Error('Update requires id and record data');
      await tx((c) => writeRecord(c, name, record, id));
      return { id, fields: record as Partial<T> };
    },
    async delete({ id }: { id: string }) {
      await pool.query(`DELETE FROM ${q(name)} WHERE id = $1`, [id]);
      return { success: true as const, id };
    },
    async bulkCreate({ records, matchOn }: { records: Record<string, any>[]; matchOn?: string[] }) {
      if (records.length > 100) throw new Error('bulkCreate accepts at most 100 records');
      const ids = await tx(async (c) => {
        const out: string[] = [];
        for (const rec of records) {
          let existing: string | undefined;
          if (matchOn?.length) {
            const params: unknown[] = [];
            const f = Object.fromEntries(matchOn.map((k) => [k, rec[k] ?? null]));
            existing = (await c.query(`SELECT t.id FROM ${q(name)} t${where(name, f, params)} LIMIT 1`, params)).rows[0]?.id;
          }
          out.push(await writeRecord(c, name, rec, existing));
        }
        return out;
      });
      const recs = await Promise.all(ids.map((id) => readOne(name, id)));
      return { success: true, records: recs as T[] };
    },
  };
}

export function createSqlClient() {
  return async ({ query, params }: { query: string; params?: unknown[] }) => {
    if (!/^\s*(WITH|SELECT)\b/i.test(query)) throw new Error('zite.sql accepts SELECT statements only');
    const c = await pool.connect();
    try {
      await c.query('BEGIN READ ONLY');
      await c.query(`SET LOCAL statement_timeout = 10000`);
      const r = await c.query(query, params ?? []);
      await c.query('COMMIT');
      const rows = r.rows.slice(0, 2000);
      return { rows, rowCount: rows.length, truncated: r.rows.length > 2000, columns: r.fields.map((f) => ({ name: f.name, originalName: f.name })) };
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; }
    finally { c.release(); }
  };
}

export function createAuthClient<T>() {
  const no = async (): Promise<never> => { throw new Error('zite.auth is not used by ShomalDoc (it has its own login).'); };
  return { findAllUsers: no as (...a: any[]) => Promise<{ records: T[]; total: number; hasMore: boolean }>, updateUserProfile: no };
}
