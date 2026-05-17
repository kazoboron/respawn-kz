# respawn.kz Clubs in DB + Slot Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 12 hard-coded clubs from `src/data/clubs.ts` to a Supabase `clubs` table; refactor Astro SSG to fetch clubs from DB at build time; add Postgres trigger enforcing slot rules (no past dates, within working hours, no overlap); auto-create draft clubs on application approval via RPC; let club admins edit clubs through cabinet.

**Architecture:** 3 new migrations (clubs table + RLS, FKs + slot trigger, approve RPC). Server-side loader `src/lib/clubs-loader.ts` used in Astro frontmatter for SSG. Client scripts read club data from `data-club` JSON attributes (booking) or fetch via Supabase (dashboards). Booking modal gets a working-hours-aware time picker with conflict marking. Approval flow becomes atomic via Postgres RPC.

**Tech Stack:** Astro 4.16 SSG, TypeScript strict, Supabase (Postgres + Auth + RLS + RPC), pg client (already added in sub-project 1) for ops, vanilla CSS.

**Reference spec:** `docs/superpowers/specs/2026-05-17-respawn-kz-clubs-in-db-and-slot-validation-design.md`

**Important context for implementer:**
- Project has **no test framework**. Verification = `npm run build` + `npx astro check` + smoke instructions in tasks.
- Sub-project 1 is already in prod. This plan extends it. Don't break: cabinet, /admin/, /me/, login flow, existing bookings.
- Branch: this plan executes on **`feat/clubs-in-db`** (new branch from main).
- Git author: `Claude <noreply@anthropic.com>` via inline `-c user.name -c user.email`.
- DATABASE_URL for applying migrations: stored in conversation context; controller (me) handles apply step between tasks.
- `pg` and `apply-sql.mjs` already exist from sub-project 1 deploy work.

---

## File Structure

### Created (9)
- `supabase/migrations/0007_clubs_table.sql`
- `supabase/migrations/0008_clubs_fk_and_slot_trigger.sql`
- `supabase/migrations/0009_approve_application_rpc.sql`
- `supabase/apply_clubs.sql`
- `scripts/seed-clubs.mjs`
- `src/lib/clubs-loader.ts`
- `src/lib/slugify.ts`
- `src/pages/dashboard/club/edit.astro`
- `src/scripts/dashboard-club-edit.ts`

### Modified (12)
- `src/data/supabase-types.ts` — add ClubRow type re-export
- `src/pages/clubs/index.astro` — use loadAllClubs
- `src/pages/clubs/[slug].astro` — use loadClubBySlug + loadSimilarClubs + data-club attr
- `src/pages/admin/owners.astro` — use loadAllClubsForAdmin
- `src/pages/dashboard/index.astro` — add "Мои клубы" block
- `src/scripts/booking-real.ts` — read data-club; smart time picker; conflict check
- `src/scripts/dashboard.ts` — fetch clubs from Supabase
- `src/scripts/dashboard-bookings.ts` — fetch clubs from Supabase
- `src/scripts/admin-owners.ts` — adapt to DB-sourced clubs
- `src/scripts/admin-applications.ts` — approve via RPC with slugify
- `src/scripts/init.ts` — wire setupDashboardClubEdit
- `src/styles/global.css` — styles for `.my-clubs`, `.club-edit`, `.time-picker-day`

### Deleted (1)
- `src/data/clubs.ts` — after grep verifies zero imports remain

### Branch
- `feat/clubs-in-db` — created from `main` at start of execution

---

## Task 1: Create branch + migration 0007 (clubs table)

**Files:**
- Create: `supabase/migrations/0007_clubs_table.sql`

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull origin main
git checkout -b feat/clubs-in-db
```

Expected: `Switched to a new branch 'feat/clubs-in-db'`

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/0007_clubs_table.sql`:

```sql
-- Migration 0007: clubs table with structured working_hours and RLS

create table public.clubs (
  slug           text primary key,
  name           text not null,
  city           text not null,
  district       text,
  address        text not null,
  phone          text,

  price_per_hour int not null check (price_per_hour > 0),

  working_hours  jsonb not null default '{}'::jsonb,

  description    text,
  tags           text[] default '{}',
  equipment      text[] default '{}',
  photos         text[] default '{}',

  gradient       text,
  initial        text,

  rating         numeric(2,1) default 0,
  reviews_count  int default 0,

  is_published   boolean default true,

  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index clubs_city_idx on public.clubs (city) where is_published = true;

alter table public.clubs enable row level security;

create policy "anyone reads published clubs" on public.clubs
  for select using (is_published = true);

create policy "super_admins read all clubs" on public.clubs
  for select using (auth.uid() in (select user_id from public.super_admins));

create policy "club_admins read own clubs" on public.clubs
  for select using (
    exists (select 1 from public.club_admins where user_id = auth.uid() and club_slug = clubs.slug)
  );

create policy "club_admins update own clubs" on public.clubs
  for update using (
    exists (select 1 from public.club_admins where user_id = auth.uid() and club_slug = clubs.slug)
  );

create policy "super_admins manage clubs" on public.clubs
  for all using (auth.uid() in (select user_id from public.super_admins));
```

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add supabase/migrations/0007_clubs_table.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(db): add clubs table with RLS (migration 0007)

Structured working_hours as jsonb (per-day open/close or '24h').
Five RLS policies: anyone reads published, super_admins read all,
club_admins read+update own, super_admins manage all.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Migration 0008 (FKs + slot validation trigger)

**Files:**
- Create: `supabase/migrations/0008_clubs_fk_and_slot_trigger.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/0008_clubs_fk_and_slot_trigger.sql`:

```sql
-- Migration 0008: FKs from club_admins/bookings to clubs + slot validation trigger
-- IMPORTANT: must be applied AFTER seed runs (otherwise FK validation fails
-- because club_admins/bookings already reference slugs).

-- =====================================================================
-- Foreign keys
-- =====================================================================

alter table public.club_admins
  add constraint club_admins_club_slug_fkey
  foreign key (club_slug) references public.clubs(slug) on delete cascade;

alter table public.bookings
  add constraint bookings_club_slug_fkey
  foreign key (club_slug) references public.clubs(slug);

-- =====================================================================
-- Slot validation trigger
-- =====================================================================

create or replace function check_booking_slot_valid()
returns trigger as $$
declare
  v_hours jsonb;
  v_day text;
  v_open time;
  v_close time;
  v_start time;
  v_end_time time;
  overnight boolean;
begin
  -- Skip when only status changes (status trigger handles those rules)
  if TG_OP = 'UPDATE'
     and NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  if NEW.date < current_date then
    raise exception 'Cannot book past dates';
  end if;

  if not exists (select 1 from public.clubs where slug = NEW.club_slug and is_published = true) then
    raise exception 'Club % does not exist or is not published', NEW.club_slug;
  end if;

  select working_hours into v_hours from public.clubs where slug = NEW.club_slug;
  v_day := lower(to_char(NEW.date, 'dy'));

  if v_hours->v_day is null or v_hours->v_day = 'null'::jsonb then
    raise exception 'Club closed on %', v_day;
  end if;

  if (v_hours->v_day->>'open') = '24h' then
    null;
  else
    v_open := (v_hours->v_day->>'open')::time;
    v_close := (v_hours->v_day->>'close')::time;
    v_start := NEW.time_slot::time;
    v_end_time := (v_start + (NEW.hours || ' hours')::interval)::time;
    overnight := v_close < v_open;

    if not overnight then
      if v_start < v_open or v_end_time > v_close then
        raise exception 'Time slot %-% outside working hours (%-%)', v_start, v_end_time, v_open, v_close;
      end if;
    else
      if not (v_start >= v_open or v_end_time <= v_close) then
        raise exception 'Time slot %-% outside working hours (% - % overnight)', v_start, v_end_time, v_open, v_close;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.club_slug = NEW.club_slug
      and b.date = NEW.date
      and b.status in ('pending', 'confirmed')
      and b.id != coalesce(NEW.id, gen_random_uuid())
      and tsrange(
        (b.date + b.time_slot::time)::timestamp,
        (b.date + b.time_slot::time + (b.hours || ' hours')::interval)::timestamp
      ) && tsrange(
        (NEW.date + NEW.time_slot::time)::timestamp,
        (NEW.date + NEW.time_slot::time + (NEW.hours || ' hours')::interval)::timestamp
      )
  ) then
    raise exception 'Time slot overlaps with existing booking';
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_slot_validation
  before insert or update of date, time_slot, hours on public.bookings
  for each row execute function check_booking_slot_valid();
```

- [ ] **Step 2: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add supabase/migrations/0008_clubs_fk_and_slot_trigger.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(db): add FKs and slot validation trigger (migration 0008)

FK: club_admins.club_slug + bookings.club_slug → clubs.slug.
Trigger check_booking_slot_valid: enforces no past dates, club
exists+published, time within working_hours (with overnight handling),
no overlap with existing pending/confirmed bookings.

Apply AFTER seed runs to satisfy FK validation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Migration 0009 (approve_club_application RPC)

**Files:**
- Create: `supabase/migrations/0009_approve_application_rpc.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/0009_approve_application_rpc.sql`:

