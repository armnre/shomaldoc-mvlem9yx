// Idempotent seed of Master's programs (کارشناسی ارشد) into the existing "Programs" table.
// Usage (from server/):  set -a; . ./.env; set +a; npx tsx --tsconfig tsconfig.json scripts/seed-masters-programs.ts [--dry-run]
// - Additive only: adds nullable column "faculty" if missing; never deletes or deactivates existing rows.
// - Natural key: (degree, name, COALESCE(specialization,'')). Re-running creates no duplicates.
import { readFile } from 'node:fs/promises';
import { pool } from '../src/shims/runtime';

const DEGREE = 'کارشناسی ارشد';
const dry = process.argv.includes('--dry-run');
const src = JSON.parse(await readFile(new URL('../db/seed/masters-programs.json', import.meta.url), 'utf8'));
const rows: { faculty: string; name: string; specialization: string | null }[] = src.programs;

// validation against source counts
if (src.degree !== DEGREE) throw new Error('degree mismatch');
if (rows.length !== src.counts.mastersRows) throw new Error('row count mismatch');
const keys = new Set(rows.map((r) => r.name + '|' + (r.specialization ?? '')));
if (keys.size !== rows.length) throw new Error('duplicate rows in seed');
if (new Set(rows.map((r) => r.faculty + '|' + r.name)).size !== src.counts.uniqueMajors) throw new Error('unique major count mismatch');

const client = await pool.connect();
let inserted = 0, existing = 0;
try {
  await client.query('BEGIN');
  await client.query('ALTER TABLE "Programs" ADD COLUMN IF NOT EXISTS "faculty" text');
  for (const r of rows) {
    const found = await client.query(
      'SELECT id FROM "Programs" WHERE "degree" = $1 AND "name" = $2 AND COALESCE("specialization", \'\') = $3 LIMIT 1',
      [DEGREE, r.name, r.specialization ?? ''],
    );
    if (found.rowCount) {
      existing++;
      await client.query('UPDATE "Programs" SET "faculty" = COALESCE("faculty", $2) WHERE id = $1', [found.rows[0].id, r.faculty]);
      continue;
    }
    await client.query(
      'INSERT INTO "Programs" ("name","specialization","degree","faculty","isActive") VALUES ($1,$2,$3,$4,true)',
      [r.name, r.specialization, DEGREE, r.faculty],
    );
    inserted++;
  }
  await client.query(dry ? 'ROLLBACK' : 'COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
console.log(`${dry ? '[dry-run] ' : ''}Masters programs: ${inserted} inserted, ${existing} already present (of ${rows.length}).`);
await pool.end();
