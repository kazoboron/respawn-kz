#!/usr/bin/env node
/**
 * One-shot seed of public.clubs from src/data/clubs.ts.
 * Idempotent: ON CONFLICT (slug) DO NOTHING.
 * Run AFTER migration 0007 and BEFORE migration 0008 (FKs).
 */
import { readFileSync } from 'node:fs';
import { env, exit } from 'node:process';
import pg from 'pg';

const { Client } = pg;

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL env var is required');
  exit(1);
}

// Parse CLUBS array from clubs.ts via regex + eval.
const tsSource = readFileSync('src/data/clubs.ts', 'utf8');
const match = tsSource.match(/export const CLUBS:[^=]+=\s*(\[[\s\S]+?\]);\s*\n\s*(?:export|$)/);
if (!match) {
  console.error('Failed to parse CLUBS array from src/data/clubs.ts');
  exit(1);
}
const CLUBS = eval(match[1]);

if (!Array.isArray(CLUBS) || CLUBS.length === 0) {
  console.error('CLUBS array empty or not array');
  exit(1);
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseHours(s) {
  if (s === 'Круглосуточно') {
    const allDay = { open: '24h', close: '24h' };
    return Object.fromEntries(DAYS.map((d) => [d, allDay]));
  }
  // "10:00–02:00" or "10:00-02:00" — normalize em-dash to hyphen
  const normalized = s.replace(/[–—]/g, '-');
  const parts = normalized.split('-').map((x) => x.trim());
  if (parts.length !== 2) {
    console.warn(`[seed] unable to parse hours "${s}", using 10:00-02:00 fallback`);
    return Object.fromEntries(DAYS.map((d) => [d, { open: '10:00', close: '02:00' }]));
  }
  const hours = { open: parts[0], close: parts[1] };
  return Object.fromEntries(DAYS.map((d) => [d, hours]));
}

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

let inserted = 0, skipped = 0;
for (const c of CLUBS) {
  const hours = parseHours(c.hours);
  const result = await client.query(
    `insert into clubs
       (slug, name, city, district, address, phone, price_per_hour,
        working_hours, description, tags, equipment, gradient, initial,
        rating, reviews_count, is_published)
     values ($1,$2,$3,$4,$5,$6,$7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, true)
     on conflict (slug) do nothing
     returning slug`,
    [c.slug, c.name, c.city, c.district, c.address, c.phone, c.price,
     JSON.stringify(hours), c.description, c.tags, c.equipment, c.gradient, c.initial,
     c.rating, c.reviews]
  );
  if (result.rowCount > 0) { console.log('  + ' + c.slug); inserted++; }
  else { console.log('  · ' + c.slug + ' (exists)'); skipped++; }
}
console.log(`\n${inserted} inserted, ${skipped} skipped`);
await client.end();
exit(0);
