#!/usr/bin/env node
/**
 * Apply a SQL file to a Postgres database.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/apply-sql.mjs <sql-file>
 *
 * Parses DATABASE_URL manually to avoid pg library mis-handling
 * Supabase pooler usernames (which contain dots like "postgres.tenant").
 */
import { readFileSync } from 'node:fs';
import { argv, exit, env } from 'node:process';
import pg from 'pg';

const { Client } = pg;

const file = argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-sql.mjs <sql-file>');
  exit(1);
}
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL env var is required');
  exit(1);
}

const sql = readFileSync(file, 'utf8');

// Manual URL parse to handle Supabase pooler username (contains '.')
const url = new URL(env.DATABASE_URL);
const config = {
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  host: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false },
};

console.log('[apply-sql] connecting as user:', config.user, 'host:', config.host, 'db:', config.database);

const client = new Client(config);

try {
  await client.connect();
  console.log('[apply-sql] connected');

  const result = await client.query(sql);
  const last = Array.isArray(result) ? result[result.length - 1] : result;
  if (last?.rows && last.rows.length > 0) {
    console.log('[apply-sql] final query returned', last.rows.length, 'rows:');
    console.table(last.rows);
  } else {
    console.log('[apply-sql] OK (no rows returned from final statement)');
  }
} catch (err) {
  console.error('[apply-sql] ERROR:', err.message);
  if (err.position) console.error('  at position', err.position);
  if (err.hint) console.error('  hint:', err.hint);
  if (err.code) console.error('  code:', err.code);
  exit(2);
} finally {
  await client.end();
}