```sql
-- Migration 0009: atomic approve_club_application RPC
-- Creates draft club + binds owner + marks application approved in one transaction.

create or replace function approve_club_application(
  p_application_id uuid,
  p_club_slug text,
  p_review_note text default null
) returns text
language plpgsql
security invoker
as $$
declare v_app club_applications;
begin
  if not exists (select 1 from super_admins where user_id = auth.uid()) then
    raise exception 'Only super-admins can approve';
  end if;

  select * into v_app from club_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_app.status != 'pending' then
    raise exception 'Application already %', v_app.status;
  end if;

  insert into clubs (
    slug, name, city, district, address, phone, price_per_hour,
    working_hours, description, gradient, initial, is_published
  ) values (
    p_club_slug, v_app.club_name, v_app.city, v_app.district, v_app.address,
    v_app.applicant_phone, 1000,
    '{}'::jsonb,
    v_app.description,
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    upper(left(v_app.club_name, 1)),
    false
  );

  if v_app.applicant_user_id is not null then
    insert into club_admins (user_id, club_slug, granted_by)
    values (v_app.applicant_user_id, p_club_slug, auth.uid());
  end if;

  update club_applications set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_review_note
  where id = p_application_id;

  return p_club_slug;
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add supabase/migrations/0009_approve_application_rpc.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(db): add approve_club_application RPC (migration 0009)

Atomic transaction: insert draft clubs row + insert club_admins
binding + update club_applications status. Caller-side check for
super-admin role, then runs as invoker.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Create seed-clubs.mjs

**Files:**
- Create: `scripts/seed-clubs.mjs`

- [ ] **Step 1: Create script**

Create `scripts/seed-clubs.mjs`:

```js
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
```

- [ ] **Step 2: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add scripts/seed-clubs.mjs
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(scripts): add seed-clubs.mjs for one-shot CLUBS migration

Reads src/data/clubs.ts, parses CLUBS array, INSERTs each row with
ON CONFLICT (slug) DO NOTHING. Converts hours text ('Круглосуточно'
or '10:00–02:00') to per-day jsonb working_hours.

Run between migration 0007 (table) and 0008 (FKs).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Create apply_clubs.sql bundle

**Files:**
- Create: `supabase/apply_clubs.sql`

- [ ] **Step 1: Create documentation file**

Unlike `apply_b2b_cabinet.sql` (which bundled migrations 0002-0006 for one-paste apply), the clubs deploy is staged because the seed step requires running Node (`scripts/seed-clubs.mjs`) to parse `src/data/clubs.ts`. So `apply_clubs.sql` is a documentation marker, not an executable bundle.

Create `supabase/apply_clubs.sql` with EXACTLY this content:

```sql
-- =====================================================================
-- Clubs in DB + Slot Validation — DEPLOY SEQUENCE
-- =====================================================================
--
-- Unlike apply_b2b_cabinet.sql (one-paste bundle), the clubs deploy is
-- STAGED because the seed step parses src/data/clubs.ts via Node.
--
-- Apply in this exact order:
--
--   1. node scripts/apply-sql.mjs supabase/migrations/0007_clubs_table.sql
--   2. node scripts/seed-clubs.mjs        -- inserts 12 clubs from clubs.ts
--   3. node scripts/apply-sql.mjs supabase/migrations/0008_clubs_fk_and_slot_trigger.sql
--   4. node scripts/apply-sql.mjs supabase/migrations/0009_approve_application_rpc.sql
--
-- DATABASE_URL env var must be set before each command (see
-- scripts/apply-sql.mjs for format expected).
--
-- Verification queries (run any time after step 4):
--
--   select count(*) from clubs;
--     -- expected: 12
--
--   select to_regclass('public.clubs') is not null as table_exists;
--     -- expected: true
--
--   select count(*) from pg_trigger
--     where tgrelid='public.bookings'::regclass
--       and tgname like 'bookings_%';
--     -- expected: 2 (status_transition_check + slot_validation)
--
--   select proname from pg_proc where proname='approve_club_application';
--     -- expected: 1 row
--
--   select tgname from pg_trigger
--     where tgrelid='public.club_admins'::regclass;
--     -- expected: includes club_admins_club_slug_fkey indirectly
--     -- (FK constraints don't show here; check via:
--     --   \d club_admins  in psql,
--     --   or select conname from pg_constraint where conrelid='public.club_admins'::regclass)
-- =====================================================================

select 'See header comments above for deploy steps. This file is documentation, not a runnable bundle.' as instruction;
```

This file IS valid SQL (the final SELECT runs successfully), but its primary purpose is to document the deploy sequence.

- [ ] **Step 2: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add supabase/apply_clubs.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "docs(db): add apply_clubs.sql documenting deploy sequence

Unlike apply_b2b_cabinet.sql (one-paste DDL+seed), the clubs deploy
is staged because seed reads src/data/clubs.ts via Node. This file
documents the 4-step apply sequence and verification queries.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## CONTROLLER STEP (between Tasks 5 and 6): Apply migrations to prod DB

This is a controller-only action, not a subagent task. After Tasks 1-5 commits, the controller:

```bash
DATABASE_URL=... node scripts/apply-sql.mjs supabase/migrations/0007_clubs_table.sql
DATABASE_URL=... node scripts/seed-clubs.mjs
DATABASE_URL=... node scripts/apply-sql.mjs supabase/migrations/0008_clubs_fk_and_slot_trigger.sql
DATABASE_URL=... node scripts/apply-sql.mjs supabase/migrations/0009_approve_application_rpc.sql
```

Verify with adapted version of `scripts/verify-b2b.mjs` (or inline SQL):

```sql
select count(*) from clubs;  -- 12
select to_regclass('public.clubs');  -- 'clubs'
select count(*) from pg_trigger where tgrelid='public.bookings'::regclass and tgname like 'bookings_%';  -- 2 (status + slot)
select count(*) from pg_proc where proname='approve_club_application';  -- 1
```

If verification fails, fix migration and re-apply via direct SQL on broken parts. The controller handles this; subagents proceed to Task 6 only after controller confirms DB is ready.

---

## Task 6: Create src/lib/clubs-loader.ts

**Files:**
- Create: `src/lib/clubs-loader.ts`

- [ ] **Step 1: Create file**

Create `src/lib/clubs-loader.ts`:

```ts
import { supabase } from './supabase';

export interface ClubRow {
  slug: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  price_per_hour: number;
  working_hours: Record<string, { open: string; close: string } | null>;
  description: string | null;
  tags: string[];
  equipment: string[];
  photos: string[];
  gradient: string | null;
  initial: string | null;
  rating: number;
  reviews_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export async function loadAllClubs(): Promise<ClubRow[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('is_published', true)
    .order('rating', { ascending: false });
  if (error) throw new Error(`loadAllClubs failed: ${error.message}`);
  return (data ?? []) as ClubRow[];
}

export async function loadClubBySlug(slug: string): Promise<ClubRow | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) throw new Error(`loadClubBySlug(${slug}) failed: ${error.message}`);
  return data as ClubRow | null;
}

export async function loadSimilarClubs(slug: string, limit = 3): Promise<ClubRow[]> {
  const club = await loadClubBySlug(slug);
  if (!club) return [];
  const { data: sameCity } = await supabase
    .from('clubs')
    .select('*')
    .eq('is_published', true)
    .neq('slug', slug)
    .eq('city', club.city)
    .limit(limit);
  const list = (sameCity ?? []) as ClubRow[];
  if (list.length >= limit) return list.slice(0, limit);

  const { data: others } = await supabase
    .from('clubs')
    .select('*')
    .eq('is_published', true)
    .neq('slug', slug)
    .neq('city', club.city)
    .order('rating', { ascending: false })
    .limit(limit - list.length);
  return [...list, ...((others ?? []) as ClubRow[])];
}

// For admin pages: include drafts (RLS allows super-admin to see all)
export async function loadAllClubsForAdmin(): Promise<ClubRow[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('*')
    .order('is_published', { ascending: false })
    .order('city', { ascending: true });
  if (error) throw new Error(`loadAllClubsForAdmin failed: ${error.message}`);
  return (data ?? []) as ClubRow[];
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors (1 pre-existing hint about JSON-LD script in clubs/[slug].astro is OK).

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/lib/clubs-loader.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(lib): add clubs-loader.ts for SSG and admin

Exports ClubRow type + 4 loaders: loadAllClubs (published only),
loadClubBySlug, loadSimilarClubs (same city first), loadAllClubsForAdmin
(includes drafts for super-admin pages).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Create src/lib/slugify.ts

**Files:**
- Create: `src/lib/slugify.ts`

- [ ] **Step 1: Create file**

Create `src/lib/slugify.ts`:

```ts
import { supabase } from './supabase';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Convert Cyrillic-or-Latin string to URL-safe slug. */
export function slugify(s: string): string {
  const transliterated = s.toLowerCase().split('').map((c) => CYRILLIC_MAP[c] ?? c).join('');
  return transliterated.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Generate a slug that doesn't collide with existing club slugs. */
export async function generateUniqueClubSlug(name: string): Promise<string> {
  const base = slugify(name) || 'club';
  let candidate = base;
  let n = 1;
  // Bound the loop so we don't infinite-loop on misbehaving DB
  for (let i = 0; i < 100; i++) {
    const { data } = await supabase.from('clubs').select('slug').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
    n++;
    candidate = `${base}-${n}`;
  }
  throw new Error('Could not generate unique slug after 100 attempts');
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/lib/slugify.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(lib): add slugify and generateUniqueClubSlug

Cyrillic-to-Latin transliteration + slug formatting. Async helper
loops until a unique slug found (bounded to 100 attempts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Refactor /clubs/[slug].astro to use clubs-loader

**Files:**
- Modify: `src/pages/clubs/[slug].astro`

- [ ] **Step 1: Read current file to understand structure**

Read `C:\ClaudeCode\src\pages\clubs\[slug].astro` (existing 158 lines).

- [ ] **Step 2: Replace frontmatter and book button**

Replace the entire file with:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ClubCard from '../../components/ClubCard.astro';
import { loadAllClubs, loadClubBySlug, loadSimilarClubs, type ClubRow } from '../../lib/clubs-loader';
import { CITY_LABELS } from '../../data/cities';

export async function getStaticPaths() {
  const clubs = await loadAllClubs();
  return clubs.map((club) => ({
    params: { slug: club.slug },
    props: { club },
  }));
}

interface Props {
  club: ClubRow;
}

const { club } = Astro.props;
const cityLabel = CITY_LABELS[club.city] ?? club.city;
const similar = await loadSimilarClubs(club.slug, 3);

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

// Working hours summary string for display (use Mon as representative)
function summarizeHours(wh: ClubRow['working_hours']): string {
  const mon = wh.mon;
  if (!mon) return 'По расписанию';
  if (mon.open === '24h') return 'Круглосуточно';
  return `${mon.open} – ${mon.close}`;
}
const hoursLabel = summarizeHours(club.working_hours);

// Compact data-club JSON for booking modal — only fields it needs
const clubDataAttr = JSON.stringify({
  slug: club.slug,
  name: club.name,
  price_per_hour: club.price_per_hour,
  working_hours: club.working_hours,
  city: club.city,
  district: club.district,
  address: club.address,
});

// Schema.org LocalBusiness JSON-LD
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'GameServer',
  '@id': `https://respawn.kz/clubs/${club.slug}/`,
  name: club.name,
  description: club.description,
  image: `https://respawn.kz/img/club-hero.jpg`,
  url: `https://respawn.kz/clubs/${club.slug}/`,
  telephone: club.phone,
  address: {
    '@type': 'PostalAddress',
    streetAddress: club.address,
    addressLocality: cityLabel,
    addressRegion: cityLabel,
    addressCountry: 'KZ',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: club.rating,
    reviewCount: club.reviews_count,
    bestRating: 5,
    worstRating: 1,
  },
  priceRange: `от ${formatPrice(club.price_per_hour)} ₸/час`,
  openingHours: hoursLabel === 'Круглосуточно' ? 'Mo-Su 00:00-23:59' : hoursLabel,
};
---

