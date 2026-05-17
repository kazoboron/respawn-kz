# respawn.kz Clubs in Supabase DB + Slot Validation — Design Spec

**Date:** 2026-05-17
**Status:** Approved (sections 1-6 approved via "продолжай" iterations)
**Successor of:** [2026-05-16-respawn-kz-b2b-cabinet-design.md](2026-05-16-respawn-kz-b2b-cabinet-design.md)
**Closes:** Block 1 of project roadmap (B2B cabinet + Clubs in DB + Slot validation)

## Goal

Migrate the 12 mock clubs from `src/data/clubs.ts` to a real Supabase `clubs` table; refactor the SSG build to fetch clubs from DB at build time; add Postgres-trigger-enforced slot validation for bookings (no past dates, within working hours, no overlap); auto-create draft clubs on application approval; let club admins edit their clubs through the cabinet.

This is the consolidation of original Block 1 sub-projects #2 and #3 — merged because slot validation requires structured `working_hours` from the new clubs table.

## Scope

**In:**
- New `clubs` table with structured `working_hours` (jsonb), photos, equipment, tags
- Migration of 12 existing clubs (via `scripts/seed-clubs.mjs`)
- SSG build fetches from DB (no `clubs.ts`)
- Slot validation Postgres trigger (date/hours/overlap)
- B2B cabinet: approve application → atomic RPC creates draft club + binds owner
- `/dashboard/club/edit?slug=X` page for club admins (+ super-admin)
- Super-admin `is_published` toggle for draft → live
- Booking modal: time-picker filtered by working hours, conflict warnings on selected slots
- Foreign keys: `club_admins.club_slug` and `bookings.club_slug` → `clubs.slug`

**Out (deferred to later sub-projects):**
- Photo upload via Supabase Storage (external URLs only for MVP)
- Auto-rebuild on club edit via Cloudflare API trigger
- Booking edit (only cancel + re-book in MVP)
- Real rating/review system
- Per-day working hours UI editor (form supports same-every-day for MVP)
- Separate `/admin/clubs` page

## Architecture

### 1. Database Schema

#### `clubs` table

```sql
create table public.clubs (
  slug           text primary key,
  name           text not null,
  city           text not null,
  district       text,
  address        text not null,
  phone          text,

  price_per_hour int not null check (price_per_hour > 0),

  -- jsonb structure: {mon: {open: "10:00", close: "02:00"}, ..., sun: null}
  -- Special open/close value "24h" = round-the-clock for that day
  -- null for a day = closed that day
  working_hours  jsonb not null default '{}'::jsonb,

  description    text,
  tags           text[] default '{}',     -- ['PC', 'PS5', 'VR']
  equipment      text[] default '{}',     -- free-form bullet strings
  photos         text[] default '{}',     -- external URLs (MVP)

  -- Display fallbacks when photos[] is empty
  gradient       text,                    -- CSS linear-gradient
  initial        text,                    -- first letter for card placeholder

  -- Denormalized stats (manual or future trigger update)
  rating         numeric(2,1) default 0,
  reviews_count  int default 0,

  is_published   boolean default true,    -- false = draft

  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index clubs_city_idx on public.clubs (city) where is_published = true;
```

#### RLS on `clubs`

```sql
alter table public.clubs enable row level security;

create policy "anyone reads published clubs" on public.clubs
  for select using (is_published = true);

-- Super-admins read EVERYTHING incl. drafts
create policy "super_admins read all clubs" on public.clubs
  for select using (auth.uid() in (select user_id from public.super_admins));

-- Club_admins read drafts of their own clubs
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

> Note: club_admins cannot toggle `is_published`. Enforced at app level (form hides the toggle from non-super-admins). Could also enforce via separate UPDATE policy with column whitelist, but at-form-level is sufficient for MVP.

#### Foreign keys on existing tables

```sql
alter table public.club_admins
  add constraint club_admins_club_slug_fkey
  foreign key (club_slug) references public.clubs(slug) on delete cascade;

