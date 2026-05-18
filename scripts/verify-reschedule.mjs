#!/usr/bin/env node
/**
 * Sanity checks for migration 0015 (Booking Reschedule, SP7).
 * Usage: DATABASE_URL=... node scripts/verify-reschedule.mjs
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
  {
    name: 'outbox event_type CHECK includes booking_rescheduled',
    sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.notifications_outbox'::regclass and conname='notifications_outbox_event_type_check'`,
    customCheck: (rows) => (rows[0]?.def ?? '').includes('booking_rescheduled'),
  },
  {
    name: 'check_booking_reschedule_allowed function exists',
    sql: `select 1 from pg_proc where pronamespace='public'::regnamespace and proname='check_booking_reschedule_allowed'`,
  },
  {
    name: 'bookings_reschedule_guard trigger exists',
    sql: `select 1 from pg_trigger where tgname='bookings_reschedule_guard' and tgrelid='public.bookings'::regclass`,
  },
  {
    name: 'notify_booking_rescheduled function exists',
    sql: `select 1 from pg_proc where pronamespace='public'::regnamespace and proname='notify_booking_rescheduled'`,
  },
  {
    name: 'bookings_notify_rescheduled trigger exists',
    sql: `select 1 from pg_trigger where tgname='bookings_notify_rescheduled' and tgrelid='public.bookings'::regclass`,
  },
  {
    name: 'check_booking_reschedule_allowed not executable by public/anon/authenticated',
    sql: `
      select count(*)::int as cnt
      from pg_proc p
      join information_schema.routine_privileges rp on rp.routine_name = p.proname
      where p.proname = 'check_booking_reschedule_allowed'
        and rp.grantee in ('PUBLIC', 'anon', 'authenticated')
        and rp.privilege_type = 'EXECUTE'
    `,
    customCheck: (rows) => Number(rows[0]?.cnt ?? 0) === 0,
  },
  {
    name: 'both reschedule triggers are on date/time_slot/hours columns',
    sql: `
      select tgname,
             pg_get_triggerdef(oid) as def
      from pg_trigger
      where tgname in ('bookings_reschedule_guard', 'bookings_notify_rescheduled')
      order by tgname
    `,
    customCheck: (rows) => {
      if (rows.length !== 2) return false;
      for (const r of rows) {
        const def = String(r.def);
        if (!def.includes('date') || !def.includes('time_slot') || !def.includes('hours')) return false;
      }
      return true;
    },
  },
];

let passed = 0;
let failed = 0;
for (const c of checks) {
  try {
    const r = await client.query(c.sql);
    const ok = c.customCheck ? c.customCheck(r.rows) : r.rowCount > 0;
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
