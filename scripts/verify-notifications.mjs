/**
 * Verify notifications migration (0012) applied correctly.
 * 12 sanity checks: table, indexes, constraints, RLS, helpers, RPC, triggers,
 * assigned_slug column, approve_club_application updated.
 *
 * Usage: DATABASE_URL=... node scripts/verify-notifications.mjs
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

const EVENT_TYPES = [
  'application_submitted',
  'application_approved',
  'application_rejected',
  'booking_created',
  'booking_confirmed',
  'booking_cancelled',
  'booking_completed',
  'booking_no_show',
];

const checks = [
  // 1. Table existence
  { name: 'notifications_outbox table exists', sql: `select to_regclass('public.notifications_outbox') as t`, expect: (r) => r[0].t === 'notifications_outbox' },
  // 2. status_created index
  { name: 'notifications_outbox_status_created_idx exists', sql: `select indexname from pg_indexes where schemaname='public' and indexname='notifications_outbox_status_created_idx'`, expect: (r) => r.length === 1 },
  // 3. source index
  { name: 'notifications_outbox_source_idx exists', sql: `select indexname from pg_indexes where schemaname='public' and indexname='notifications_outbox_source_idx'`, expect: (r) => r.length === 1 },
  // 4. Unique constraint on (event_type, source_id, recipient_email)
  { name: 'unique (event_type, source_id, recipient_email) exists', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.notifications_outbox'::regclass and contype='u'`, expect: (r) => r.some((row) => /event_type/.test(row.def) && /source_id/.test(row.def) && /recipient_email/.test(row.def)) },
  // 5. event_type check has all 8 values
  { name: 'event_type check has 8 values', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.notifications_outbox'::regclass and contype='c' and conname like '%event_type%'`, expect: (r) => EVENT_TYPES.every((e) => r[0]?.def.includes(e)) },
  // 6. status check has 3 values
  { name: 'status check has 3 values', sql: `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.notifications_outbox'::regclass and contype='c' and conname like '%status%'`, expect: (r) => ['pending', 'sent', 'failed'].every((s) => r[0]?.def.includes(s)) },
  // 7. RLS read policy
  { name: 'super_admins read outbox policy exists', sql: `select policyname from pg_policies where schemaname='public' and tablename='notifications_outbox' and policyname='super_admins read outbox'`, expect: (r) => r.length === 1 },
  // 8. 3 email-lookup helpers
  { name: '3 email-lookup helper functions exist', sql: `select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('get_user_email','get_club_admin_emails','get_super_admin_emails')`, expect: (r) => r.length === 3 },
  // 9. update_outbox_result RPC
  { name: 'update_outbox_result RPC exists', sql: `select proname from pg_proc where pronamespace='public'::regnamespace and proname='update_outbox_result'`, expect: (r) => r.length === 1 },
  // 10. assigned_slug column
  { name: 'club_applications.assigned_slug column exists', sql: `select column_name from information_schema.columns where table_schema='public' and table_name='club_applications' and column_name='assigned_slug'`, expect: (r) => r.length === 1 },
  // 11. 4 notification triggers
  { name: '4 notification triggers exist', sql: `select tgname from pg_trigger where tgname in ('bookings_notify_created','bookings_notify_status_change','applications_notify_submitted','applications_notify_status_change')`, expect: (r) => r.length === 4 },
  // 12. approve_club_application references assigned_slug
  { name: 'approve_club_application references assigned_slug', sql: `select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='approve_club_application'`, expect: (r) => r[0]?.prosrc?.includes('assigned_slug') === true },
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
exit(failed > 0 ? 1 : 0);