<BaseLayout
  title={`${club.name} — ${cityLabel} — respawn.kz`}
  description={`${club.name}, ${cityLabel}, ${club.district ?? ''}. От ${formatPrice(club.price_per_hour)} ₸/час. ${club.tags.join(', ')}.`}
  activeRoute="clubs"
>
  <script type="application/ld+json" slot="head" set:html={JSON.stringify(jsonLd)} />

  <section class="club-page">
    <div class="container">
      <nav class="breadcrumb">
        <a href="/">Главная</a>
        <span class="breadcrumb__sep">/</span>
        <a href="/clubs/">Клубы</a>
        <span class="breadcrumb__sep">/</span>
        <span class="breadcrumb__current">{club.name}</span>
      </nav>

      <header class="club-page__hero">
        <h1 class="club-page__name">{club.name}</h1>
        <div class="club-page__meta">
          <span>{cityLabel}</span>
          <span class="club-card__meta-sep">·</span>
          <span>{club.district}</span>
          <span class="club-card__meta-sep">·</span>
          <span class="pill pill--rating">★ {club.rating} ({club.reviews_count} отзывов)</span>
        </div>
        <div class="club-page__tags">
          {club.tags.map((t) => <span class="tag">{t}</span>)}
        </div>
      </header>

      <div class="club-page__gallery">
        {(club.photos.length > 0 ? club.photos : [club.gradient ?? 'linear-gradient(135deg, #8b5cf6, #ec4899)']).map((src, i) => (
          <div class="gallery-item" style={src.startsWith('linear-gradient') ? `background: ${src};` : `background-image: url(${src}); background-size: cover;`}>
            <span class="gallery-item__num">{i + 1}</span>
          </div>
        ))}
      </div>

      <div class="club-page__layout">
        <div class="club-page__main">
          <section class="club-section">
            <h2 class="club-section__title">О клубе</h2>
            <p class="club-section__text">{club.description}</p>
          </section>

          <section class="club-section">
            <h2 class="club-section__title">Что у нас есть</h2>
            <ul class="equipment-list">
              {club.equipment.map((e) => <li>{e}</li>)}
            </ul>
          </section>

          <section class="club-section">
            <h2 class="club-section__title">Часы работы и адрес</h2>
            <div class="info-grid">
              <div>
                <div class="info-label">Часы работы</div>
                <div class="info-value">{hoursLabel}</div>
              </div>
              <div>
                <div class="info-label">Адрес</div>
                <div class="info-value">{club.address}</div>
              </div>
              <div>
                <div class="info-label">Телефон</div>
                <div class="info-value">{club.phone ? <a href={`tel:${club.phone.replace(/[^+\d]/g, '')}`}>{club.phone}</a> : '—'}</div>
              </div>
            </div>
          </section>
        </div>

        <aside class="club-page__sidebar">
          <div class="pricing-card">
            <div class="pricing-card__amount">
              <span class="pricing-card__from">от</span>
              <span class="pricing-card__value">{formatPrice(club.price_per_hour)} ₸</span>
              <span class="pricing-card__unit">/час</span>
            </div>
            <button class="btn btn--primary btn--large pricing-card__btn"
                    data-book={club.slug}
                    data-club={clubDataAttr}>
              Забронировать слот
            </button>
            <div class="pricing-card__pay">
              <span class="pricing-card__pay-label">Принимаем:</span>
              <span class="pricing-card__pay-icons">
                <span class="pay-icon">VISA</span>
                <span class="pay-icon">MC</span>
                <span class="pay-icon">Kaspi</span>
              </span>
            </div>
          </div>
        </aside>
      </div>

      <section class="similar">
        <h2 class="section__title">Похожие клубы</h2>
        <div class="clubs__grid">
          {similar.map((c) => <ClubCard club={{...c, price: c.price_per_hour, reviews: c.reviews_count, galleryGradients: [c.gradient ?? '']}} />)}
        </div>
      </section>
    </div>
  </section>
