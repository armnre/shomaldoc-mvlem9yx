// Applies db/schema.sql (idempotent). Usage: npm run migrate
import { readFile } from 'node:fs/promises';
import { pool } from '../src/shims/runtime';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema applied.');
await pool.end();
