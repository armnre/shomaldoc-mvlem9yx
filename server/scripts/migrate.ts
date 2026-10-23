// Applies db/schema.sql (idempotent) and migrates legacy public file URLs to the authenticated route.
// Usage: npm run migrate
import { readFile } from 'node:fs/promises';
import meta from '../src/meta.json' with { type: 'json' };
import { pool } from '../src/shims/runtime';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema applied.');

// "/files/<key>" or "https://host/files/<key>"  →  "/api/_file/<key>"
let changed = 0;
for (const [table, t] of Object.entries(meta as Record<string, { fields: Record<string, { kind: string }> }>)) {
  for (const [col, d] of Object.entries(t.fields)) {
    if (d.kind !== 'attachments') continue;
    const r = await pool.query(
      `UPDATE "${table}" SET "${col}" = regexp_replace("${col}"::text, '"(https?://[^"/]+)?/files/', '"/api/_file/', 'g')::jsonb
       WHERE "${col}"::text ~ '"(https?://[^"/]+)?/files/'`,
    );
    changed += r.rowCount ?? 0;
  }
}
console.log(`Legacy file URLs migrated: ${changed} row(s).`);
await pool.end();