</BaseLayout>
```

> NOTE: The `<ClubCard>` component currently expects the old Club shape (price, reviews, galleryGradients). We map ClubRow → that shape inline above. Future task may refactor ClubCard. For now this preserves visual behavior.

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: succeeds. Output should include all 12 club detail pages (`/clubs/cyberzone/`, etc).

- [ ] **Step 4: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/pages/clubs/[slug].astro
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(clubs): /clubs/[slug] now loads from DB via clubs-loader

getStaticPaths uses loadAllClubs(). Page renders ClubRow shape;
inline maps to old shape for ClubCard. Booking button gets data-club
JSON attribute carrying working_hours for the smart time picker.
Photos[] support: fallback to gradient when empty.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Refactor /clubs/index.astro

**Files:**
- Modify: `src/pages/clubs/index.astro`

- [ ] **Step 1: Read current file**

Read `C:\ClaudeCode\src\pages\clubs\index.astro` (existing 77 lines).

- [ ] **Step 2: Update frontmatter to use loader**

Replace the entire file with:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { CITIES } from '../../data/cities';
import { loadAllClubs } from '../../lib/clubs-loader';

const clubs = await loadAllClubs();
---

<BaseLayout
  title="Все клубы Казахстана — respawn.kz"
  description="Каталог компьютерных клубов в 10 городах Казахстана. Фильтры по городу, цене и оборудованию."
  activeRoute="clubs"
>
  <section class="catalog">
    <div class="container">
      <nav class="breadcrumb">
        <a href="/">Главная</a>
        <span class="breadcrumb__sep">/</span>
        <span class="breadcrumb__current">Клубы</span>
      </nav>

      <header class="catalog__header">
        <h1 class="catalog__title">Клубы Казахстана</h1>
        <p class="catalog__subtitle">Найдено <strong id="catalog-count">{clubs.length}</strong> клубов</p>
      </header>

      <div class="catalog__filters" id="catalog-filters">
        <label class="filter">
          <span class="filter__label">
            Город
            <button type="button" class="geo-btn" id="geo-btn">📍 Мой город</button>
          </span>
          <select id="city-select" class="filter__input">
            <option value="">Все города</option>
            {CITIES.map((c) => <option value={c.id}>{c.label}</option>)}
          </select>
          <span class="geo-status" id="geo-status" hidden></span>
        </label>

        <div class="filter">
          <span class="filter__label">Цена</span>
          <div class="filter__chips">
            <button type="button" class="chip" data-price-tier="low">до 800 ₸</button>
            <button type="button" class="chip" data-price-tier="mid">800–1200 ₸</button>
            <button type="button" class="chip" data-price-tier="high">1200+ ₸</button>
          </div>
        </div>

        <div class="filter">
          <span class="filter__label">Оборудование</span>
          <div class="filter__tags">
            <label class="tag-check"><input type="checkbox" data-tag="PC" /><span>PC</span></label>
            <label class="tag-check"><input type="checkbox" data-tag="PS5" /><span>PS5</span></label>
            <label class="tag-check"><input type="checkbox" data-tag="VR" /><span>VR</span></label>
            <label class="tag-check"><input type="checkbox" data-tag="Sim Racing" /><span>Sim Racing</span></label>
          </div>
        </div>

        <label class="filter">
          <span class="filter__label">Сортировка</span>
          <select id="sort-select" class="filter__input">
            <option value="rating">По рейтингу</option>
            <option value="price-asc">Цена ↑</option>
            <option value="price-desc">Цена ↓</option>
          </select>
        </label>

        <button type="button" class="btn btn--ghost catalog__reset" id="catalog-reset" hidden>Сбросить фильтры</button>
      </div>

      <!-- Initial set serialized for client-side filter script -->
      <script id="catalog-data" type="application/json" set:html={JSON.stringify(clubs.map((c) => ({
        slug: c.slug, name: c.name, city: c.city, district: c.district,
        address: c.address, phone: c.phone, price: c.price_per_hour,
        rating: c.rating, reviews: c.reviews_count, tags: c.tags,
        gradient: c.gradient, initial: c.initial,
        // include working_hours so booking buttons in cards have it
        working_hours: c.working_hours,
      })))} />

      <div class="clubs__grid" id="catalog-grid"></div>

      <div class="catalog__empty" id="catalog-empty" hidden>
        <p>Ничего не нашлось — попробуй сбросить фильтры</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

> NOTE: catalog page already uses client-side filter script (`src/scripts/filters.ts`) which reads the CLUBS array. After this change, it needs to read from the inline `<script id="catalog-data">` JSON instead. Update in Task 13.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: succeeds. `/clubs/index.html` includes 12 club data points in JSON.

- [ ] **Step 4: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/pages/clubs/index.astro
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(clubs): /clubs/ catalog loads from DB

Frontmatter uses loadAllClubs(). Inline catalog-data script tag
serializes clubs for the filter script to read (replaces import
of CLUBS array). filters.ts updated separately.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Refactor /admin/owners.astro

**Files:**
- Modify: `src/pages/admin/owners.astro`

- [ ] **Step 1: Read current file**

Read `C:\ClaudeCode\src\pages\admin\owners.astro` (existing 57 lines).

- [ ] **Step 2: Update frontmatter to use loader**

Replace the entire file with:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
import { loadAllClubsForAdmin } from '../../lib/clubs-loader';
import { CITY_LABELS } from '../../data/cities';

const clubs = await loadAllClubsForAdmin();
---

<BaseLayout title="Владельцы — Админка — respawn.kz">
  <section class="dashboard-page" id="admin-owners-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Владельцы клубов</h1>
        <p class="dashboard-page__subtitle">
          Привязка user_id (UUID из auth.users) к слугу клуба. Найти UID можно
          в <a href="/admin/users/">Пользователях</a> или в Supabase Dashboard.
        </p>
      </header>

      <DashboardNav variant="admin" active="/admin/owners/" />

      <div class="dashboard-loading" id="owners-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="owners-list" id="owners-list" hidden>
        {clubs.map((club) => (
          <article class="owner-card" data-club-slug={club.slug}>
            <div class="owner-card__header">
              <div>
                <h3 class="owner-card__title">
                  {club.name}
                  {!club.is_published && <span class="pill pill--draft" style="margin-left:8px">DRAFT</span>}
                </h3>
                <div class="owner-card__meta">{CITY_LABELS[club.city] ?? club.city} · {club.address}</div>
              </div>
              <code class="owner-card__slug">{club.slug}</code>
            </div>

            <div class="owner-card__current" data-current-for={club.slug}>
              <span style="color:var(--text-muted)">Загружаем владельцев…</span>
            </div>

            <div class="owner-card__form">
              <input
                type="text"
                class="auth-input"
                data-uid-input={club.slug}
                placeholder="UUID пользователя из auth.users"
                style="font-family:var(--font-mono,monospace);font-size:13px"
              />
              <button type="button" class="btn btn--primary btn--sm" data-grant={club.slug}>
                Привязать
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 3: Add CSS for .pill--draft**

Open `src/styles/global.css`. Find the `.pill--no-show` block. Add immediately after:

```css
.pill--draft {
  background: rgba(251, 146, 60, 0.15);
  color: rgb(253, 186, 116);
  border: 1px solid rgba(251, 146, 60, 0.3);
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/pages/admin/owners.astro src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(admin): /admin/owners loads clubs from DB incl. drafts

Uses loadAllClubsForAdmin (RLS allows super-admin to read all clubs).
Adds DRAFT pill for unpublished clubs in card title.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Update supabase-types.ts to re-export ClubRow

**Files:**
- Modify: `src/data/supabase-types.ts`

- [ ] **Step 1: Append ClubRow type re-export**

Open `src/data/supabase-types.ts`. At the END of the file, append:

```ts

// =====================================================================
// Club (re-export from clubs-loader for client scripts)
// =====================================================================

export type { ClubRow } from '../lib/clubs-loader';
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/data/supabase-types.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(types): re-export ClubRow from supabase-types

Allows client scripts to import { ClubRow } from supabase-types
alongside Booking, ClubApplication, etc., for symmetry.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: Update booking-real.ts — smart time picker + conflict check

**Files:**
- Modify: `src/scripts/booking-real.ts`

This is the largest single file change. Carefully replace the file contents.

- [ ] **Step 1: Read current file to confirm structure**

Read `C:\ClaudeCode\src\scripts\booking-real.ts` (existing 142 lines).

- [ ] **Step 2: Replace entire file**

Replace `src/scripts/booking-real.ts` with:

```ts
import { supabase } from '../lib/supabase';
import { type ClubRow } from '../data/supabase-types';
import type { NewBooking } from '../data/supabase-types';
import { openModal } from './modal';
import { saveReturnUrl, getCurrentUser } from './auth';
import { notify } from '../lib/notifications';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS_RU: Record<string, string> = {
  sun: 'воскресенье', mon: 'понедельник', tue: 'вторник', wed: 'среду',
  thu: 'четверг', fri: 'пятницу', sat: 'субботу',
};

interface BookedSlot { time_slot: string; hours: number; }

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function parseHour(t: string): number {
  return Number(t.split(':')[0]);
}

function formatHour(h: number): string {
  return String(h % 24).padStart(2, '0') + ':00';
}

function dayOfWeek(dateStr: string): string {
  return DAYS[new Date(dateStr + 'T00:00:00').getDay()];
}

function generateSlots(open: number, close: number): number[] {
  if (open === close) return [];
  const slots: number[] = [];
  if (close > open) {
    for (let h = open; h < close; h++) slots.push(h);
  } else {
    // overnight
    for (let h = open; h < 24; h++) slots.push(h);
    for (let h = 0; h < close; h++) slots.push(h);
  }
  return slots;
}

function isStartBlocked(startHour: number, duration: number, booked: BookedSlot[], allowed: number[]): boolean {
  const allowedSet = new Set(allowed);
  for (let i = 0; i < duration; i++) {
    const h = (startHour + i) % 24;
    if (!allowedSet.has(h)) return true;
    for (const b of booked) {
      const bStart = parseHour(b.time_slot);
      for (let j = 0; j < b.hours; j++) {
        if (((bStart + j) % 24) === h) return true;
      }
    }
  }
  return false;
}

async function fetchBookedForDay(slug: string, dateStr: string): Promise<BookedSlot[]> {
  const { data } = await supabase
    .from('bookings')
    .select('time_slot, hours')
    .eq('club_slug', slug)
    .eq('date', dateStr)
    .in('status', ['pending', 'confirmed']);
  return (data ?? []) as BookedSlot[];
}

function renderBookingForm(club: ClubRow): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  // 60 days out as max
  const max = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const maxStr = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, '0')}-${String(max.getDate()).padStart(2, '0')}`;

  return `
    <form id="booking-form" class="booking-form">
      <div class="booking-form__row">
        <label class="auth-field">
          <span class="auth-label">Дата</span>
          <input type="date" name="date" class="auth-input" required min="${todayStr}" max="${maxStr}" value="${todayStr}" />
        </label>
        <label class="auth-field">
          <span class="auth-label">Время</span>
          <select name="time_slot" class="auth-input" required>
            <option value="">— загрузка —</option>
          </select>
        </label>
        <label class="auth-field">
          <span class="auth-label">Часов</span>
          <input type="number" name="hours" class="auth-input" required min="1" max="12" value="2" />
        </label>
      </div>
      <div class="booking-form__notice" id="booking-notice" hidden></div>
      <div class="booking-form__total" id="booking-total">
        Итого: <strong>${formatPrice(club.price_per_hour * 2)} ₸</strong>
      </div>
      <button type="submit" class="btn btn--primary btn--large" style="width:100%">Забронировать</button>
      <div class="auth-error" id="booking-error" hidden></div>
    </form>
  `;
}

async function rebuildTimeSelect(
  club: ClubRow,
  dateStr: string,
  duration: number,
  timeSelect: HTMLSelectElement,
  noticeEl: HTMLElement,
): Promise<void> {
  const day = dayOfWeek(dateStr);
  const hours = club.working_hours?.[day];

  if (!hours) {
    timeSelect.innerHTML = '<option value="">— клуб закрыт —</option>';
    timeSelect.disabled = true;
    noticeEl.textContent = `Клуб не работает в ${DAY_LABELS_RU[day] ?? day}. Выбери другую дату.`;
    noticeEl.hidden = false;
    return;
  }

  const all24 = hours.open === '24h';
  const allowed = all24
    ? Array.from({ length: 24 }, (_, i) => i)
    : generateSlots(parseHour(hours.open), parseHour(hours.close));

  const booked = await fetchBookedForDay(club.slug, dateStr);

  const options = allowed.map((h) => {
    const blocked = isStartBlocked(h, duration, booked, allowed);
    const labelSuffix = blocked ? ' (занято)' : '';
    const disabledAttr = blocked ? ' disabled' : '';
    return `<option value="${formatHour(h)}"${disabledAttr}>${formatHour(h)}${labelSuffix}</option>`;
  });

  // Check if all options are blocked
  const allBlocked = allowed.every((h) => isStartBlocked(h, duration, booked, allowed));
  if (allowed.length === 0 || allBlocked) {
    timeSelect.innerHTML = '<option value="">— нет свободных слотов —</option>';
    timeSelect.disabled = true;
    noticeEl.textContent = 'На этот день нет свободных слотов с такой длительностью. Попробуй другую дату или меньше часов.';
    noticeEl.hidden = false;
    return;
  }

  timeSelect.innerHTML = options.join('');
  timeSelect.disabled = false;

  // If currently selected option became invalid, default to first non-blocked
  if (!timeSelect.value || timeSelect.options[timeSelect.selectedIndex]?.disabled) {
    const firstFree = Array.from(timeSelect.options).find((o) => !o.disabled);
    if (firstFree) timeSelect.value = firstFree.value;
  }

  noticeEl.hidden = true;
}

async function submitBooking(data: NewBooking): Promise<{ ok: boolean; bookingId?: string; error?: string }> {
  const { data: inserted, error } = await supabase
    .from('bookings')
    .insert(data)
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'unknown error' };
  return { ok: true, bookingId: inserted.id };
}

function parseClubData(btn: HTMLElement): ClubRow | null {
  const raw = btn.getAttribute('data-club');
  if (!raw) {
    console.error('[booking] missing data-club on button', btn);
    return null;
  }
  try {
    return JSON.parse(raw) as ClubRow;
  } catch (err) {
    console.error('[booking] invalid data-club JSON', err);
    return null;
  }
}

function translateError(msg: string): string {
  if (/past dates/i.test(msg)) return 'Нельзя бронировать на прошедшие даты.';
  if (/Club closed on/i.test(msg)) return 'Клуб закрыт в выбранный день.';
  if (/outside working hours/i.test(msg)) return 'Время вне часов работы клуба.';
  if (/overlaps with existing booking/i.test(msg)) return 'Этот слот уже забронирован. Выбери другое время.';
  if (/does not exist or is not published/i.test(msg)) return 'Клуб временно недоступен для бронирования.';
  return `Не удалось сохранить: ${msg}`;
}

async function handleBookingClick(btn: HTMLElement): Promise<void> {
  const club = parseClubData(btn);
  if (!club) return;

  const user = await getCurrentUser();
  if (!user) {
    saveReturnUrl(window.location.pathname + window.location.search);
    window.location.href = `/login/?return=${encodeURIComponent(window.location.pathname)}`;
    return;
  }

  openModal({
    title: `Забронировать — ${club.name}`,
    body: `
      <p style="margin-bottom:16px"><strong>${club.name}</strong> · ${club.district ?? ''} · ${club.address}</p>
      <p style="margin-bottom:16px;color:var(--text-secondary)">Цена: <span class="modal__highlight">${formatPrice(club.price_per_hour)} ₸/час</span></p>
      ${renderBookingForm(club)}
    `,
  });

  const form = document.getElementById('booking-form') as HTMLFormElement | null;
  const totalEl = document.getElementById('booking-total');
  const errorEl = document.getElementById('booking-error');
  const noticeEl = document.getElementById('booking-notice') as HTMLElement | null;
  if (!form || !noticeEl) return;

  const dateInput = form.querySelector('input[name="date"]') as HTMLInputElement;
  const timeSelect = form.querySelector('select[name="time_slot"]') as HTMLSelectElement;
  const hoursInput = form.querySelector('input[name="hours"]') as HTMLInputElement;

  async function refreshSlots() {
    const dur = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    await rebuildTimeSelect(club!, dateInput.value, dur, timeSelect, noticeEl!);
  }

  function updateTotal() {
    const h = Math.max(1, Math.min(12, Number(hoursInput.value) || 1));
    if (totalEl) totalEl.innerHTML = `Итого: <strong>${formatPrice(club!.price_per_hour * h)} ₸</strong>`;
  }

  dateInput.addEventListener('change', refreshSlots);
  hoursInput.addEventListener('input', () => { updateTotal(); refreshSlots(); });
  await refreshSlots();
  updateTotal();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const hours = Number(fd.get('hours') || 1);
    const newBooking: NewBooking = {
      user_id: user.id,
      club_slug: club.slug,
      club_name: club.name,
      city_id: club.city,
      date: fd.get('date') as string,
      time_slot: fd.get('time_slot') as string,
      hours,
      price_per_hour: club.price_per_hour,
      total_price: club.price_per_hour * hours,
    };

    if (!newBooking.time_slot) {
      if (errorEl) { errorEl.textContent = 'Выбери время.'; errorEl.hidden = false; }
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохраняем…';
    if (errorEl) errorEl.hidden = true;

    const result = await submitBooking(newBooking);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Забронировать';

    if (!result.ok) {
      if (errorEl) {
        errorEl.textContent = translateError(result.error ?? '');
        errorEl.hidden = false;
      }
      // Refresh slots — maybe a conflict appeared between check and submit
      await refreshSlots();
      return;
    }

    // Fire booking_created notification to club admins
    if (result.bookingId) {
      const { data: admins } = await supabase
        .from('club_admins')
        .select('user_id')
        .eq('club_slug', club.slug);
      const ownerEmails = (admins ?? []).map((a: { user_id: string }) => `user-${a.user_id.slice(0, 8)}@unknown`);
      await notify({
        type: 'booking_created',
        bookingId: result.bookingId,
        clubSlug: club.slug,
        ownerEmails,
      });
    }

    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    if (title) title.textContent = 'Бронь сохранена!';
    if (body) {
      body.innerHTML = `
        <p>Запись о брони добавлена.</p>
        <p style="margin-top:12px">Клуб <strong>${club.name}</strong>, дата <span class="modal__highlight">${newBooking.date}</span>, время <span class="modal__highlight">${newBooking.time_slot}</span>, <span class="modal__highlight">${hours} ч</span> · итого <span class="modal__highlight">${formatPrice(newBooking.total_price)} ₸</span>.</p>
        <p style="margin-top:12px;color:var(--text-secondary)">Статус: ожидает подтверждения. Управление: <a href="/me/" style="color:var(--neon-cyan)">личный кабинет</a>.</p>
      `;
    }
  });
}

export function setupBookingButtons(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-book]') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    handleBookingClick(btn);
  });
}
```