alter table public.bookings
  add constraint bookings_club_slug_fkey
  foreign key (club_slug) references public.clubs(slug);
```

Order matters: applied AFTER `clubs` is populated by seed.

#### Slot validation trigger

```sql
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
  -- Skip these checks when only status changes (status trigger handles its own rules)
  if TG_OP = 'UPDATE'
     and NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  -- 1. Date not in past
  if NEW.date < current_date then
    raise exception 'Cannot book past dates';
  end if;

  -- 2. Club exists and is published
  if not exists (select 1 from public.clubs where slug = NEW.club_slug and is_published = true) then
    raise exception 'Club % does not exist or is not published', NEW.club_slug;
  end if;

  -- 3. Time slot within working hours
  select working_hours into v_hours from public.clubs where slug = NEW.club_slug;
  v_day := lower(to_char(NEW.date, 'dy'));  -- 'mon','tue',...,'sun'

  if v_hours->v_day is null or v_hours->v_day = 'null'::jsonb then
    raise exception 'Club closed on %', v_day;
  end if;

  if (v_hours->v_day->>'open') = '24h' then
    null;  -- always open
  else
    v_open  := (v_hours->v_day->>'open')::time;
    v_close := (v_hours->v_day->>'close')::time;
    v_start := NEW.time_slot::time;
    v_end_time := (v_start + (NEW.hours || ' hours')::interval)::time;
    overnight := v_close < v_open;

    if not overnight then
      if v_start < v_open or v_end_time > v_close then
        raise exception 'Time slot %-% outside working hours (%-%)', v_start, v_end_time, v_open, v_close;
      end if;
    else
      -- For overnight (e.g., 10:00-02:00) booking is valid if:
      -- starts on/after open OR ends on/before close
      if not (v_start >= v_open or v_end_time <= v_close) then
        raise exception 'Time slot %-% outside working hours (% - % overnight)', v_start, v_end_time, v_open, v_close;
      end if;
    end if;
  end if;

  -- 4. No overlap with existing pending/confirmed booking
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

Two triggers now on `bookings`:
- `bookings_status_transition_check` (migration 0006) — fires on status change, enforces lifecycle
- `bookings_slot_validation` (this) — fires on date/time/hours change, enforces slot rules

They don't conflict because they listen to different UPDATE OF columns.

#### `approve_club_application` RPC

