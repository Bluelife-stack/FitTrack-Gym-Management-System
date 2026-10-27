import { readFile } from 'node:fs/promises';
import { pool } from './db.js';
const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
await pool.query(schema);
console.log('FitTrack schema initialized successfully.');
await pool.end();