- [ ] **Step 3: Add CSS for notice**

Open `src/styles/global.css`. Find `.booking-form__total` block. Add immediately before it:

```css
.booking-form__notice {
  padding: 10px 14px;
  background: rgba(251, 146, 60, 0.12);
  border: 1px solid rgba(251, 146, 60, 0.3);
  color: rgb(253, 186, 116);
  border-radius: 8px;
  font-size: 14px;
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: 0 errors, builds 30 pages.

- [ ] **Step 5: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/booking-real.ts src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(booking): smart time picker with working hours + conflict detection

Replaces CLUBS.find with parseClubData reading data-club JSON attr.
On date/hours change, fetches existing pending+confirmed bookings,
generates allowed time slots from working_hours[day], marks blocked
starts as disabled with '(занято)'. Supports overnight ranges.

Russian-friendly error translation for DB trigger exceptions.
Max booking horizon = 60 days.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: Update filters.ts to read inline catalog-data JSON

**Files:**
- Modify: `src/scripts/filters.ts`

The catalog now serializes clubs into an inline `<script id="catalog-data">` instead of importing CLUBS.

- [ ] **Step 1: Read current filters.ts to understand current shape**

Read `C:\ClaudeCode\src\scripts\filters.ts` to confirm it currently imports CLUBS.

- [ ] **Step 2: Replace CLUBS import with inline JSON read**

In `src/scripts/filters.ts`, find this pattern:
```ts
import { CLUBS } from '../data/clubs';
// ... uses CLUBS array directly
```

Replace the import with:
```ts
import type { Club } from '../data/clubs';  // type-only if still using
```

Then near the top of the setup function (or at module scope), add:
```ts
function loadClubsFromInline(): Club[] {
  const el = document.getElementById('catalog-data');
  if (!el) {
    console.error('[filters] #catalog-data script tag not found');
    return [];
  }
  try {
    return JSON.parse(el.textContent ?? '[]') as Club[];
  } catch (err) {
    console.error('[filters] failed to parse #catalog-data', err);
    return [];
  }
}
const CLUBS = loadClubsFromInline();
```

This gives a local `CLUBS` const with the same shape as the old import, so the rest of `filters.ts` doesn't need to change. (Note: the inline JSON includes `price` and `reviews` as aliased fields per Task 9 serialization — matches old Club shape.)

- [ ] **Step 3: If `import type { Club } from '../data/clubs'` errors after clubs.ts is deleted (Task 19), switch to**:

Define the type inline at the top of filters.ts:
```ts
interface Club {
  slug: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  price: number;
  rating: number;
  reviews: number;
  tags: string[];
  gradient: string | null;
  initial: string | null;
  working_hours: Record<string, { open: string; close: string } | null>;
}
```

For NOW (before Task 19 deletes clubs.ts) the import works. We'll do the inline-type swap as part of Task 19 cleanup.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/filters.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(filters): read clubs from inline #catalog-data JSON

Removes direct CLUBS array import for catalog page filtering.
Reads serialized list from the script tag rendered by clubs/index.astro
frontmatter. Same shape, same downstream logic.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: Update dashboard.ts + dashboard-bookings.ts to fetch clubs from Supabase

**Files:**
- Modify: `src/scripts/dashboard.ts`
- Modify: `src/scripts/dashboard-bookings.ts`

- [ ] **Step 1: Read both files to find CLUBS usage**

Read both files. Both currently `import { CLUBS } from '../data/clubs'` and use `CLUBS.find(c => c.slug === b.club_slug)?.name` to get club name.

- [ ] **Step 2: Update dashboard.ts — fetch on setup**

In `src/scripts/dashboard.ts`, replace the `import { CLUBS } from '../data/clubs';` line with NO import (we'll fetch).

Replace the `getClubName(slug: string): string` function and its single CLUBS reference with:

```ts
let clubNameMap: Map<string, string> = new Map();

async function loadClubNames(): Promise<void> {
  const { data } = await supabase.from('clubs').select('slug, name');
  clubNameMap = new Map((data ?? []).map((c: { slug: string; name: string }) => [c.slug, c.name]));
}

function getClubName(slug: string): string {
  return clubNameMap.get(slug) ?? slug;
}
```

In `setupDashboard()`, at the start (right after the `requireClubAdmin()` call), add:

```ts
await loadClubNames();
```

- [ ] **Step 3: Update dashboard-bookings.ts**

In `src/scripts/dashboard-bookings.ts`, same pattern:

Replace `import { CLUBS } from '../data/clubs';` with NO import.

Add at module scope (after other imports):

```ts
interface ClubLite { slug: string; name: string; }
let allClubs: ClubLite[] = [];

async function loadClubsLite(): Promise<void> {
  const { data } = await supabase.from('clubs').select('slug, name');
  allClubs = (data ?? []) as ClubLite[];
}

function getClubName(slug: string): string {
  return allClubs.find((c) => c.slug === slug)?.name ?? slug;
}
```

In `setupDashboardBookings()`, at the start (right after `requireClubAdmin()`), add:

```ts
await loadClubsLite();
```

Then find the club filter population block:
```ts
const allowedClubs = isSuperAdmin
  ? CLUBS
  : CLUBS.filter((c) => clubSlugs.includes(c.slug));
allowedClubs.forEach((c) => {
  const opt = document.createElement('option');
  opt.value = c.slug;
  opt.textContent = c.name;
  clubSelect.appendChild(opt);
});
```

Replace with:
```ts
const allowedClubs = isSuperAdmin
  ? allClubs
  : allClubs.filter((c) => clubSlugs.includes(c.slug));
allowedClubs.forEach((c) => {
  const opt = document.createElement('option');
  opt.value = c.slug;
  opt.textContent = c.name;
  clubSelect.appendChild(opt);
});
```

- [ ] **Step 4: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/dashboard.ts src/scripts/dashboard-bookings.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(dashboard): fetch club names from Supabase, drop CLUBS import

dashboard.ts and dashboard-bookings.ts now load club slug→name
mapping on setup via supabase.from('clubs').select(). Removes
hardcoded CLUBS dependency. Filter dropdown for super-admins shows
all clubs in DB; for club_admins, only their assigned slugs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 15: Update admin-applications.ts to use RPC + slugify

**Files:**
- Modify: `src/scripts/admin-applications.ts`

- [ ] **Step 1: Update imports**

In `src/scripts/admin-applications.ts`, after the existing imports add:

```ts
import { generateUniqueClubSlug } from '../lib/slugify';
```

- [ ] **Step 2: Replace the approve branch in the click handler**

Find the existing approve flow within `listEl.addEventListener('click', ...)`. The current pattern is:

```ts
const result = await updateApplicationStatus(id, newStatus, note, user.id);
if (!result.ok) { /* ... */ return; }

const card = btn.closest('[data-app-id]') as HTMLElement;
const cardEmail = card.querySelector('.admin-app-card__contact')?.textContent?.match(/[\w.-]+@[\w.-]+/)?.[0] ?? '';

if (newStatus === 'approved') {
  await notify({ type: 'application_approved', applicationId: id, applicantEmail: cardEmail });
  alert(`Одобрено!\n\nЧто делать дальше:\n1. Добавь клуб в src/data/clubs.ts...`);
} else {
  await notify({ type: 'application_rejected', applicationId: id, applicantEmail: cardEmail, reason: note });
}

refresh();
```

Replace the entire `if (newStatus === 'approved') { ... } else { ... }` block AND the preceding `updateApplicationStatus` call with:

```ts
const card = btn.closest('[data-app-id]') as HTMLElement;
const cardEmail = card.querySelector('.admin-app-card__contact')?.textContent?.match(/[\w.-]+@[\w.-]+/)?.[0] ?? '';