```sql
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
  if not found then raise exception 'Application not found'; end if;
  if v_app.status != 'pending' then raise exception 'Already %', v_app.status; end if;

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

### 2. Seed Existing Clubs

`scripts/seed-clubs.mjs` — node script reads `src/data/clubs.ts`, parses CLUBS array, INSERTs each via pg client with `ON CONFLICT (slug) DO NOTHING`.

Working hours conversion JS-side:
- `"Круглосуточно"` → all 7 days `{open: "24h", close: "24h"}`
- `"10:00–02:00"` → all 7 days `{open: "10:00", close: "02:00"}` (em dash normalized to hyphen)

Run **once** after migration 0007 is applied, **before** migration 0008 adds FK constraints.

### 3. Build-time Loader (`src/lib/clubs-loader.ts`)

Exports:
- `loadAllClubs()` — `select * from clubs where is_published = true order by rating desc`
- `loadClubBySlug(slug)` — single fetch with `is_published = true`
- `loadSimilarClubs(slug, limit)` — same city first, fill from others by rating

Used in SSG frontmatter of `/clubs/[slug].astro`, `/clubs/index.astro`, `/admin/owners.astro`.

`/dashboard/club/edit.astro` needs draft clubs visible too — uses different loader path (with RLS, super_admins and club_admins of that slug see drafts).

### 4. Client Scripts — How They Get Club Data

| Script | Need | Mechanism |
|--------|------|-----------|
| `booking-real.ts` | One club | Read `data-club` JSON attribute on `<button data-book>` (SSG-rendered) |
| `dashboard.ts` | Map slug→name | Fetch `select slug, name from clubs` once on setup, cache in Map |
| `dashboard-bookings.ts` | List of clubs for filter | Same fetch + cache pattern |
| `dashboard-club-edit.ts` | Full data for one club | Fetch on setup by `?slug=X` query param |
| `admin-applications.ts` | (none for clubs) | Unchanged |
| `admin-owners.ts` | All clubs (admin context, may include drafts) | Frontmatter loader OR fetch on setup |
| `admin-users.ts` | (none for clubs) | Unchanged |

### 5. New Page: `/dashboard/club/edit?slug=X`

Form sections:
1. **Basic info** — name, address, phone, description, city/district (read-only for now)
2. **Pricing** — price_per_hour
3. **Working hours** — 7-day editor: each day has checkbox "Closed", time pickers open/close, checkbox "24h"
4. **Catalog** — tags (chips), equipment (textarea, one per line)
5. **Photos** — list of URL inputs (add/remove)
6. **Display** — gradient (text + preview)
7. **Publication** — `is_published` toggle (**super-admin only**)

Gating:
- `requireClubAdmin()` + verify current user is admin of THIS slug OR is super-admin
- If accessed without `?slug` query → redirect to `/dashboard/`

Save:
- `supabase.from('clubs').update({...}).eq('slug', slug)`
- On success, show notice: "Saved. Will appear on site after next deploy."

### 6. Booking UI Changes (`booking-real.ts`)

When booking modal opens for club X:
- Parse `data-club` JSON from button → `{slug, name, price_per_hour, working_hours, city, address, district}`
- Build modal as before
- **New:** date input change → regenerate time-slot select based on `working_hours[dayOfWeek]`
- **New:** time/hours change → fetch existing bookings for that day, mark conflicting starts as disabled with "(занято)"
- On submit, DB trigger is backstop — catches anything UI missed, surfaces as Russian-friendly error

Helpers:
- `dayOfWeek(dateStr)` — returns 'mon'..'sun'
- `generateSlots(open, close)` — handles overnight (close < open)
- `isStartBlocked(startHour, duration, bookedSlots, allowedSlots)` — checks each hour in [start, start+duration) is allowed AND unbooked
- `fetchBookedForDay(slug, dateStr)` — query confirmed/pending bookings

### 7. Approve Flow Updated

`admin-applications.ts` approve handler:
1. Generate unique slug via `slugify(app.club_name)` + dedup loop (JS)
2. Call `supabase.rpc('approve_club_application', { p_application_id, p_club_slug, p_review_note })`
3. On success, show alert: "Клуб создан как черновик. Открыть для редактирования: /dashboard/club/edit?slug=X"
4. Refresh list

Old hardcoded alert with manual instructions for clubs.ts editing is removed.

## Migrations (3 files)

- `supabase/migrations/0007_clubs_table.sql` — clubs table + RLS
- `supabase/migrations/0008_clubs_fk_and_slot_trigger.sql` — FKs + slot validation trigger
- `supabase/migrations/0009_approve_application_rpc.sql` — RPC

And bundle: `supabase/apply_clubs.sql` — single-paste script that runs 0007 + seed query + 0008 + 0009 in order (replaces need for separate `seed-clubs.mjs` IF user prefers; both methods supported).

Actually the deployment plan uses **`scripts/seed-clubs.mjs`** for the seed step because it's cleaner than embedding 12 INSERT statements in SQL (and we already have the Postgres pg dep installed). `apply_clubs.sql` only bundles 0007, 0008, 0009 — seed is run between 0007 and 0008.

## Deploy Sequence

```
1. Apply migration 0007 (clubs table created, RLS active, empty)
   ↓
2. Run scripts/seed-clubs.mjs (12 rows inserted)
   ↓
3. Apply migration 0008 (FKs validate against seeded data, slot trigger active)
   ↓
4. Apply migration 0009 (RPC available)
   ↓
5. git merge feat/clubs-in-db → main, push
   ↓
6. npm run deploy (catalog/detail now load from DB)
   ↓
