#!/usr/bin/env node
/**
 * Sanity checks for migrations 0013 + 0014 (Reviews & Ratings, SP6).
 * Usage: DATABASE_URL=... node scripts/verify-reviews.mjs
 */
import pg from 'pg';
import { exit } from 'node:process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL env var required');
  exit(2);
}

const url = new URL(databaseUrl);
const client = new pg.Client({
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  host: url.hostname,
  port: Number(url.port || 5432),
  database: url.pathname.replace(/^\//, ''),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const checks = [
  { name: 'reviews table exists', sql: `select 1 from information_schema.tables where table_schema='public' and table_name='reviews'`, expect: 1 },
  { name: 'reviews_club_published_idx partial index exists', sql: `select 1 from pg_indexes where schemaname='public' and indexname='reviews_club_published_idx'`, expect: 1 },
  { name: 'reviews_user_idx exists', sql: `select 1 from pg_indexes where schemaname='public' and indexname='reviews_user_idx'`, expect: 1 },
  { name: 'unique constraint on booking_id', sql: `select 1 from pg_constraint where conrelid='public.reviews'::regclass and contype='u' and pg_get_constraintdef(oid) like '%(booking_id)%'`, expect: 1 },
  { name: 'rating CHECK enforces 1..5', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_rating_check'`, customCheck: (rows) => { const d = rows[0]?.def ?? ''; return /rating/.test(d) && /\b1\b/.test(d) && /\b5\b/.test(d); } },
  { name: 'text CHECK enforces length 10..1000', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.reviews'::regclass and conname='reviews_text_check'`, customCheck: (rows) => { const d = rows[0]?.def ?? ''; return /length\(text\)/.test(d) && /\b10\b/.test(d) && /\b1000\b/.test(d); } },
  { name: 'reviews has RLS enabled', sql: `select 1 from pg_class where relname='reviews' and relnamespace='public'::regnamespace and relrowsecurity=true`, expect: 1 },
  { name: '6 RLS policies on reviews', sql: `select count(*) from pg_policies where schemaname='public' and tablename='reviews'`, expect: 6 },
  { name: 'recalc_club_rating function exists', sql: `select 1 from pg_proc where pronamespace='public'::regnamespace and proname='recalc_club_rating'`, expect: 1 },
  { name: 'reviews_recalc_rating trigger exists', sql: `select 1 from pg_trigger where tgname='reviews_recalc_rating'`, expect: 1 },
  { name: 'reviews_notify_created trigger exists', sql: `select 1 from pg_trigger where tgname='reviews_notify_created'`, expect: 1 },
  { name: 'outbox event_type CHECK includes review_created', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.notifications_outbox'::regclass and conname='notifications_outbox_event_type_check'`, customCheck: (rows) => (rows[0]?.def ?? '').includes('review_created') },
];

let passed = 0;
let failed = 0;
for (const c of checks) {
  try {
    const r = await client.query(c.sql);
    let ok;
    if (c.customCheck) {
      ok = c.customCheck(r.rows);
    } else if (typeof c.expect === 'number') {
      const n = c.ci ? Number(r.rows[0]?.['?column?'] ?? r.rowCount) : r.rowCount;
      ok = c.expect === 0 ? r.rowCount === 0 : r.rowCount >= 1 && (c.expect === 1 || Number(r.rows[0]?.count ?? r.rowCount) === c.expect);
    } else {
      ok = r.rowCount > 0;
    }
    if (ok) { console.log(`  ✓ ${c.name}`); passed++; }
    else { console.log(`  ✗ ${c.name}`); failed++; }
  } catch (err) {
    console.log(`  ✗ ${c.name} — error: ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${checks.length} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
await client.end();
exit(failed > 0 ? 2 : 0);