if (newStatus === 'approved') {
  // Fetch the full application to get club_name for slug generation
  const { data: app, error: fetchErr } = await supabase
    .from('club_applications')
    .select('club_name')
    .eq('id', id)
    .single();
  if (fetchErr || !app) {
    btn.disabled = false;
    btn.textContent = oldText;
    alert(`Не удалось загрузить заявку: ${fetchErr?.message ?? 'unknown'}`);
    return;
  }

  // Generate unique slug from club_name (cyrillic-aware)
  let newSlug: string;
  try {
    newSlug = await generateUniqueClubSlug(app.club_name);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = oldText;
    alert(`Не удалось сгенерировать уникальный slug: ${(err as Error).message}`);
    return;
  }

  // Call RPC for atomic approval
  const { data: rpcSlug, error: rpcErr } = await supabase.rpc('approve_club_application', {
    p_application_id: id,
    p_club_slug: newSlug,
    p_review_note: note || null,
  });

  if (rpcErr) {
    btn.disabled = false;
    btn.textContent = oldText;
    alert(`Ошибка одобрения: ${rpcErr.message}`);
    return;
  }

  await notify({ type: 'application_approved', applicationId: id, applicantEmail: cardEmail });
  alert(
    `Одобрено!\n\nКлуб создан как DRAFT с slug "${rpcSlug}".\n\n` +
    `Дальше:\n` +
    `1. Заявитель (${cardEmail}) теперь club_admin этого клуба\n` +
    `2. Открой /dashboard/club/edit?slug=${rpcSlug} для редактирования (или жди что заявитель сам заполнит)\n` +
    `3. После заполнения — toggle is_published в той же форме`
  );
} else {
  // Reject path uses the old update flow (no RPC needed)
  const result = await updateApplicationStatus(id, newStatus, note, user.id);
  if (!result.ok) {
    btn.disabled = false;
    btn.textContent = oldText;
    alert(`Ошибка: ${result.error}`);
    return;
  }
  await notify({
    type: 'application_rejected',
    applicationId: id,
    applicantEmail: cardEmail,
    reason: note,
  });
}

refresh();
```

> NOTE: `updateApplicationStatus` helper is still used for the reject path. Keep it in the file. The approve path now uses the RPC which does its own update internally.

- [ ] **Step 3: Verify TS compiles**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/admin-applications.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(admin): approve flow uses RPC + auto slugify

Approve path: fetch app → generateUniqueClubSlug from club_name →
call approve_club_application RPC (creates draft club + binds owner +
marks app approved atomically). Old manual alert instructions
replaced with link to /dashboard/club/edit?slug=X.

Reject path unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 16: Update admin-owners.ts to handle DB-sourced clubs

**Files:**
- Modify: `src/scripts/admin-owners.ts`

The owners.astro page now SSGs club cards from DB (Task 10). Script no longer needs CLUBS import.

- [ ] **Step 1: Read current admin-owners.ts**

Read the file. It currently uses no CLUBS data on the JS side — only operates on the DOM that owners.astro renders. So nothing should need changing. Verify by:

```bash
grep -n "CLUBS\|from '../data/clubs'" src/scripts/admin-owners.ts
```

Expected: no matches. If grep returns matches, refactor them out.

- [ ] **Step 2: If no changes needed, mark task complete without commit**

Skip to next task if grep was clean.

If changes were needed, commit them:

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/admin-owners.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(admin-owners): drop CLUBS import (data comes from SSG'd DOM)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 17: Add "Мои клубы" block to /dashboard/index

**Files:**
- Modify: `src/pages/dashboard/index.astro`
- Modify: `src/scripts/dashboard.ts`

- [ ] **Step 1: Update dashboard/index.astro**

Open `src/pages/dashboard/index.astro`. Find the closing `</section>` of the page content. Add a NEW block immediately AFTER the existing `dashboard-empty` div and BEFORE `</section>` (the outer one):

```astro
      <div class="my-clubs" id="my-clubs" hidden>
        <h2>Мои клубы</h2>
        <div class="my-clubs__list" id="my-clubs-list"></div>
      </div>
```

- [ ] **Step 2: Update dashboard.ts to populate it**

In `src/scripts/dashboard.ts`, after the existing `// Recent bookings` block (where `recentEl.hidden = false;` is set), append:

```ts
  // Load and render user's clubs
  const myClubsEl = document.getElementById('my-clubs');
  const myClubsListEl = document.getElementById('my-clubs-list');
  if (myClubsEl && myClubsListEl) {
    const clubSlugList = isSuperAdmin ? [] : clubSlugs;  // super-admins see no "my clubs" block (they have /admin/)
    if (clubSlugList.length > 0) {
      const { data: myClubs } = await supabase
        .from('clubs')
        .select('slug, name, city, is_published, rating')
        .in('slug', clubSlugList);
      
      myClubsListEl.innerHTML = (myClubs ?? []).map((c: { slug: string; name: string; city: string; is_published: boolean; rating: number }) => `
        <article class="my-club-card">
          <div class="my-club-card__main">
            <strong>${c.name}</strong>
            ${!c.is_published ? '<span class="pill pill--draft" style="margin-left:8px">DRAFT</span>' : ''}
            <span class="my-club-card__meta">${c.city} · ★ ${c.rating ?? 0}</span>
          </div>
          <a href="/dashboard/club/edit?slug=${c.slug}" class="btn btn--ghost btn--sm">Редактировать</a>
        </article>
      `).join('');
      
      myClubsEl.hidden = false;
    }
  }
```

- [ ] **Step 3: Add CSS**

In `src/styles/global.css`, append:

```css

/* Мои клубы block on /dashboard/ */
.my-clubs {
  margin-top: 48px;
}

.my-clubs h2 {
  margin: 0 0 16px;
  font-size: 22px;
}

.my-clubs__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.my-club-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--glass-bg, rgba(255,255,255,0.03));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 12px;
}

.my-club-card__main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.my-club-card__meta {
  color: var(--text-secondary);
  font-size: 14px;
  margin-left: 12px;
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/pages/dashboard/index.astro src/scripts/dashboard.ts src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(dashboard): add 'Мои клубы' block with edit links

Lists clubs assigned to the user via club_admins. Each row shows
name + city + rating + DRAFT pill if unpublished + 'Редактировать'
link to /dashboard/club/edit?slug=X. Hidden for super-admin
(they go via /admin/) and for users with zero clubs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 18: Create /dashboard/club/edit page + script

**Files:**
- Create: `src/pages/dashboard/club/edit.astro`
- Create: `src/scripts/dashboard-club-edit.ts`
- Modify: `src/scripts/init.ts`

- [ ] **Step 1: Create the page**

Create directory `src/pages/dashboard/club/` if it doesn't exist. Then create `src/pages/dashboard/club/edit.astro`:

```astro
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import DashboardNav from '../../../components/DashboardNav.astro';
import { CITIES } from '../../../data/cities';
---

