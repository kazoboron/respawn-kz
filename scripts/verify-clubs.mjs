/**
 * Verify clubs migrations + seed applied correctly.
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
  { name: 'clubs table exists', sql: `select to_regclass('public.clubs') as t`, expect: (r) => r[0].t === 'clubs' },
  { name: 'clubs has 12 rows', sql: `select count(*)::int as c from clubs`, expect: (r) => r[0].c === 12 },
  { name: 'clubs RLS enabled', sql: `select rowsecurity from pg_tables where schemaname='public' and tablename='clubs'`, expect: (r) => r[0].rowsecurity === true },
  { name: 'clubs has 5 policies', sql: `select count(*)::int as c from pg_policies where schemaname='public' and tablename='clubs'`, expect: (r) => r[0].c === 5 },
  { name: 'FK club_admins → clubs', sql: `select count(*)::int as c from pg_constraint where conrelid='public.club_admins'::regclass and conname='club_admins_club_slug_fkey'`, expect: (r) => r[0].c === 1 },
  { name: 'FK bookings → clubs', sql: `select count(*)::int as c from pg_constraint where conrelid='public.bookings'::regclass and conname='bookings_club_slug_fkey'`, expect: (r) => r[0].c === 1 },
  { name: 'slot validation trigger', sql: `select count(*)::int as c from pg_trigger where tgrelid='public.bookings'::regclass and tgname='bookings_slot_validation'`, expect: (r) => r[0].c === 1 },
  { name: 'status trigger still present', sql: `select count(*)::int as c from pg_trigger where tgrelid='public.bookings'::regclass and tgname='bookings_status_transition_check'`, expect: (r) => r[0].c === 1 },
  { name: 'approve_club_application RPC exists', sql: `select count(*)::int as c from pg_proc where proname='approve_club_application'`, expect: (r) => r[0].c === 1 },
  { name: 'sample club has working_hours jsonb', sql: `select working_hours from clubs where slug='cyberzone' limit 1`, expect: (r) => typeof r[0].working_hours === 'object' && r[0].working_hours.mon !== undefined },
  { name: 'cyberzone is 24h', sql: `select working_hours->'mon'->>'open' as op from clubs where slug='cyberzone'`, expect: (r) => r[0].op === '24h' },
  { name: 'gamerhub has 10:00 open', sql: `select working_hours->'mon'->>'open' as op from clubs where slug='gamerhub'`, expect: (r) => r[0].op === '10:00' },
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
