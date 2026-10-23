// Recreates the e2e database (run by `npm run test:e2e` before Playwright starts the server).
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = new URL(process.env.E2E_DATABASE_URL ?? 'postgres://shomal:pw@127.0.0.1:5433/shomaldoc_e2e');
const db = url.pathname.slice(1);
const admin = new pg.Client({ connectionString: url.toString().replace(url.pathname, '/postgres') });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${db}"`);
await admin.end();
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
await c.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
await c.end();
console.log('e2e database ready');