<BaseLayout title="Редактировать клуб — Кабинет — respawn.kz">
  <section class="dashboard-page" id="club-edit-root">
    <div class="container">
      <header class="dashboard-page__header">
        <h1 class="dashboard-page__title">Редактировать клуб</h1>
      </header>

      <DashboardNav variant="dashboard" />

      <div class="dashboard-loading" id="club-edit-loading">
        <p style="text-align:center;color:var(--text-muted)">Загружаем…</p>
      </div>

      <div class="club-edit-error" id="club-edit-error" hidden style="padding:24px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:rgb(248,113,113)"></div>

      <form id="club-edit-form" class="dashboard-form" hidden>
        <h2 class="club-edit-section">Основное</h2>

        <label class="auth-field">
          <span class="auth-label">Название *</span>
          <input type="text" name="name" class="auth-input" required maxlength="120" />
        </label>

        <div class="dashboard-form__row">
          <label class="auth-field">
            <span class="auth-label">Город *</span>
            <select name="city" class="auth-input" required>
              {CITIES.map((c) => <option value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label class="auth-field">
            <span class="auth-label">Район</span>
            <input type="text" name="district" class="auth-input" maxlength="120" />
          </label>
        </div>

        <label class="auth-field">
          <span class="auth-label">Адрес *</span>
          <input type="text" name="address" class="auth-input" required maxlength="200" />
        </label>

        <div class="dashboard-form__row">
          <label class="auth-field">
            <span class="auth-label">Телефон</span>
            <input type="tel" name="phone" class="auth-input" maxlength="40" />
          </label>
          <label class="auth-field">
            <span class="auth-label">Цена за час, ₸ *</span>
            <input type="number" name="price_per_hour" class="auth-input" required min="100" max="50000" step="100" />
          </label>
        </div>

        <label class="auth-field">
          <span class="auth-label">Описание</span>
          <textarea name="description" class="auth-input" rows="4" maxlength="1000"></textarea>
        </label>

        <h2 class="club-edit-section">Часы работы</h2>
        <p style="color:var(--text-secondary);font-size:14px">Можно задать одинаковые часы для всех дней через кнопку ниже.</p>

        <div class="time-picker" id="time-picker">
          <!-- 7 day rows generated by script -->
        </div>

        <button type="button" class="btn btn--ghost btn--sm" id="copy-mon-to-all" style="align-self:flex-start">Скопировать пн на все дни</button>

        <h2 class="club-edit-section">Каталог</h2>

        <div class="auth-field">
          <span class="auth-label">Тэги (что есть в клубе)</span>
          <div class="filter__tags" id="tags-checkboxes">
            <label class="tag-check"><input type="checkbox" name="tag" value="PC" /><span>PC</span></label>
            <label class="tag-check"><input type="checkbox" name="tag" value="PS5" /><span>PS5</span></label>
            <label class="tag-check"><input type="checkbox" name="tag" value="VR" /><span>VR</span></label>
            <label class="tag-check"><input type="checkbox" name="tag" value="Sim Racing" /><span>Sim Racing</span></label>
          </div>
        </div>

        <label class="auth-field">
          <span class="auth-label">Оборудование (по строчке)</span>
          <textarea name="equipment" class="auth-input" rows="5" placeholder="RTX 4080 / i7-13700K&#10;Мониторы 240Hz&#10;Razer DeathAdder V3"></textarea>
        </label>

        <h2 class="club-edit-section">Фото</h2>
        <p style="color:var(--text-secondary);font-size:14px">Внешние ссылки (Google Drive / Imgur / Яндекс.Диск). До 6 фото.</p>

        <div id="photos-list" class="photos-list"></div>
        <button type="button" class="btn btn--ghost btn--sm" id="add-photo" style="align-self:flex-start">+ Добавить фото</button>

        <h2 class="club-edit-section">Оформление</h2>

        <label class="auth-field">
          <span class="auth-label">Градиент (CSS, fallback когда нет фото)</span>
          <input type="text" name="gradient" class="auth-input"
                 placeholder="linear-gradient(135deg, #8b5cf6, #ec4899)" />
        </label>

        <!-- Publication toggle — visible only to super-admin (set by JS) -->
        <div id="publish-section" hidden>
          <h2 class="club-edit-section">Публикация</h2>
          <label style="display:flex;align-items:center;gap:12px">
            <input type="checkbox" name="is_published" />
            <span>Опубликован (виден в каталоге)</span>
          </label>
        </div>

        <div class="auth-error" id="club-edit-save-error" hidden></div>
        <div class="auth-success" id="club-edit-save-success" hidden></div>

        <button type="submit" class="btn btn--primary btn--large dashboard-form__submit">
          Сохранить
        </button>
      </form>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create dashboard-club-edit.ts**

Create `src/scripts/dashboard-club-edit.ts`:

```ts
import { supabase } from '../lib/supabase';
import { getRoles } from '../lib/roles';
import { type ClubRow } from '../data/supabase-types';

const DAYS = [
  { key: 'mon', label: 'Понедельник' },
  { key: 'tue', label: 'Вторник' },
  { key: 'wed', label: 'Среда' },
  { key: 'thu', label: 'Четверг' },
  { key: 'fri', label: 'Пятница' },
  { key: 'sat', label: 'Суббота' },
  { key: 'sun', label: 'Воскресенье' },
];

function renderDayRow(dayKey: string, dayLabel: string, hours: { open: string; close: string } | null): string {
  const closed = hours === null;
  const is24h = !closed && hours.open === '24h';
  return `
    <div class="time-picker-day" data-day="${dayKey}">
      <span class="time-picker-day__label">${dayLabel}</span>
      <label class="time-picker-day__check">
        <input type="checkbox" data-day-closed="${dayKey}" ${closed ? 'checked' : ''} />
        Закрыто
      </label>
      <label class="time-picker-day__check">
        <input type="checkbox" data-day-24h="${dayKey}" ${is24h ? 'checked' : ''} ${closed ? 'disabled' : ''} />
        24h
      </label>
      <input type="time" data-day-open="${dayKey}" value="${closed || is24h ? '10:00' : hours.open}" ${closed || is24h ? 'disabled' : ''} />
      <span>—</span>
      <input type="time" data-day-close="${dayKey}" value="${closed || is24h ? '02:00' : hours.close}" ${closed || is24h ? 'disabled' : ''} />
    </div>
  `;
}

function buildTimePicker(workingHours: ClubRow['working_hours']): string {
  return DAYS.map((d) => renderDayRow(d.key, d.label, workingHours[d.key] ?? null)).join('');
}

function readTimePicker(container: HTMLElement): ClubRow['working_hours'] {
  const result: ClubRow['working_hours'] = {};
  DAYS.forEach((d) => {
    const closed = (container.querySelector(`[data-day-closed="${d.key}"]`) as HTMLInputElement).checked;
    if (closed) {
      result[d.key] = null;
      return;
    }
    const is24h = (container.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement).checked;
    if (is24h) {
      result[d.key] = { open: '24h', close: '24h' };
      return;
    }
    const open = (container.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement).value;
    const close = (container.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement).value;
    result[d.key] = { open, close };
  });
  return result;
}

function attachDayHandlers(container: HTMLElement): void {
  DAYS.forEach((d) => {
    const closed = container.querySelector(`[data-day-closed="${d.key}"]`) as HTMLInputElement;
    const is24h = container.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement;
    const open = container.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement;
    const close = container.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement;
    closed.addEventListener('change', () => {
      const isClosed = closed.checked;
      is24h.disabled = isClosed;
      if (isClosed) is24h.checked = false;
      open.disabled = isClosed || is24h.checked;
      close.disabled = isClosed || is24h.checked;
    });
    is24h.addEventListener('change', () => {
      const is24 = is24h.checked;
      open.disabled = is24 || closed.checked;
      close.disabled = is24 || closed.checked;
    });
  });
}

function renderPhotoRow(url: string): string {
  return `
    <div class="photos-list__row">
      <input type="url" class="auth-input" value="${url}" placeholder="https://..." />
      <button type="button" class="btn btn--ghost btn--sm photos-list__remove">×</button>
    </div>
  `;
}

export async function setupDashboardClubEdit(): Promise<void> {
  const root = document.getElementById('club-edit-root');
  if (!root) return;

  const loadingEl = document.getElementById('club-edit-loading');
  const errorEl = document.getElementById('club-edit-error');
  const formEl = document.getElementById('club-edit-form') as HTMLFormElement | null;
  const successEl = document.getElementById('club-edit-save-success');
  const saveErrorEl = document.getElementById('club-edit-save-error');
  if (!loadingEl || !errorEl || !formEl || !successEl || !saveErrorEl) return;

  const url = new URL(window.location.href);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    loadingEl.hidden = true;
    errorEl.textContent = 'Нужен параметр ?slug=<club-slug> в URL.';
    errorEl.hidden = false;
    return;
  }

  // Gate: must be logged in + (super-admin OR admin of THIS slug)
  const roles = await getRoles();
  if (!roles.user) {
    window.location.href = `/login/?return=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }
  const isAuthorized = roles.isSuperAdmin || roles.clubSlugs.includes(slug);
  if (!isAuthorized) {
    loadingEl.hidden = true;
    errorEl.textContent = 'Нет доступа к редактированию этого клуба.';
    errorEl.hidden = false;
    return;
  }

  // Load club
  const { data: club, error: loadErr } = await supabase
    .from('clubs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (loadErr || !club) {
    loadingEl.hidden = true;
    errorEl.textContent = `Клуб не найден: ${loadErr?.message ?? 'no data'}`;
    errorEl.hidden = false;
    return;
  }
  const c = club as ClubRow;

  // Populate form
  (formEl.querySelector('[name="name"]') as HTMLInputElement).value = c.name;
  (formEl.querySelector('[name="city"]') as HTMLSelectElement).value = c.city;
  (formEl.querySelector('[name="district"]') as HTMLInputElement).value = c.district ?? '';
  (formEl.querySelector('[name="address"]') as HTMLInputElement).value = c.address;
  (formEl.querySelector('[name="phone"]') as HTMLInputElement).value = c.phone ?? '';
  (formEl.querySelector('[name="price_per_hour"]') as HTMLInputElement).value = String(c.price_per_hour);
  (formEl.querySelector('[name="description"]') as HTMLTextAreaElement).value = c.description ?? '';
  (formEl.querySelector('[name="gradient"]') as HTMLInputElement).value = c.gradient ?? '';
  (formEl.querySelector('[name="equipment"]') as HTMLTextAreaElement).value = (c.equipment ?? []).join('\n');

  // Tags
  c.tags.forEach((t) => {
    const cb = formEl.querySelector(`input[name="tag"][value="${t}"]`) as HTMLInputElement | null;
    if (cb) cb.checked = true;
  });

  // Time picker
  const picker = document.getElementById('time-picker')!;
  picker.innerHTML = buildTimePicker(c.working_hours ?? {});
  attachDayHandlers(picker);

  // Copy Monday to all
  document.getElementById('copy-mon-to-all')!.addEventListener('click', () => {
    const monClosed = (picker.querySelector('[data-day-closed="mon"]') as HTMLInputElement).checked;
    const mon24 = (picker.querySelector('[data-day-24h="mon"]') as HTMLInputElement).checked;
    const monOpen = (picker.querySelector('[data-day-open="mon"]') as HTMLInputElement).value;
    const monClose = (picker.querySelector('[data-day-close="mon"]') as HTMLInputElement).value;
    DAYS.slice(1).forEach((d) => {
      (picker.querySelector(`[data-day-closed="${d.key}"]`) as HTMLInputElement).checked = monClosed;
      (picker.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement).checked = mon24;
      (picker.querySelector(`[data-day-24h="${d.key}"]`) as HTMLInputElement).disabled = monClosed;
      (picker.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement).value = monOpen;
      (picker.querySelector(`[data-day-open="${d.key}"]`) as HTMLInputElement).disabled = monClosed || mon24;
      (picker.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement).value = monClose;
      (picker.querySelector(`[data-day-close="${d.key}"]`) as HTMLInputElement).disabled = monClosed || mon24;
    });
  });

  // Photos
  const photosList = document.getElementById('photos-list')!;
  function renderAllPhotos(urls: string[]) {
    photosList.innerHTML = urls.map(renderPhotoRow).join('');
  }
  renderAllPhotos(c.photos ?? []);

  document.getElementById('add-photo')!.addEventListener('click', () => {
    if (photosList.children.length >= 6) {
      alert('Максимум 6 фото');
      return;
    }
    photosList.insertAdjacentHTML('beforeend', renderPhotoRow(''));
  });

  photosList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.photos-list__remove');
    if (btn) btn.parentElement?.remove();
  });

  // Publication toggle visible only to super-admin
  if (roles.isSuperAdmin) {
    const pubSection = document.getElementById('publish-section')!;
    pubSection.hidden = false;
    (pubSection.querySelector('[name="is_published"]') as HTMLInputElement).checked = c.is_published;
  }

  loadingEl.hidden = true;
  formEl.hidden = false;

  // Submit
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    successEl.hidden = true;
    saveErrorEl.hidden = true;

    const tags = Array.from(formEl.querySelectorAll('input[name="tag"]:checked'))
      .map((el) => (el as HTMLInputElement).value);
    const equipment = (formEl.querySelector('[name="equipment"]') as HTMLTextAreaElement).value
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const photoUrls = Array.from(photosList.querySelectorAll('input[type="url"]'))
      .map((el) => (el as HTMLInputElement).value.trim())
      .filter(Boolean);
    const workingHours = readTimePicker(picker);

    const patch: Record<string, unknown> = {
      name: (formEl.querySelector('[name="name"]') as HTMLInputElement).value.trim(),
      city: (formEl.querySelector('[name="city"]') as HTMLSelectElement).value,
      district: (formEl.querySelector('[name="district"]') as HTMLInputElement).value.trim() || null,
      address: (formEl.querySelector('[name="address"]') as HTMLInputElement).value.trim(),
      phone: (formEl.querySelector('[name="phone"]') as HTMLInputElement).value.trim() || null,
      price_per_hour: Number((formEl.querySelector('[name="price_per_hour"]') as HTMLInputElement).value),
      description: (formEl.querySelector('[name="description"]') as HTMLTextAreaElement).value.trim() || null,
      gradient: (formEl.querySelector('[name="gradient"]') as HTMLInputElement).value.trim() || null,
      tags,
      equipment,
      photos: photoUrls,
      working_hours: workingHours,
      updated_at: new Date().toISOString(),
    };

    if (roles.isSuperAdmin) {
      patch.is_published = (document.querySelector('[name="is_published"]') as HTMLInputElement).checked;
    }

    const submitBtn = formEl.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохраняем…';

    const { error: updateErr } = await supabase.from('clubs').update(patch).eq('slug', slug);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Сохранить';

    if (updateErr) {
      saveErrorEl.textContent = `Не удалось сохранить: ${updateErr.message}`;
      saveErrorEl.hidden = false;
      return;
    }

    successEl.innerHTML = '<strong>Сохранено!</strong> Изменения появятся в каталоге после следующего деплоя.';
    successEl.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