7. Smoke test: /clubs/, /clubs/cyberzone/, /admin/owners/ render from DB.
   Create test booking → slot picker works.
   Submit application, approve → draft club created.
```

## Files Created (9)

- `supabase/migrations/0007_clubs_table.sql`
- `supabase/migrations/0008_clubs_fk_and_slot_trigger.sql`
- `supabase/migrations/0009_approve_application_rpc.sql`
- `supabase/apply_clubs.sql`
- `scripts/seed-clubs.mjs`
- `src/lib/clubs-loader.ts`
- `src/lib/slugify.ts`
- `src/pages/dashboard/club/edit.astro`
- `src/scripts/dashboard-club-edit.ts`

## Files Modified (~10)

- `src/pages/clubs/index.astro` — load from DB
- `src/pages/clubs/[slug].astro` — load from DB; `data-club` attr on book button
- `src/pages/admin/owners.astro` — load from DB
- `src/pages/dashboard/index.astro` — add "Мои клубы" block with edit links
- `src/scripts/booking-real.ts` — read clubs from data-attrs; slot picker; conflict check
- `src/scripts/dashboard.ts` — fetch clubs via supabase
- `src/scripts/dashboard-bookings.ts` — fetch clubs via supabase
- `src/scripts/admin-applications.ts` — approve goes through RPC
- `src/scripts/admin-owners.ts` — adapt to DB-sourced clubs
- `src/scripts/init.ts` — wire setupDashboardClubEdit
- `src/styles/global.css` — styles for `.club-edit-*`, `.my-clubs`, time-picker
- `src/data/supabase-types.ts` — add ClubRow type (re-export from clubs-loader.ts)

## Files Deleted (1)

- `src/data/clubs.ts`

## Acceptance Criteria

1. `/clubs/` and `/clubs/[slug]/` render from DB (no `clubs.ts` import in build output)
2. `npm run build` succeeds with `clubs.ts` deleted
3. Approved application → draft club + owner_admin row + application.status='approved' (atomic via RPC)
4. Club admin can edit own club via `/dashboard/club/edit?slug=X`, save persists
5. Super-admin can toggle `is_published` (visible only to them)
6. Booking time-select shows only slots within club's working hours
7. Time-select marks occupied slots as disabled with "(занято)" suffix
8. Booking outside working hours → DB exception, surfaced as Russian error
9. Booking with overlap → DB exception, surfaced as Russian error
10. Booking on past date → DB exception, surfaced as Russian error
11. `src/data/clubs.ts` no longer exists; no dangling imports
12. Sub-project 1 (B2B cabinet) functionality intact — applications, owner mapping, /admin/users all work
13. `npx astro check` = 0 errors; `npm run build` = 0 warnings (besides pre-existing JSON-LD hint)
14. Existing prod bookings (currently zero) would not violate FK (zero-rows guarantee)

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Seed fails partway → partial DB state | Low | `ON CONFLICT (slug) DO NOTHING` makes seed idempotent. Verify count = 12 after. |
| FK migration 0008 fails because seed didn't complete | Low | Verify seed count before applying 0008. Scripted in deploy sequence. |
| Edit-to-deploy latency surprises users | Medium | UI shows "appears after next deploy" notice. Mitigation: future auto-rebuild trigger. |
| Slot trigger race condition: two clients pick same slot, both pass UI check, second fails on DB | Low | Exception bubbles up to UI, shows friendly error, user picks different slot. Standard DB-level concurrency handling. |
| `slugify` produces empty string for symbols-only names | Very low | Fallback `'club'` + suffix. Tested. |
| build needs `PUBLIC_SUPABASE_*` env vars | n/a | Already configured in Cloudflare Pages env. Verified by sub-project 1 working. |
| `clubs.ts` deleted before all consumers updated | Medium | Plan delete as last step, after grep verifies zero imports remain. |

## Effort Estimate

5-7 working days, ~16-20 commits, executed via subagent-driven-development workflow.

## Open Questions

None. All architectural decisions resolved during brainstorming sections 1-6.
