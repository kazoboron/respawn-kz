/**
 * Verify B2B cabinet migrations applied correctly.
 */
import { exit, env } from 'node:process';
import pg from 'pg';

const { Client } = pg;

const url = new URL(env.DATABASE_URL);
const client = new Client({
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  host: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const checks = [
  // Table existence
  { name: 'super_admins exists', sql: `select to_regclass('public.super_admins') as t`, expect: (r) => r[0].t === 'super_admins' },
  { name: 'club_admins exists', sql: `select to_regclass('public.club_admins') as t`, expect: (r) => r[0].t === 'club_admins' },
  { name: 'club_applications exists', sql: `select to_regclass('public.club_applications') as t`, expect: (r) => r[0].t === 'club_applications' },
  // Booking status enum has 5 values
  { name: 'bookings status has completed', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.bookings'::regclass and contype='c' and conname='bookings_status_check'`, expect: (r) => /completed/.test(r[0].def) && /no_show/.test(r[0].def) },
  // Audit columns added to bookings
  { name: 'bookings.status_changed_at exists', sql: `select column_name from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='status_changed_at'`, expect: (r) => r.length === 1 },
  { name: 'bookings.status_changed_by exists', sql: `select column_name from information_schema.columns where table_schema='public' and table_name='bookings' and column_name='status_changed_by'`, expect: (r) => r.length === 1 },
  // Trigger
  { name: 'bookings status trigger exists', sql: `select trigger_name from information_schema.triggers where event_object_table='bookings' and trigger_name='bookings_status_transition_check'`, expect: (r) => r.length === 1 },
  // RLS enabled
  { name: 'super_admins RLS enabled', sql: `select rowsecurity from pg_tables where schemaname='public' and tablename='super_admins'`, expect: (r) => r[0].rowsecurity === true },
  { name: 'club_admins RLS enabled', sql: `select rowsecurity from pg_tables where schemaname='public' and tablename='club_admins'`, expect: (r) => r[0].rowsecurity === true },
  { name: 'club_applications RLS enabled', sql: `select rowsecurity from pg_tables where schemaname='public' and tablename='club_applications'`, expect: (r) => r[0].rowsecurity === true },
  // Super admin seeded
  { name: 'super_admins has 1 row (zhandos)', sql: `select count(*)::int as c from super_admins`, expect: (r) => r[0].c === 1 },
];

let passed = 0, failed = 0;
for (const c of checks) {
  try {
    const r = await client.query(c.sql);
    if (c.expect(r.rows)) {
      console.log(`  ✓ ${c.name}`);
      passed++;
    } else {
      console.log(`  ✗ ${c.name} — got:`, r.rows);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ ${c.name} — error:`, err.message);
    failed++;
  }
}

console.log(`\n${passed}/${checks.length} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);
await client.end();
exit(failed > 0 ? 2 : 0);