```

- [ ] **Step 3: Wire into init.ts**

Open `src/scripts/init.ts`. Add import:

```ts
import { setupDashboardClubEdit } from './dashboard-club-edit';
```

Inside `init()`, after the `register-root` block:

```ts
if (document.getElementById('club-edit-root')) {
  setupDashboardClubEdit();
}
```

- [ ] **Step 4: Add CSS for time-picker and photos-list**

In `src/styles/global.css`, append:

```css

/* Club edit form */
.club-edit-section {
  margin: 32px 0 12px;
  font-size: 18px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}

.time-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.time-picker-day {
  display: grid;
  grid-template-columns: 120px auto auto 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
}

.time-picker-day__label {
  font-weight: 500;
}

.time-picker-day__check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.time-picker-day input[type="time"] {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  color: var(--text-primary, #fff);
  padding: 6px 8px;
  border-radius: 6px;
  font-family: inherit;
}

@media (max-width: 640px) {
  .time-picker-day {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .time-picker-day__label {
    grid-column: 1 / -1;
  }
}

/* Photos list */
.photos-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photos-list__row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.photos-list__row input {
  flex: 1;
}

.photos-list__remove {
  padding: 6px 12px !important;
}

.auth-success {
  padding: 14px 18px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: rgb(74, 222, 128);
  border-radius: 8px;
}
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: 0 errors, 31 pages (now includes /dashboard/club/edit/).

- [ ] **Step 6: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/pages/dashboard/club/edit.astro src/scripts/dashboard-club-edit.ts src/scripts/init.ts src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(dashboard): add /dashboard/club/edit page for club admins

Full edit form: name, address, phone, price_per_hour, description,
working_hours (7-day picker with closed/24h options + copy-mon-to-all
helper), tags (chips), equipment (textarea one-per-line), photos
(URL inputs up to 6), gradient fallback. is_published toggle visible
only to super-admin. Save updates clubs row; success notice mentions
deploy delay for catalog visibility.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 19: Delete src/data/clubs.ts after verifying zero imports

**Files:**
- Delete: `src/data/clubs.ts`
- Modify: `src/scripts/filters.ts` (inline type if needed)

- [ ] **Step 1: Grep for remaining imports of clubs.ts**

```bash
grep -rn "from '../data/clubs'\|from '../../data/clubs'\|from './data/clubs'" src/
```

Expected: only `src/scripts/filters.ts` should remain (type-only import).

If other files still import — go back and fix them before proceeding.

- [ ] **Step 2: Inline the Club type in filters.ts**

In `src/scripts/filters.ts`, find:
```ts
import type { Club } from '../data/clubs';
```

Replace with:
```ts
// Inline Club type (replaces import from deleted ../data/clubs)
interface Club {
  slug: string;
  name: string;
  city: string;
  district: string | null;
  address: string;
  phone: string | null;
  price: number;
  rating: number;
  reviews: number;
  tags: string[];
  gradient: string | null;
  initial: string | null;
  working_hours: Record<string, { open: string; close: string } | null>;
}
```

- [ ] **Step 3: Delete clubs.ts**

```bash
rm src/data/clubs.ts
```

- [ ] **Step 4: Verify build still works**

```bash
npm run build
```

Expected: 0 errors, 31 pages.

If errors about `Club` type from clubs.ts — fix by adding inline types or switching to ClubRow.

- [ ] **Step 5: Verify astro check**

```bash
npx astro check
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/scripts/filters.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" rm src/data/clubs.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor: delete src/data/clubs.ts, inline Club type in filters

Clubs now live in Supabase. clubs.ts removed. filters.ts gets an
inline Club interface that mirrors the shape serialized by the
clubs/index.astro frontmatter into the #catalog-data script tag.

Closes the Block 1 mock data → DB migration loop.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 20: Final verification + smoke test prep

**Files:** (no code changes — verification only)

- [ ] **Step 1: Run full verification**

```bash
npx astro check
npm run build
```

Both should exit 0 with no errors. Build should produce 31 pages.

- [ ] **Step 2: Check git log**

```bash
git log main..HEAD --oneline
```

Expected: ~18-20 commits on `feat/clubs-in-db` since branching from main.

- [ ] **Step 3: Run grep sanity checks**

```bash
# Ensure clubs.ts is deleted and not referenced
test ! -f src/data/clubs.ts && echo "clubs.ts deleted: OK"
grep -rn "from.*data/clubs'" src/ && echo "DANGLING IMPORTS FOUND" || echo "no dangling imports: OK"

# Confirm new files exist
ls -la src/lib/clubs-loader.ts src/lib/slugify.ts
ls -la src/pages/dashboard/club/edit.astro
ls -la src/scripts/dashboard-club-edit.ts
ls -la supabase/migrations/0007_clubs_table.sql supabase/migrations/0008_clubs_fk_and_slot_trigger.sql supabase/migrations/0009_approve_application_rpc.sql
ls -la scripts/seed-clubs.mjs
```

All checks should pass.

- [ ] **Step 4: Smoke scenarios to be done by controller after merge+deploy**

These are run by the controller (me) after subagent tasks complete:

**Scenario 1 — Catalog loads from DB:**
- `curl https://respawn.kz/clubs/` returns HTML mentioning 12 clubs from DB
- `curl https://respawn.kz/clubs/cyberzone/` returns club detail page

**Scenario 2 — Booking with slot validation:**
- Login → open /clubs/cyberzone/ → click Забронировать
- Time-select shows hours within club's working hours (cyberzone is 24h)
- Pick valid slot → submit → success
- Pick conflicting slot → "(занято)" shown in dropdown
- Try past date — DB rejects, UI shows Russian error

**Scenario 3 — Approve application → auto-create draft:**
- Logout, login as different user
- Submit application via /dashboard/register/
- Logout, login as super-admin (zhandos397@gmail.com)
- /admin/applications/ → click Approve → alert shows new slug
- Open /dashboard/club/edit?slug=NEW_SLUG → form loads draft data → fill in → save
- Toggle is_published → save → club now in catalog after next deploy

**Scenario 4 — Edit club from cabinet:**
- As super-admin: /dashboard/club/edit?slug=cyberzone → change price → save → success notice
- After deploy: /clubs/cyberzone/ shows new price

- [ ] **Step 5: No commit needed; report status**

Task 20 has no code changes. Report DONE to controller.

---

## Self-Review Checklist (for the implementer or controller)

After all 20 tasks:

- [ ] All 3 migrations applied via controller: 0007, 0008, 0009 (in correct order with seed in between)
- [ ] Seed script reports 12 inserted on first run, 0 inserted (12 skipped) on second run
- [ ] `select count(*) from clubs` = 12
- [ ] `select count(*) from pg_trigger where tgrelid='public.bookings'::regclass` = 2 (status + slot)
- [ ] `select proname from pg_proc where proname='approve_club_application'` returns 1 row
- [ ] `npx astro check` exits 0
- [ ] `npm run build` exits 0, 31 pages
- [ ] `src/data/clubs.ts` does not exist
- [ ] `grep -rn "from.*data/clubs'" src/` returns no matches
- [ ] All commit messages follow convention from sub-project 1
- [ ] feat/clubs-in-db branch is ready to merge to main

---

## Deploy Sequence (controller actions after subagent tasks complete)

1. **Apply migrations to prod:**
   ```bash
   DATABASE_URL="postgresql://..." node scripts/apply-sql.mjs supabase/migrations/0007_clubs_table.sql
   DATABASE_URL="postgresql://..." node scripts/seed-clubs.mjs
   DATABASE_URL="postgresql://..." node scripts/apply-sql.mjs supabase/migrations/0008_clubs_fk_and_slot_trigger.sql
   DATABASE_URL="postgresql://..." node scripts/apply-sql.mjs supabase/migrations/0009_approve_application_rpc.sql
   ```

2. **Verify (inline SQL or extend verify-b2b.mjs):**
   ```sql
   select count(*) from clubs;
   select count(*) from pg_trigger where tgrelid='public.bookings'::regclass and tgname like 'bookings_%';
   select proname from pg_proc where proname='approve_club_application';
   ```

3. **Merge and push:**
   ```bash
   git checkout main
   git merge --ff-only feat/clubs-in-db
   git push origin main
   git branch -d feat/clubs-in-db
   ```

4. **Deploy:**
   ```bash
   CLOUDFLARE_API_TOKEN="..." npm run deploy
   ```

5. **Smoke test:**
   - `curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/clubs/cyberzone/` → 200
   - `curl -s -o /dev/null -w "%{http_code}\n" https://respawn.kz/dashboard/club/edit?slug=cyberzone` → 200
   - Manual flow per Task 20 Step 4 scenarios

---

## Out of Scope (deferred)

- Photo upload via Supabase Storage (`photos: text[]` accepts external URLs only)
- Auto-rebuild on club edit (Cloudflare API trigger from save action)
- Booking edit (only cancel + re-book in MVP)
- Real reviews/rating updates (denormalized fields, manual updates for now)
- Per-day working hours UI uses same-every-day quick-fill; no separate weekend/weekday templates
- Slug rename for existing clubs (slug is PK, FK-referenced; rename requires careful ON UPDATE CASCADE)
