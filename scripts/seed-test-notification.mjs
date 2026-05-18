#!/usr/bin/env node
// Inserts a fake outbox row to smoke-test the Edge Function end-to-end.
// Usage: DATABASE_URL=... TO_EMAIL=you@example.com node scripts/seed-test-notification.mjs

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const toEmail = process.env.TO_EMAIL;
if (!databaseUrl || !toEmail) {
  console.error('DATABASE_URL and TO_EMAIL env vars required');
  process.exit(2);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

const fakeId = randomUUID();

const payload = {
  booking_id: fakeId,
  club_slug: 'cyberzone',
  club_name: 'CyberZone (TEST)',
  date: new Date().toISOString().slice(0, 10),
  time_slot: '20:00',
  hours: 2,
  total_price: 4000,
  customer_email: toEmail,
};

const r = await client.query(
  `insert into notifications_outbox
   (event_type, source_table, source_id, recipient_email, payload)
   values ($1, $2, $3, $4, $5::jsonb)
   returning id, status, created_at`,
  ['booking_created', 'bookings', fakeId, toEmail, JSON.stringify(payload)],
);

console.log('Inserted outbox row:', r.rows[0]);
console.log('Wait ~5 seconds, then check inbox.');
console.log('Also check status with:');
console.log(`  select status, last_error, resend_message_id from notifications_outbox where id = '${r.rows[0].id}';`);

await client.end();
