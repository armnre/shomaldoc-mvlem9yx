// Must be the first import of src/index.ts: sets the hooks lib/server.ts reads at module load.
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { pool } from './shims/runtime';

const major = Number(process.versions.node.split('.')[0]);
if (major !== 20 && major !== 22) {
  console.error(`ShomalDoc requires Node.js 20 or 22 (found ${process.versions.node}).`);
  process.exit(1);
}

/** Per-request context (session token) used by the file store to record who created a file. */
export const requestCtx = new AsyncLocalStorage<{ token?: string }>();

const g = globalThis as Record<string, unknown>;
g.__shomalPbkdf2Iter = Number(process.env.PBKDF2_ITERATIONS ?? 600_000);
g.__shomalInternalKey = randomBytes(32).toString('hex');

/** Capacity race guard: holds a row lock on the professor's profile for the duration of fn. */
g.__shomalWithProfileLock = async <T>(profileId: string, fn: () => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM "Profiles" WHERE id::text = $1 FOR UPDATE', [profileId]);
    const out = await fn();
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

export const INTERNAL_KEY = g.__shomalInternalKey as string;
