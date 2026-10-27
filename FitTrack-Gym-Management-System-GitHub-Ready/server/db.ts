import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set. Add it to .env before using the API.');
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : undefined });
export const query = (text: string, params: unknown[] = []) => pool.query(text, params);
