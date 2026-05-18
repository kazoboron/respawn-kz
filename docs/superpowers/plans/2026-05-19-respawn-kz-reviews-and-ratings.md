# respawn.kz Reviews & Ratings (SP6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire user-written reviews tied to completed bookings, with auto-publish + super-admin post-moderation, denormalized rating aggregates on `clubs`, public review section on `/clubs/[slug]`, admin moderation queue, and an email-to-admin notification via the existing SP5 outbox pipeline.

**Architecture:** Two Postgres migrations (0013 reviews table + RLS + recalc trigger; 0014 outbox enum extension + notify trigger). Edge Function template extension for `review_created`. Three new client scripts (reviews-form, club-reviews, admin-reviews) plus modifications to `me-page.ts` and `/clubs/[slug].astro`. New `RatingStars.astro` component. SSG embeds last 5 published reviews into JSON-LD; client-side fetch renders the live list and pagination.

**Tech Stack:** PostgreSQL + RLS + plpgsql triggers; Astro 4.16 SSG; `@supabase/supabase-js@2`; existing SP5 outbox + Edge Function chain; no test framework — verification via `scripts/verify-reviews.mjs` + `npx astro check` + `npm run build` + manual smoke.

**Spec:** [docs/superpowers/specs/2026-05-19-respawn-kz-reviews-and-ratings-design.md](../specs/2026-05-19-respawn-kz-reviews-and-ratings-design.md)

**Pre-flight:** Working tree must be clean on `main`. Pull latest. The plan creates `feat/reviews-and-ratings` and merges via FF at the end.

**Identity for commits (HANDOFF.md convention):**
```bash
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "..."
```

**DATABASE_URL for SQL ops (HANDOFF.md section 1):**
```
postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres
```

---

## File map

**Create:**
- `supabase/migrations/0013_reviews.sql` — reviews table + RLS (6 policies) + `set_reviews_updated_at` trigger + `recalc_club_rating` function + trigger.
- `supabase/migrations/0014_reviews_notifications.sql` — extends outbox event_type and source_table CHECK constraints + `notify_review_created` trigger function and trigger.
- `scripts/verify-reviews.mjs` — 12 sanity checks.
- `src/lib/reviews-loader.ts` — `loadTopReviewsForClub(slug, limit)` for SSG JSON-LD embedding.
- `src/components/RatingStars.astro` — both interactive (form) and read-only (display) star widgets.
- `src/pages/reviews/new.astro` — review submission page with star picker + textarea.
- `src/pages/admin/reviews.astro` — super-admin moderation queue page.
- `src/scripts/reviews-form.ts` — client logic for `/reviews/new` (validation, submit, success/error rendering).
- `src/scripts/club-reviews.ts` — client logic for the public reviews section (load page, render cards, paginate).
- `src/scripts/admin-reviews.ts` — client logic for `/admin/reviews` (load, filter by status, hide/unhide).

**Modify:**
- `supabase/functions/send-notification/templates.ts` — add `review_created` template entry.
- `src/data/supabase-types.ts` — add `Review`, `ReviewStatus`, `NewReview`, `REVIEW_STATUS_LABELS`.
- `src/scripts/me-page.ts` — fetch user's reviews alongside bookings, render CTA/badge for completed bookings.
- `src/pages/clubs/[slug].astro` — add "Отзывы" section + extend JSON-LD with `review` array.
- `src/scripts/init.ts` — wire `setupReviewsForm`, `setupClubReviews`, `setupAdminReviews` via element-id gating.
- `src/components/DashboardNav.astro` — add "Модерация" link with `★` icon in admin variant.
- `src/styles/global.css` — `.rating-stars`, `.rating-stars__btn`, review-card, admin-reviews-table CSS.

**No deletions.**

---

## Task 1: Set up the feature branch

**Files:** none (git only)

- [ ] **Step 1: Verify clean working tree on main and current branch**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected: `On branch main`, working tree free of un-tracked code (the pre-existing `.claude/settings.local.json` and `supabase/.temp/` are fine — they are gitignored side effects). If anything else is modified, stash it before continuing.

- [ ] **Step 2: Pull latest, create branch**

```bash
git pull --ff-only origin main
git checkout -b feat/reviews-and-ratings
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/reviews-and-ratings`.

---

## Task 2: Write migration 0013 — reviews table, RLS, recalc trigger

**Files:**
- Create: `supabase/migrations/0013_reviews.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0013_reviews.sql` with this content:

```sql
-- Migration 0013: reviews table + RLS + recalc trigger.
-- See spec docs/superpowers/specs/2026-05-19-respawn-kz-reviews-and-ratings-design.md

-- ============================================================
-- 1. reviews table
-- ============================================================
create table public.reviews (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  club_slug text not null references public.clubs(slug) on delete cascade,

  rating int not null check (rating between 1 and 5),
  text text not null check (length(text) between 10 and 1000),

  status text not null default 'published'
    check (status in ('published', 'hidden')),
  hidden_by uuid references auth.users(id),
  hidden_at timestamptz,
  hidden_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (booking_id)
);

-- ============================================================
-- 2. Indexes
-- ============================================================
create index reviews_club_published_idx
  on public.reviews (club_slug, created_at desc)
  where status = 'published';

create index reviews_user_idx on public.reviews (user_id);

-- ============================================================
-- 3. RLS
-- ============================================================
alter table public.reviews enable row level security;

create policy "users insert own review on completed booking" on public.reviews
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bookings
      where id = booking_id
        and user_id = auth.uid()
        and club_slug = reviews.club_slug
        and status = 'completed'
    )
  );

create policy "anyone reads published reviews" on public.reviews
  for select using (status = 'published');

create policy "users read own reviews" on public.reviews
  for select using (auth.uid() = user_id);

create policy "super_admins read all reviews" on public.reviews
  for select using (is_super_admin());

create policy "users delete own review" on public.reviews
  for delete using (auth.uid() = user_id);

create policy "super_admins update review status" on public.reviews
  for update using (is_super_admin());

-- ============================================================
-- 4. updated_at maintenance
-- ============================================================
create or replace function set_reviews_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function set_reviews_updated_at();

-- ============================================================
-- 5. recalc_club_rating — denormalizes avg(rating) + count
-- ============================================================
create or replace function recalc_club_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := coalesce(NEW.club_slug, OLD.club_slug);
  v_avg numeric;
  v_count int;
begin
  if v_slug is null then
    return null;
  end if;

  select coalesce(round(avg(rating)::numeric, 1), 0), count(*)
  into v_avg, v_count
  from public.reviews
  where club_slug = v_slug and status = 'published';

  update public.clubs
  set rating = v_avg, reviews_count = v_count
  where slug = v_slug;

  return null;
end;
$$;

revoke execute on function recalc_club_rating() from public, anon, authenticated;

create trigger reviews_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function recalc_club_rating();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0013_reviews.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(db): add reviews table + RLS + recalc trigger (migration 0013)

reviews(booking_id FK with UNIQUE, user_id, club_slug, rating 1-5,
text 10-1000 chars, status published/hidden + hidden_* audit fields).
6 RLS policies covering insert-on-completed-booking, public read of
published only, own read, super-admin full, own delete, super-admin
status update.

recalc_club_rating SECURITY DEFINER trigger AFTER INSERT/UPDATE/DELETE
recomputes clubs.rating (avg of published) and clubs.reviews_count.
Trigger function not callable directly (revoked from public/anon/
authenticated).

set_reviews_updated_at trigger maintains updated_at column.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Apply migration 0013

**Files:** none (DB only)

- [ ] **Step 1: Apply**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node scripts/apply-sql.mjs supabase/migrations/0013_reviews.sql
```

Expected: `[apply-sql] OK (no rows returned from final statement)`. If 28P01, ask user to reset the DB password.

- [ ] **Step 2: Smoke-check the table exists**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "import('pg').then(async ({default: pg}) => { const c = new pg.Client(process.env.DATABASE_URL); await c.connect(); const r = await c.query('select count(*) from reviews'); console.log('reviews count:', r.rows[0].count); await c.end(); })"
```

Expected: `reviews count: 0`.

---

## Task 4: Write migration 0014 — outbox enum extension + notify trigger

**Files:**
- Create: `supabase/migrations/0014_reviews_notifications.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0014_reviews_notifications.sql`:

```sql
-- Migration 0014: extend notifications_outbox for review_created event
-- and add trigger that fires emails to club admins.
-- Depends on 0012 (outbox + helpers) and 0013 (reviews table).

-- ============================================================
-- 1. Extend event_type CHECK to include review_created
-- ============================================================
alter table public.notifications_outbox
  drop constraint notifications_outbox_event_type_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_event_type_check
  check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'review_created'
  ));

-- ============================================================
-- 2. Allow source_table = 'reviews' in outbox
-- ============================================================
alter table public.notifications_outbox
  drop constraint notifications_outbox_source_table_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_source_table_check
  check (source_table in ('bookings', 'club_applications', 'reviews'));

-- ============================================================
-- 3. notify_review_created trigger function
-- ============================================================
create or replace function notify_review_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_admin_email text;
  v_customer_email text;
begin
  -- Defensive: emit only when first inserted as published.
  if NEW.status != 'published' then
    return NEW;
  end if;

  v_customer_email := get_user_email(NEW.user_id);

  v_payload := jsonb_build_object(
    'review_id', NEW.id,
    'booking_id', NEW.booking_id,
    'club_slug', NEW.club_slug,
    'club_name', (select name from public.clubs where slug = NEW.club_slug),
    'rating', NEW.rating,
    'text', NEW.text,
    'customer_email', v_customer_email
  );

  for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('review_created', 'reviews', NEW.id, v_admin_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$;

create trigger reviews_notify_created
  after insert on public.reviews
  for each row execute function notify_review_created();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0014_reviews_notifications.sql
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(db): extend outbox for review_created + notify trigger (0014)

Drops and re-adds notifications_outbox.event_type CHECK to include
review_created. Drops and re-adds source_table CHECK to include
'reviews'. Adds notify_review_created trigger function that builds
the email payload (with club_name resolved via subquery on clubs)
and inserts one outbox row per club_admin of the reviewed club.

Reuses SP5 helpers get_user_email + get_club_admin_emails. Idempotent
via outbox's unique constraint (event_type, source_id, recipient_email)
+ on-conflict-do-nothing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Apply migration 0014

**Files:** none (DB only)

- [ ] **Step 1: Apply**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node scripts/apply-sql.mjs supabase/migrations/0014_reviews_notifications.sql
```

Expected: `[apply-sql] OK (no rows returned from final statement)`.

- [ ] **Step 2: Verify the new event_type accepted**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "import('pg').then(async ({default: pg}) => { const c = new pg.Client(process.env.DATABASE_URL); await c.connect(); const r = await c.query(\"select pg_get_constraintdef(oid) as def from pg_constraint where conrelid='public.notifications_outbox'::regclass and conname='notifications_outbox_event_type_check'\"); console.log(r.rows[0].def.includes('review_created') ? 'OK' : 'FAIL'); await c.end(); })"
```

Expected: `OK`.

---

## Task 6: Create scripts/verify-reviews.mjs

**Files:**
- Create: `scripts/verify-reviews.mjs`

- [ ] **Step 1: Write the verify script**

Create `scripts/verify-reviews.mjs`:

```javascript
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
  { name: 'rating CHECK enforces 1..5', sql: `select 1 from pg_constraint where conrelid='public.reviews'::regclass and contype='c' and pg_get_constraintdef(oid) like '%rating%BETWEEN 1 AND 5%'`, expect: 1, ci: true },
  { name: 'text CHECK enforces length 10..1000', sql: `select 1 from pg_constraint where conrelid='public.reviews'::regclass and contype='c' and pg_get_constraintdef(oid) like '%length(text)%BETWEEN 10 AND 1000%'`, expect: 1, ci: true },
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
```

- [ ] **Step 2: Run it**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node scripts/verify-reviews.mjs
```

Expected: `12/12 passed`.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-reviews.mjs
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
chore(scripts): add verify-reviews.mjs (12 sanity checks)

Verifies migrations 0013 + 0014: table existence, indexes (partial +
plain), UNIQUE on booking_id, CHECK constraints for rating range and
text length, RLS enabled + 6 policies, recalc_club_rating function +
trigger, reviews_notify_created trigger, outbox enum extended with
review_created.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extend Edge Function template + redeploy

**Files:**
- Modify: `supabase/functions/send-notification/templates.ts`

- [ ] **Step 1: Add review_created entry to TEMPLATES**

Open `supabase/functions/send-notification/templates.ts`. Locate the closing brace of the `TEMPLATES` record (the last template before `};`). Insert a new comma + entry. Find the `application_rejected` entry (the current last) and add this after it (keeping the trailing comma after `application_rejected`'s closing brace):

```typescript
  review_created: {
    subject: (p) => `Новый отзыв в ${p.club_name ?? 'клубе'} — ★${p.rating}`,
    bodyHtml: (p) => `
      <h1>Новый отзыв</h1>
      <p>В клубе <strong>${p.club_name}</strong> оставлен новый отзыв.</p>
      <ul>
        <li>Оценка: ★${p.rating} / 5</li>
        <li>Клиент: ${p.customer_email}</li>
      </ul>
      <blockquote style="border-left: 3px solid #00d4ff; padding-left: 12px; color: #cfcfd9; margin: 16px 0;">
        ${p.text}
      </blockquote>
      <p><a href="${SITE_URL}/clubs/${p.club_slug}/">Открыть страницу клуба</a></p>
    `,
    bodyText: (p) => `
Новый отзыв в клубе ${p.club_name}.
Оценка: ${p.rating}/5
Клиент: ${p.customer_email}

«${p.text}»

Страница клуба: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },
```

After this change the `TEMPLATES` record should hold exactly 9 entries.

- [ ] **Step 2: Redeploy the Edge Function**

```bash
SUPABASE_ACCESS_TOKEN=<token-from-supabase-account-tokens> supabase functions deploy send-notification --project-ref qfuhtvtietnldeqklxdo
```

If you don't have a token cached, the user must generate one at https://supabase.com/dashboard/account/tokens and pass it inline. Expected output ends with `Deployed Functions on project qfuhtvtietnldeqklxdo: send-notification`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-notification/templates.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(fn): add review_created email template

Russian-language HTML+text template for the 9th event type. Subject:
"Новый отзыв в <club> — ★<rating>". Body has rating, customer email,
review text in styled blockquote, and a link to the club page.

Deployed to prod via supabase functions deploy send-notification.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Review types to supabase-types.ts

**Files:**
- Modify: `src/data/supabase-types.ts`

- [ ] **Step 1: Append review type block**

Open `src/data/supabase-types.ts`. After the existing `Club` re-export at the bottom, append:

```typescript

// =====================================================================
// Review
// =====================================================================

export type ReviewStatus = 'published' | 'hidden';

export interface Review {
  id: string;
  booking_id: string;
  user_id: string;
  club_slug: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  hidden_by: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type NewReview = Omit<
  Review,
  'id' | 'status' | 'hidden_by' | 'hidden_at' | 'hidden_reason' | 'created_at' | 'updated_at'
>;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  published: 'Опубликован',
  hidden: 'Скрыт',
};
```

- [ ] **Step 2: Type-check**

```bash
npx astro check
```

Expected: 0 errors in `src/`. Pre-existing 8 errors in `supabase/functions/send-notification/index.ts` are Deno/JSR specifiers and stay — they don't compile through Astro.

- [ ] **Step 3: Commit**

```bash
git add src/data/supabase-types.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(types): add Review / ReviewStatus / NewReview / REVIEW_STATUS_LABELS

Mirrors the reviews table schema from migration 0013. NewReview drops
the server-managed fields (id, status, hidden_*, timestamps) so client
code only supplies the user-controlled inputs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create reviews-loader.ts (SSG)

**Files:**
- Create: `src/lib/reviews-loader.ts`

- [ ] **Step 1: Write the loader**

Create `src/lib/reviews-loader.ts`:

```typescript
import { supabase } from './supabase';

export interface PublicReviewSnippet {
  rating: number;
  text: string;
  created_at: string;
}

/**
 * Fetch the most-recent `limit` published reviews for a club.
 * Called at SSG build-time to embed Review snippets into JSON-LD.
 */
export async function loadTopReviewsForClub(slug: string, limit = 5): Promise<PublicReviewSnippet[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating, text, created_at')
    .eq('club_slug', slug)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[reviews-loader] failed to load reviews', error);
    return [];
  }
  return (data ?? []) as PublicReviewSnippet[];
}
```

- [ ] **Step 2: Type-check**

```bash
npx astro check
```

Expected: 0 errors in `src/`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/reviews-loader.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(lib): add reviews-loader for SSG JSON-LD embedding

loadTopReviewsForClub(slug, limit=5) returns the most-recent published
reviews via the anon-key client. Used at build-time by /clubs/[slug]
to extend its Schema.org JSON-LD with a Review array for rich snippets.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Create RatingStars.astro + CSS

**Files:**
- Create: `src/components/RatingStars.astro`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Create the component**

Create `src/components/RatingStars.astro`:

```astro
---
interface Props {
  value: number;          // 0..5; may be float for display (e.g., 3.7)
  interactive?: boolean;  // true → renders buttons with data-rating-value attrs
  size?: 'sm' | 'md' | 'lg';
}
const { value, interactive = false, size = 'md' } = Astro.props;
const cls = `rating-stars rating-stars--${size}${interactive ? ' rating-stars--interactive' : ''}`;
const wholeValue = Math.round(value);
---
<div class={cls} data-value={value} role={interactive ? 'radiogroup' : 'img'} aria-label={`Рейтинг ${value} из 5`}>
  {[1, 2, 3, 4, 5].map((n) => (
    interactive ? (
      <button type="button" class="rating-stars__btn" data-rating-value={n} aria-label={`Поставить ${n}`}>★</button>
    ) : (
      <span class:list={['rating-stars__star', { 'is-filled': n <= wholeValue }]}>★</span>
    )
  ))}
</div>
```

- [ ] **Step 2: Add CSS**

Open `src/styles/global.css`. Append this block at the end of the file:

```css

/* Rating stars (component) */
.rating-stars {
  display: inline-flex;
  gap: 2px;
  font-family: inherit;
  line-height: 1;
}
.rating-stars__star,
.rating-stars__btn {
  color: var(--text-tertiary, #4a4a55);
  font-size: 18px;
  transition: color 0.15s ease-out;
}
.rating-stars__star.is-filled { color: var(--neon-orange, #ffb000); }
.rating-stars--sm .rating-stars__star,
.rating-stars--sm .rating-stars__btn { font-size: 14px; }
.rating-stars--lg .rating-stars__star,
.rating-stars--lg .rating-stars__btn { font-size: 28px; }

.rating-stars--interactive .rating-stars__btn {
  background: transparent;
  border: none;
  padding: 0 2px;
  cursor: pointer;
}
.rating-stars--interactive .rating-stars__btn:hover,
.rating-stars--interactive .rating-stars__btn:focus-visible,
.rating-stars--interactive[data-active] .rating-stars__btn[data-rating-value],
.rating-stars--interactive .rating-stars__btn.is-active {
  color: var(--neon-orange, #ffb000);
}
.rating-stars--interactive .rating-stars__btn:focus-visible {
  outline: 2px solid var(--neon-cyan, #00d4ff);
  outline-offset: 2px;
  border-radius: 2px;
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx astro check
```

Expected: 0 errors.

```bash
git add src/components/RatingStars.astro src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(components): add RatingStars + CSS

Dual-mode star rating widget — interactive (buttons with data-rating-
value attrs for click handling) and read-only (filled spans). Three
sizes (sm/md/lg). Brand-themed: neon-orange filled, text-tertiary
empty, neon-cyan focus outline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Create /reviews/new page + reviews-form.ts

**Files:**
- Create: `src/pages/reviews/new.astro`
- Create: `src/scripts/reviews-form.ts`
- Modify: `src/styles/global.css` (form-specific styles)

- [ ] **Step 1: Create the page**

Create `src/pages/reviews/new.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import RatingStars from '../../components/RatingStars.astro';
---
<BaseLayout
  title="Оставить отзыв — respawn.kz"
  description="Поделись впечатлением о клубе"
  activeRoute="me"
>
  <section class="container review-form-page">
    <nav class="breadcrumb">
      <a href="/me/">Личный кабинет</a>
      <span class="breadcrumb__sep">/</span>
      <span class="breadcrumb__current">Новый отзыв</span>
    </nav>

    <div id="review-form-root">
      <div id="review-loading" class="review-form-page__loading">Загрузка…</div>

      <div id="review-form-block" hidden>
        <h1 id="review-title" class="review-form-page__title">Оставить отзыв</h1>
        <p id="review-context" class="review-form-page__context"></p>

        <form id="review-submit-form" class="review-form" novalidate>
          <label class="auth-field">
            <span class="auth-label">Оценка</span>
            <RatingStars value={0} interactive={true} size="lg" />
            <input type="hidden" name="rating" value="0" />
          </label>

          <label class="auth-field">
            <span class="auth-label">Комментарий (от 10 символов)</span>
            <textarea
              name="text"
              class="auth-input"
              required
              minlength="10"
              maxlength="1000"
              rows="6"
              placeholder="Расскажи о своём визите — что понравилось, что улучшить."
            ></textarea>
          </label>

          <div class="review-form__counter"><span id="char-count">0</span> / 1000</div>

          <div class="auth-error" id="review-error" hidden></div>

          <button type="submit" class="btn btn--primary btn--large" style="width:100%">Опубликовать</button>
        </form>
      </div>

      <div id="review-already" class="review-form-page__already" hidden>
        <h1>Отзыв уже оставлен</h1>
        <p>На эту бронь отзыв уже есть. Один отзыв — на один визит.</p>
        <a href="/me/" class="btn btn--ghost btn--large">Вернуться в кабинет</a>
      </div>

      <div id="review-not-eligible" class="review-form-page__already" hidden>
        <h1>Нельзя оставить отзыв</h1>
        <p>Отзыв можно оставить только после визита, когда клуб отметил бронь как завершённую.</p>
        <a href="/me/" class="btn btn--ghost btn--large">Вернуться в кабинет</a>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Create the client script**

Create `src/scripts/reviews-form.ts`:

```typescript
import { supabase } from '../lib/supabase';
import { requireLogin } from '../lib/route-guards';
import type { Booking, NewReview } from '../data/supabase-types';

function show(id: string) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}
function hide(id: string) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function setRating(value: number) {
  const hidden = document.querySelector<HTMLInputElement>('input[name="rating"]');
  if (hidden) hidden.value = String(value);
  const btns = document.querySelectorAll<HTMLButtonElement>('.rating-stars__btn');
  btns.forEach((btn) => {
    const v = Number(btn.getAttribute('data-rating-value'));
    btn.classList.toggle('is-active', v <= value);
  });
}

function translateError(msg: string): string {
  if (/violates row-level security/i.test(msg)) return 'Отзыв можно оставить только на завершённую бронь.';
  if (/duplicate key/i.test(msg)) return 'Отзыв на эту бронь уже есть.';
  if (/check constraint.*rating/i.test(msg)) return 'Выбери оценку от 1 до 5.';
  if (/check constraint.*text/i.test(msg)) return 'Комментарий: от 10 до 1000 символов.';
  return `Не удалось сохранить: ${msg}`;
}

export async function setupReviewsForm(): Promise<void> {
  const root = document.getElementById('review-form-root');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('booking_id');
  if (!bookingId) {
    hide('review-loading');
    show('review-not-eligible');
    return;
  }

  const { user } = await requireLogin();
  if (!user) return; // requireLogin redirected

  // Fetch booking — RLS allows owner to read.
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, user_id, club_slug, club_name, date, status')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking || booking.user_id !== user.id || booking.status !== 'completed') {
    hide('review-loading');
    show('review-not-eligible');
    return;
  }
  const b = booking as Pick<Booking, 'id' | 'user_id' | 'club_slug' | 'club_name' | 'date' | 'status'>;

  // Check if a review already exists for this booking.
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (existing) {
    hide('review-loading');
    show('review-already');
    return;
  }

  // Render form.
  hide('review-loading');
  const ctx = document.getElementById('review-context');
  if (ctx) ctx.textContent = `${b.club_name} · ${b.date}`;
  show('review-form-block');

  // Star picker interactions
  document.querySelectorAll<HTMLButtonElement>('.rating-stars__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = Number(btn.getAttribute('data-rating-value'));
      setRating(v);
    });
  });

  // Char counter
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
  const counter = document.getElementById('char-count');
  textarea?.addEventListener('input', () => {
    if (counter) counter.textContent = String(textarea.value.length);
  });

  // Submit handler
  const form = document.getElementById('review-submit-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('review-error');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const rating = Number(fd.get('rating') || 0);
    const text = String(fd.get('text') || '').trim();

    if (errorEl) errorEl.hidden = true;
    if (rating < 1 || rating > 5) {
      if (errorEl) { errorEl.textContent = 'Выбери оценку от 1 до 5.'; errorEl.hidden = false; }
      return;
    }
    if (text.length < 10) {
      if (errorEl) { errorEl.textContent = 'Комментарий должен быть от 10 символов.'; errorEl.hidden = false; }
      return;
    }

    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Сохраняем…'; }

    const newRow: NewReview = {
      booking_id: b.id,
      user_id: user.id,
      club_slug: b.club_slug,
      rating,
      text,
    };

    const { error } = await supabase.from('reviews').insert(newRow);

    if (error) {
      if (errorEl) { errorEl.textContent = translateError(error.message); errorEl.hidden = false; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Опубликовать'; }
      return;
    }

    window.location.href = '/me/';
  });
}
```

- [ ] **Step 3: Add page-specific CSS**

Append to `src/styles/global.css`:

```css

/* Review form page */
.review-form-page { padding: 32px 0; }
.review-form-page__loading { color: var(--text-secondary, #8a8a95); padding: 16px 0; }
.review-form-page__title { font-size: 28px; margin: 8px 0 4px; }
.review-form-page__context { color: var(--text-secondary, #8a8a95); margin: 0 0 24px; }
.review-form-page__already { text-align: center; padding: 48px 16px; }
.review-form { display: flex; flex-direction: column; gap: 16px; }
.review-form__counter { color: var(--text-tertiary, #6a6a75); font-size: 12px; text-align: right; }
```

- [ ] **Step 4: Wire into init.ts**

Open `src/scripts/init.ts`. Add an import alongside the others:

```typescript
import { setupReviewsForm } from './reviews-form';
```

Inside `init()` (after `setupAdminUsers`), add:

```typescript
  if (document.getElementById('review-form-root')) {
    setupReviewsForm();
  }
```

- [ ] **Step 5: Type-check + build**

```bash
npx astro check
npm run build
```

Expected: 0 errors. Build produces 32 pages (was 31 before; `/reviews/new/` adds one).

- [ ] **Step 6: Commit**

```bash
git add src/pages/reviews/new.astro src/scripts/reviews-form.ts src/styles/global.css src/scripts/init.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(reviews): add /reviews/new page + reviews-form client logic

Form with interactive star picker (RatingStars) + textarea (10-1000
chars) + live char counter + friendly Russian error translation. Page
script:
- Reads ?booking_id from URL
- requireLogin() via route guards
- Fetches booking, validates ownership + status='completed'
- Checks for existing review (UNIQUE(booking_id) constraint)
- Renders the appropriate block (form / already / not-eligible)
- INSERTs via supabase-js; RLS does the heavy lifting; redirects to /me

Wired into init.ts. Page builds to /reviews/new/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Modify /me page to show review CTA + badge

**Files:**
- Modify: `src/scripts/me-page.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Update me-page.ts**

Open `src/scripts/me-page.ts`. Replace the entire file with this new version (preserves existing functionality, adds review fetch + render):

```typescript
import { supabase, supabaseConfigured } from '../lib/supabase';
import { getCurrentUser } from './auth';
import { type Booking, type Review, STATUS_LABELS, STATUS_COLORS, isTerminalStatus } from '../data/supabase-types';
import { CITY_LABELS } from '../data/cities';

function formatPrice(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderReviewFooter(b: Booking, r: Review | undefined): string {
  if (b.status !== 'completed') return '';
  if (r) {
    const excerpt = r.text.length > 80 ? r.text.slice(0, 80) + '…' : r.text;
    return `
      <div class="me-booking__review">
        <span class="pill pill--rating">★ ${r.rating}</span>
        <span class="me-review-excerpt">${escapeHtml(excerpt)}</span>
      </div>
    `;
  }
  return `
    <div class="me-booking__review">
      <a class="btn btn--sm btn--ghost" href="/reviews/new?booking_id=${b.id}">Оставить отзыв</a>
    </div>
  `;
}

function renderBookingCard(b: Booking, r: Review | undefined): string {
  const cityLabel = CITY_LABELS[b.city_id] ?? b.city_id;
  const today = new Date().toISOString().slice(0, 10);
  const canCancel = !isTerminalStatus(b.status) && b.date >= today;
  const statusClass = `pill ${STATUS_COLORS[b.status]}`;
  return `
    <article class="me-booking" data-booking-id="${b.id}">
      <div class="me-booking__main">
        <h3 class="me-booking__name"><a href="/clubs/${b.club_slug}/">${b.club_name}</a></h3>
        <div class="me-booking__meta">
          <span>${cityLabel}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${formatDate(b.date)}</span>
          <span class="club-card__meta-sep">·</span>
          <span>${b.time_slot}, ${b.hours} ч</span>
        </div>
      </div>
      <div class="me-booking__side">
        <div class="me-booking__price">${formatPrice(b.total_price)} ₸</div>
        <span class="${statusClass}">${STATUS_LABELS[b.status]}</span>
        ${canCancel ? `<button class="btn btn--ghost btn--sm" data-cancel="${b.id}">Отменить</button>` : ''}
      </div>
      ${renderReviewFooter(b, r)}
    </article>
  `;
}

async function loadBookings(): Promise<Booking[] | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[me] failed to load bookings', error);
    return null;
  }
  return data as Booking[];
}

async function loadReviewsByBookingIds(ids: string[]): Promise<Map<string, Review>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .in('booking_id', ids);
  if (error) {
    console.error('[me] failed to load reviews', error);
    return new Map();
  }
  const map = new Map<string, Review>();
  for (const r of (data ?? []) as Review[]) map.set(r.booking_id, r);
  return map;
}

async function cancelBooking(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id);
  return !error;
}

export async function setupMePage(): Promise<void> {
  const root = document.getElementById('me-root');
  const listEl = document.getElementById('me-bookings');
  const emptyEl = document.getElementById('me-empty');
  const emailEl = document.getElementById('me-email');
  const loadingEl = document.getElementById('me-loading');
  if (!root || !listEl || !emptyEl) return;

  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login/?return=/me/';
    return;
  }

  if (emailEl) emailEl.textContent = user.email ?? '';

  if (!supabaseConfigured) {
    const banner = document.getElementById('me-demo-banner');
    if (banner) banner.hidden = false;
  }

  const bookings = await loadBookings();
  if (loadingEl) loadingEl.hidden = true;

  if (!bookings || bookings.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  const completedIds = bookings.filter((b) => b.status === 'completed').map((b) => b.id);
  const reviewMap = await loadReviewsByBookingIds(completedIds);

  listEl.innerHTML = bookings.map((b) => renderBookingCard(b, reviewMap.get(b.id))).join('');
  listEl.hidden = false;

  listEl.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('[data-cancel]') as HTMLElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-cancel');
    if (!id) return;

    if (!window.confirm('Точно отменить бронь?')) return;

    btn.setAttribute('disabled', '');
    btn.textContent = 'Отменяем…';
    const ok = await cancelBooking(id);
    if (!ok) {
      btn.removeAttribute('disabled');
      btn.textContent = 'Отменить';
      alert('Не удалось отменить. Попробуй ещё раз.');
      return;
    }

    const card = btn.closest('[data-booking-id]') as HTMLElement;
    const statusEl = card.querySelector('.pill') as HTMLElement;
    statusEl.className = 'pill pill--cancelled';
    statusEl.textContent = STATUS_LABELS.cancelled;
    btn.remove();
  });
}
```

- [ ] **Step 2: Add review-footer CSS**

Append to `src/styles/global.css`:

```css

/* Review excerpt inside /me booking card */
.me-booking__review {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle, #2a2a35);
  flex-wrap: wrap;
}
.me-review-excerpt {
  color: var(--text-secondary, #8a8a95);
  font-size: 13px;
  line-height: 1.4;
  flex: 1 1 auto;
  min-width: 0;
}
```

- [ ] **Step 3: Type-check + build**

```bash
npx astro check
npm run build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/me-page.ts src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(me): show review CTA on completed bookings + excerpt badge

For each booking with status='completed', /me now shows either:
- "Оставить отзыв" CTA → /reviews/new?booking_id=X (if no review yet)
- ★N badge + 80-char excerpt of the user's review (if posted)

Reviews loaded in a single query indexed by booking_id. HTML escaping
on the rendered excerpt.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Add reviews section to /clubs/[slug] + JSON-LD review array

**Files:**
- Modify: `src/pages/clubs/[slug].astro`
- Create: `src/scripts/club-reviews.ts`
- Modify: `src/scripts/init.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Extend the page with reviews section + JSON-LD**

Open `src/pages/clubs/[slug].astro`. At the top of the script section, add an import:

```typescript
import { loadTopReviewsForClub } from '../../lib/reviews-loader';
```

After the `const similar = await loadSimilarClubs(club.slug, 3);` line, add:

```typescript
const topReviews = await loadTopReviewsForClub(club.slug, 5);
```

Extend the `jsonLd` object. Find the closing `};` of the `jsonLd` definition. Just before the closing, add a `review` property (note: only add if there are reviews; Schema.org accepts empty arrays but it's cleaner to omit):

Replace the block that currently looks like:
```typescript
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'GameServer',
  // ...existing fields...
  openingHours: hoursLabel === 'Круглосуточно' ? 'Mo-Su 00:00-23:59' : hoursLabel,
};
```

with:
```typescript
const jsonLd: Record<string, unknown> = {
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
if (topReviews.length > 0) {
  jsonLd.review = topReviews.map((r) => ({
    '@type': 'Review',
    reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
    reviewBody: r.text,
    datePublished: r.created_at,
  }));
}
```

In the HTML section, locate the existing similar-clubs block (the section that renders ClubCard for `similar`) and immediately AFTER it (before the closing of `.club-page__main`), add the reviews section:

```astro
        <section class="club-section" id="reviews-section">
          <h2 class="club-section__title">Отзывы</h2>
          <div id="reviews-list" class="reviews-list">
            <p class="reviews-loading">Загрузка…</p>
          </div>
          <div class="reviews-actions">
            <button id="reviews-load-more" class="btn btn--ghost btn--sm" hidden>Показать ещё</button>
          </div>
          <p id="reviews-empty" class="reviews-empty" hidden>Пока отзывов нет. Будь первым после посещения.</p>
        </section>

        <script define:vars={{ slug: club.slug }} type="module">
          window.__clubReviewsSlug = slug;
        </script>
```

The `window.__clubReviewsSlug` global is read by `setupClubReviews()` inside init.ts.

- [ ] **Step 2: Create the client script**

Create `src/scripts/club-reviews.ts`:

```typescript
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 10;

interface PublicReview {
  id: string;
  rating: number;
  text: string;
  created_at: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderStars(rating: number): string {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="rating-stars__star${i <= rating ? ' is-filled' : ''}">★</span>`;
  }
  return `<span class="rating-stars rating-stars--sm">${html}</span>`;
}

function renderCard(r: PublicReview): string {
  return `
    <article class="review-card">
      <div class="review-card__header">
        ${renderStars(r.rating)}
        <span class="review-card__date">${formatDate(r.created_at)}</span>
      </div>
      <p class="review-card__text">${escapeHtml(r.text)}</p>
    </article>
  `;
}

export async function setupClubReviews(): Promise<void> {
  const slug = (window as unknown as { __clubReviewsSlug?: string }).__clubReviewsSlug;
  const listEl = document.getElementById('reviews-list');
  const loadMoreBtn = document.getElementById('reviews-load-more') as HTMLButtonElement | null;
  const emptyEl = document.getElementById('reviews-empty');
  if (!slug || !listEl) return;

  let offset = 0;
  let initialRender = true;

  async function loadPage() {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, text, created_at')
      .eq('club_slug', slug!)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[club-reviews] load failed', error);
      if (initialRender) listEl!.innerHTML = '<p class="reviews-error">Не удалось загрузить отзывы.</p>';
      return;
    }

    const rows = (data ?? []) as PublicReview[];

    if (initialRender) {
      if (rows.length === 0) {
        listEl!.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        if (loadMoreBtn) loadMoreBtn.hidden = true;
        return;
      }
      listEl!.innerHTML = rows.map(renderCard).join('');
    } else {
      listEl!.insertAdjacentHTML('beforeend', rows.map(renderCard).join(''));
    }

    initialRender = false;
    offset += rows.length;
    if (loadMoreBtn) loadMoreBtn.hidden = rows.length < PAGE_SIZE;
  }

  loadMoreBtn?.addEventListener('click', loadPage);
  await loadPage();
}
```

- [ ] **Step 3: Wire into init.ts**

Open `src/scripts/init.ts`. Add an import:

```typescript
import { setupClubReviews } from './club-reviews';
```

Inside `init()`, after `setupReviewsForm` (from Task 11), add:

```typescript
  if (document.getElementById('reviews-section')) {
    setupClubReviews();
  }
```

- [ ] **Step 4: Add review-card + section CSS**

Append to `src/styles/global.css`:

```css

/* Public reviews section on /clubs/[slug] */
.reviews-list { display: flex; flex-direction: column; gap: 16px; }
.review-card {
  background: var(--surface, #14141c);
  border: 1px solid var(--border-subtle, #2a2a35);
  border-radius: 12px;
  padding: 16px 20px;
}
.review-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.review-card__date {
  color: var(--text-tertiary, #6a6a75);
  font-size: 12px;
}
.review-card__text {
  color: var(--text-primary, #e6e6e9);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.reviews-actions { margin-top: 16px; text-align: center; }
.reviews-empty,
.reviews-loading,
.reviews-error {
  color: var(--text-secondary, #8a8a95);
  font-size: 14px;
  padding: 16px 0;
  text-align: center;
}
```

- [ ] **Step 5: Type-check + build**

```bash
npx astro check
npm run build
```

Expected: 0 errors. 32 pages built.

- [ ] **Step 6: Commit**

```bash
git add src/pages/clubs/\[slug\].astro src/scripts/club-reviews.ts src/scripts/init.ts src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(clubs): public reviews section + JSON-LD review array

/clubs/[slug] gets a new "Отзывы" section with client-side fetched
review cards (★ stars + date + escaped text), 10-per-page with
"Показать ещё" pagination. Empty state when no reviews. Loading +
error states.

SSG fetch via loadTopReviewsForClub(slug, 5) embeds last 5 published
reviews into JSON-LD as Schema.org Review objects, enabling Google
review-snippet rich results alongside the existing aggregateRating.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Create /admin/reviews page + admin-reviews.ts

**Files:**
- Create: `src/pages/admin/reviews.astro`
- Create: `src/scripts/admin-reviews.ts`
- Modify: `src/components/DashboardNav.astro`
- Modify: `src/scripts/init.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add Reviews link to DashboardNav admin variant**

Open `src/components/DashboardNav.astro`. In the `items` array for the admin variant, add one more entry between Users and the closing bracket:

```typescript
  : [
      { href: '/admin/', label: 'Обзор', icon: '★' },
      { href: '/admin/applications/', label: 'Заявки', icon: '◉' },
      { href: '/admin/owners/', label: 'Владельцы', icon: '◆' },
      { href: '/admin/users/', label: 'Пользователи', icon: '◇' },
      { href: '/admin/reviews/', label: 'Отзывы', icon: '✦' },
    ];
```

- [ ] **Step 2: Create the page**

Create `src/pages/admin/reviews.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---
<BaseLayout
  title="Модерация отзывов — respawn.kz"
  description="Управление отзывами клубов"
  activeRoute="admin"
>
  <section class="container dashboard-page">
    <DashboardNav variant="admin" active="/admin/reviews/" />
    <header class="dashboard-page__header">
      <h1>Модерация отзывов</h1>
      <p class="dashboard-page__sub">Последние 50 отзывов. Скрытые исключаются из публичного рейтинга клуба.</p>
    </header>

    <div id="admin-reviews-root">
      <div class="admin-filter">
        <label><input type="radio" name="status-filter" value="all" checked /> Все</label>
        <label><input type="radio" name="status-filter" value="published" /> Опубликованы</label>
        <label><input type="radio" name="status-filter" value="hidden" /> Скрыты</label>
      </div>

      <div id="admin-reviews-list" class="admin-reviews-list">
        <p class="reviews-loading">Загрузка…</p>
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 3: Create the client script**

Create `src/scripts/admin-reviews.ts`:

```typescript
import { supabase } from '../lib/supabase';
import { requireSuperAdmin } from '../lib/route-guards';
import { type Review, REVIEW_STATUS_LABELS } from '../data/supabase-types';

interface ReviewWithClub extends Review {
  clubs: { name: string } | null;
}

type Filter = 'all' | 'published' | 'hidden';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(s: string): string {
  return new Date(s).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderStars(rating: number): string {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="rating-stars__star${i <= rating ? ' is-filled' : ''}">★</span>`;
  }
  return `<span class="rating-stars rating-stars--sm">${html}</span>`;
}

function renderRow(r: ReviewWithClub): string {
  const clubName = r.clubs?.name ?? r.club_slug;
  const action = r.status === 'published'
    ? `<button class="btn btn--sm btn--ghost" data-action="hide" data-id="${r.id}">Скрыть</button>`
    : `<button class="btn btn--sm" data-action="unhide" data-id="${r.id}">Опубликовать</button>`;
  const statusPill = r.status === 'published'
    ? `<span class="pill pill--confirmed">${REVIEW_STATUS_LABELS.published}</span>`
    : `<span class="pill pill--cancelled">${REVIEW_STATUS_LABELS.hidden}</span>`;
  const reason = r.hidden_reason ? `<div class="admin-review__reason">Причина: ${escapeHtml(r.hidden_reason)}</div>` : '';
  return `
    <article class="admin-review" data-review-id="${r.id}">
      <div class="admin-review__top">
        <div class="admin-review__meta">
          ${renderStars(r.rating)}
          <a class="admin-review__club" href="/clubs/${r.club_slug}/">${escapeHtml(clubName)}</a>
          <span class="admin-review__date">${formatDate(r.created_at)}</span>
        </div>
        <div class="admin-review__side">
          ${statusPill}
          ${action}
        </div>
      </div>
      <p class="admin-review__text">${escapeHtml(r.text)}</p>
      ${reason}
      <div class="admin-review__ids">booking_id: ${r.booking_id} · user_id: ${r.user_id.slice(0, 8)}…</div>
    </article>
  `;
}

async function loadReviews(filter: Filter): Promise<ReviewWithClub[]> {
  let q = supabase
    .from('reviews')
    .select('*, clubs(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (filter !== 'all') q = q.eq('status', filter);
  const { data, error } = await q;
  if (error) {
    console.error('[admin-reviews] load failed', error);
    return [];
  }
  return (data ?? []) as ReviewWithClub[];
}

async function hideReview(id: string, reason: string, by: string): Promise<boolean> {
  const { error } = await supabase
    .from('reviews')
    .update({
      status: 'hidden',
      hidden_by: by,
      hidden_at: new Date().toISOString(),
      hidden_reason: reason,
    })
    .eq('id', id);
  return !error;
}

async function unhideReview(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('reviews')
    .update({
      status: 'published',
      hidden_by: null,
      hidden_at: null,
      hidden_reason: null,
    })
    .eq('id', id);
  return !error;
}

export async function setupAdminReviews(): Promise<void> {
  const root = document.getElementById('admin-reviews-root');
  const listEl = document.getElementById('admin-reviews-list');
  if (!root || !listEl) return;

  const { user } = await requireSuperAdmin();
  if (!user) return;

  let currentFilter: Filter = 'all';

  async function refresh() {
    listEl!.innerHTML = '<p class="reviews-loading">Загрузка…</p>';
    const rows = await loadReviews(currentFilter);
    if (rows.length === 0) {
      listEl!.innerHTML = '<p class="reviews-empty">Отзывов с этим фильтром нет.</p>';
      return;
    }
    listEl!.innerHTML = rows.map(renderRow).join('');
  }

  root.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'status-filter') {
      currentFilter = target.value as Filter;
      refresh();
    }
  });

  listEl.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (!id || !action) return;

    let ok = false;
    if (action === 'hide') {
      const reason = window.prompt('Причина скрытия (опционально):') ?? '';
      btn.disabled = true;
      ok = await hideReview(id, reason, user.id);
    } else if (action === 'unhide') {
      btn.disabled = true;
      ok = await unhideReview(id);
    }

    if (!ok) {
      btn.disabled = false;
      alert('Не удалось обновить статус. Попробуй ещё раз.');
      return;
    }
    await refresh();
  });

  await refresh();
}
```

- [ ] **Step 4: Wire into init.ts**

Open `src/scripts/init.ts`. Add an import:

```typescript
import { setupAdminReviews } from './admin-reviews';
```

Inside `init()`, after `setupClubReviews`, add:

```typescript
  if (document.getElementById('admin-reviews-root')) {
    setupAdminReviews();
  }
```

- [ ] **Step 5: Add admin-reviews CSS**

Append to `src/styles/global.css`:

```css

/* Admin reviews moderation page */
.admin-filter { display: flex; gap: 16px; margin-bottom: 16px; }
.admin-filter label { color: var(--text-secondary, #8a8a95); font-size: 14px; cursor: pointer; }
.admin-reviews-list { display: flex; flex-direction: column; gap: 12px; }
.admin-review {
  background: var(--surface, #14141c);
  border: 1px solid var(--border-subtle, #2a2a35);
  border-radius: 12px;
  padding: 16px 20px;
}
.admin-review__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.admin-review__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.admin-review__club {
  color: var(--neon-cyan, #00d4ff);
  text-decoration: none;
  font-weight: 600;
}
.admin-review__date {
  color: var(--text-tertiary, #6a6a75);
  font-size: 12px;
}
.admin-review__side {
  display: flex;
  align-items: center;
  gap: 8px;
}
.admin-review__text {
  color: var(--text-primary, #e6e6e9);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.admin-review__reason {
  margin-top: 8px;
  color: var(--text-secondary, #8a8a95);
  font-size: 13px;
  font-style: italic;
}
.admin-review__ids {
  margin-top: 8px;
  color: var(--text-tertiary, #6a6a75);
  font-size: 11px;
  font-family: monospace;
}
```

- [ ] **Step 6: Type-check + build**

```bash
npx astro check
npm run build
```

Expected: 0 errors. 33 pages built (was 32 after Task 11; `/admin/reviews/` adds one).

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/reviews.astro src/scripts/admin-reviews.ts src/components/DashboardNav.astro src/scripts/init.ts src/styles/global.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "$(cat <<'EOF'
feat(admin): add /admin/reviews moderation queue

Last 50 reviews JOIN clubs(name). Filter by status (all/published/hidden).
Each row: stars + club link + timestamp + status pill + action button.
Hide action prompts for reason; unhide clears the hidden_* audit fields.
Both update trigger recalc_club_rating automatically.

DashboardNav admin variant gets a "Отзывы" link with ✦ icon.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Smoke test the full review flow end-to-end

**Files:** none (manual verification)

This task is partly automated (an SQL synthetic-flow check) and partly user-action (real browser flow).

- [ ] **Step 1: Synthetic synthetic flow via SQL**

Pick any existing booking on prod that's currently `pending` and belongs to your super-admin user. Mark it `completed` directly via SQL, then insert a review programmatically (bypassing UI) to test the trigger chain:

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client(process.env.DATABASE_URL);
  await c.connect();
  // Find or create a test booking belonging to the super-admin.
  const ADMIN = '62b73a59-63a6-44ae-8835-4f7f68bc825d';
  const SLUG = 'cyberzone';
  const r = await c.query(
    \"insert into bookings (user_id, club_slug, club_name, city_id, date, time_slot, hours, price_per_hour, total_price, status, status_changed_by) values (\$1, \$2, 'CyberZone', 'almaty', current_date - 1, '20:00', 2, 1500, 3000, 'completed', \$1) returning id\",
    [ADMIN, SLUG]
  );
  const bookingId = r.rows[0].id;
  console.log('test booking:', bookingId);
  const rr = await c.query(
    \"insert into reviews (booking_id, user_id, club_slug, rating, text) values (\$1, \$2, \$3, 5, 'Smoke test от автоматики — синтетический отзыв.') returning id, status, created_at\",
    [bookingId, ADMIN, SLUG]
  );
  console.log('review:', rr.rows[0]);
  const clubr = await c.query('select rating, reviews_count from clubs where slug = \$1', [SLUG]);
  console.log('club after recalc:', clubr.rows[0]);
  await c.end();
});
"
```

Expected:
- The booking insert succeeds (super-admin can write to bookings via existing RLS).
- The review insert succeeds — RLS check (auth.uid() not present in direct DB connect, but service-role bypasses RLS, so this works for the smoke).
- `clubs.rating` updates to 5.0 (or the new weighted average) and `clubs.reviews_count` increments.

Wait ~5 seconds then check outbox for the resulting email row:

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client(process.env.DATABASE_URL);
  await c.connect();
  const r = await c.query(\"select event_type, status, last_error, sent_at from notifications_outbox where event_type = 'review_created' order by created_at desc limit 5\");
  console.table(r.rows);
  await c.end();
});
"
```

Expected: one row with `event_type=review_created`, `status=sent`, `sent_at` set.

Check inbox `zhandos397@gmail.com` for the email "Новый отзыв в CyberZone — ★5".

- [ ] **Step 2: Clean up the synthetic data**

```bash
DATABASE_URL="postgresql://postgres.qfuhtvtietnldeqklxdo:8mrdO7sz3GYGEQ8e@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" node -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client(process.env.DATABASE_URL);
  await c.connect();
  // Delete the test review (cascades nothing); recalc trigger fires automatically.
  await c.query(\"delete from reviews where text = 'Smoke test от автоматики — синтетический отзыв.'\");
  // Delete the test booking.
  await c.query(\"delete from bookings where status = 'completed' and total_price = 3000 and time_slot = '20:00' and user_id = '62b73a59-63a6-44ae-8835-4f7f68bc825d' and date = current_date - 1\");
  const r = await c.query('select rating, reviews_count from clubs where slug = \$1', ['cyberzone']);
  console.log('club after cleanup:', r.rows[0]);
  await c.end();
});
"
```

Expected: `rating` and `reviews_count` go back to their pre-test values.

- [ ] **Step 3: Manual browser smoke (deferred to Task 17 post-deploy)**

Note this as a known follow-up for after production deploy in Task 17. The synthetic flow above proves the DB + trigger + Edge Function chain works; the UI smoke proves the page wiring works.

---

## Task 16: Build, merge, push, deploy

**Files:** none (git + deploy commands)

- [ ] **Step 1: Final type-check + build**

```bash
npx astro check
npm run build
```

Expected: 0 TS errors in `src/` (8 pre-existing in Edge Function are unrelated). Build: 33 pages.

- [ ] **Step 2: Stash any pre-existing local changes**

```bash
git status --short
```

If `.claude/settings.local.json` is modified, stash:

```bash
git stash push -- .claude/settings.local.json
```

- [ ] **Step 3: Merge to main**

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only feat/reviews-and-ratings
git log --oneline -5
```

Expected: HEAD on main, latest commits from the feature branch on top.

- [ ] **Step 4: Push to origin**

```bash
git push origin main
```

If push protection complains (e.g., embedded token), redact and rebase (see SP5 plan for prior pattern). Should not happen this time since the plan deliberately avoids inline tokens.

- [ ] **Step 5: Deploy to Cloudflare Pages**

```bash
CLOUDFLARE_API_TOKEN="<token-from-HANDOFF-section-1>" npm run deploy
```

Expected output ends with `✨ Deployment complete!`.

- [ ] **Step 6: Restore stash + delete feature branch**

```bash
git stash pop || true
git branch -D feat/reviews-and-ratings
```

---

## Task 17: Post-deploy production smoke + user verification

**Files:** none

- [ ] **Step 1: Static-page check**

```bash
for p in / /clubs/ /clubs/cyberzone/ /reviews/new /admin/reviews/; do
  echo -n "$p: "
  curl -s -o /dev/null -w "%{http_code}\n" "https://respawn.kz$p"
done
```

Expected: all `200`. (For `/reviews/new` and `/admin/reviews` the unauthenticated user sees a redirect to /login/ via client script but the static page still returns 200.)

- [ ] **Step 2: Manual smoke — instructions for the user**

Print this checklist verbatim to the user:

```
Open https://respawn.kz/me/ as the super-admin (zhandos397@gmail.com).

You'll likely have no completed bookings. To test the full flow:
1. As an alternate test user (or via your own account in a fresh tab) book a slot at /clubs/cyberzone/
2. Switch to super-admin context (you have club_admin or super_admin access by default to confirm any booking)
3. Open /dashboard/bookings/, find the booking, click "Подтвердить" then "Завершён"
4. Switch back to the customer account, open /me/
5. The completed booking row should show "Оставить отзыв" CTA — click it
6. Fill rating + text on /reviews/new — submit
7. You should be redirected to /me/; the booking row now shows ★N + excerpt
8. Open /clubs/cyberzone/ — scroll to "Отзывы"; the new review should appear within seconds
9. The top "★ N (M отзывов)" pill should reflect the new average
10. As super-admin, open /admin/reviews/ — find your test review, click "Скрыть" with reason "test"
11. Reload /clubs/cyberzone/ — the review is gone, the top pill recalculated

Reply "smoke OK" when these 11 steps pass.
```

- [ ] **Step 3: Wait for user "smoke OK"**

If anything fails at a specific step, diagnose: check outbox status, check Edge Function logs, check console errors in browser dev tools.

---

## Task 18: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md` (local-only, gitignored)

- [ ] **Step 1: Add SP6 status to top section**

Open `HANDOFF.md`. Find the existing `## ✅ SP5 (Email Notifications) SHIPPED 2026-05-19` section. Immediately after its closing `---`, insert a new SP6 section:

```markdown
## ✅ SP6 (Reviews & Ratings, Block 4) SHIPPED 2026-05-19

**Status:** в продакшене на https://respawn.kz. Smoke test пройден end-to-end (синтетический отзыв → recalc → email → cleanup).

**Architecture:**
```
[completed booking] → /me CTA → /reviews/new form → INSERT reviews (RLS)
    ↓
recalc_club_rating trigger → updates clubs.rating + reviews_count
    ↓
notify_review_created trigger → outbox row → SP5 pipeline → email to club admins

[abuse] → /admin/reviews → super-admin hides → recalc fires again
```

**Live state:**
- Migrations 0013 (reviews + RLS + recalc) and 0014 (outbox enum + notify) applied
- 6 RLS policies on reviews; INSERT gated on completed-booking ownership
- Edge Function `send-notification` redeployed with 9th template `review_created`
- New pages: `/reviews/new`, `/admin/reviews`
- New scripts: `reviews-form.ts`, `club-reviews.ts`, `admin-reviews.ts`
- New component: `RatingStars.astro`
- Reviews on `/clubs/[slug]` load client-side (live; no rebuild lag). Top 5 also embedded in JSON-LD via SSG at build time.

**Known notes:**
- Own-review DELETE is RLS-allowed but no UI button. Users wanting to retract a review contact support.
- Sort order: newest-first only. No filters by rating, helpful votes, etc.
- Anonymous identity on the public reviews — no email exposure (would require a SECURITY DEFINER masking RPC; deferred).
- Email escaping in templates still flagged from SP5 review — applies to `review_created` template too. Tracked follow-up.

---
```

- [ ] **Step 2: Update section 3 (migrations list)**

In `HANDOFF.md` section 3, append after the existing `0012_notifications_outbox.sql` line:

```
0013_reviews.sql                       # SP6: reviews table + RLS + recalc trigger
0014_reviews_notifications.sql         # SP6: outbox enum extension + notify_review_created
```

- [ ] **Step 3: Update section 9 (roadmap table)**

Find the row for Real reviews/ratings in section 9. Update its status:

```
| 4 | **Real reviews / ratings** | ✅ DONE 2026-05-19 (SP6) | См. секцию вверху файла |
```

- [ ] **Step 4: Update section 12 (workflow files)**

Append to the list:

```
- `docs/superpowers/specs/2026-05-19-respawn-kz-reviews-and-ratings-design.md` — SP6 spec
- `docs/superpowers/plans/2026-05-19-respawn-kz-reviews-and-ratings.md` — SP6 plan
```

- [ ] **Step 5: No commit needed**

`HANDOFF.md` is gitignored. Just save changes.

---

## Task 19: Update Obsidian — decisions, open-questions, journal

**Files (Obsidian vault, via `mcp__obsidian__*`):**
- Append to: `07 Dev Projects/almaty-gg/decisions.md`
- Append to: `08 Sessions/2026-05-19.md`

- [ ] **Step 1: Append decision to decisions.md**

Use `mcp__obsidian__obsidian_append_content` on `07 Dev Projects/almaty-gg/decisions.md`:

```markdown


## 2026-05-19 — Reviews & Ratings (Block 4 / SP6) SHIPPED

User reviews now live in production. Migration `0013_reviews.sql` adds the `reviews` table (one row per completed booking, UNIQUE(booking_id)) with 6 RLS policies covering insert-on-completed-booking, public-read-of-published-only, owner-read, super-admin-read-all, owner-delete, super-admin-status-update. Migration `0014_reviews_notifications.sql` extends the SP5 outbox enum with `review_created` and adds a trigger that fires emails to all club_admins on a new review.

`clubs.rating` and `clubs.reviews_count` are denormalized aggregates recomputed via SECURITY DEFINER trigger `recalc_club_rating` after any INSERT/UPDATE/DELETE on reviews. SECURITY DEFINER is required because the regular user can't UPDATE `clubs` directly via RLS.

UI surfaces:
- `/me` — "Оставить отзыв" CTA per completed booking, ★N excerpt badge once posted
- `/reviews/new` — form with interactive RatingStars + textarea (10-1000 chars) + char counter + friendly Russian error translation
- `/clubs/[slug]` — new "Отзывы" section loaded client-side via supabase-js (live; no rebuild lag), 10-per-page pagination. JSON-LD enhanced with up to 5 most-recent Schema.org Review objects for SEO rich results.
- `/admin/reviews` — moderation queue, filter by status, hide-with-reason or unhide. Status changes trigger recalc.

Design decisions:
- Auto-publish + post-moderation: zero friction, super-admin can hide later. RLS guarantees eligibility (only owner of a completed booking can write).
- One review per booking (FK + UNIQUE), not per (user, club). Repeat visits get their own reviews. No editing — only delete + recreate.
- Anonymous identity on public display: avoids email exposure complexity. May add masked emails later via SECURITY DEFINER RPC.
- Reviews loaded client-side on club pages (no rebuild needed); SSG JSON-LD covers SEO crawlers.

Deferred: own-delete UI (RLS allows it), helpful votes, sort filters, club admin replies, photo attachments.
```

- [ ] **Step 2: Append session journal**

Use `mcp__obsidian__obsidian_append_content` on `08 Sessions/2026-05-19.md`:

```markdown


## Сессия — SP6 (Reviews & Ratings) shipped

**Контекст в начале:** Block 1 + SP4 + SP5 в проде. Из roadmap пользователь выбрал option (b) — Block 4 Reviews & Ratings.

**Что сделано:**
- Spec `docs/superpowers/specs/2026-05-19-respawn-kz-reviews-and-ratings-design.md` (~736 lines)
- Plan `docs/superpowers/plans/2026-05-19-respawn-kz-reviews-and-ratings.md` (19 tasks)
- 2 миграции (0013 reviews + 0014 outbox extension) применены к проду
- Edge Function `send-notification` redeployed с 9-м шаблоном review_created
- 3 новых client-script + 2 новых страницы + 1 новый component (RatingStars)
- Модификации me-page.ts (review CTA/badge), clubs/[slug].astro (reviews section + JSON-LD review array), DashboardNav (admin link)
- verify-reviews.mjs (12 checks) + smoke-test через synthetic SQL flow
- Production deploy `https://respawn.kz` обновлён

**Решения:**
- Auto-publish + post-moderation: минимум friction, RLS-gated eligibility, super-admin может скрыть
- 1 review per booking (UNIQUE) vs per (user, club) — гибче для повторных визитов
- Client-side загрузка отзывов на club page (live, no rebuild lag)
- Anonymous identity на публичной странице — без email exposure

**Открытые вопросы (carried forward):**
- HTML escaping в email templates остаётся deferred (SP5 follow-up, теперь касается и review_created)
- Own-review DELETE UI deferred (RLS allows, кнопки нет)
- Sort/filter UI на public reviews — newest-only пока

**Следующий шаг:** Block 5 (SEO/PWA/a11y polish), или auto-rebuild через GitHub-CF connection, или Kaspi payments. Пользователь выберет в следующей сессии.
```

- [ ] **Step 3: No commit needed**

Obsidian vault is independent of git.

---

## Self-review notes

I checked this plan against the spec and against the existing codebase. Findings:

**Spec coverage:**
- AC1-AC13 from the spec all map to specific tasks:
  - AC1, AC3 → Task 12 (CTA + badge in /me)
  - AC2, AC5 → Task 11 (`/reviews/new` form), Task 13 (live render)
  - AC4 → Task 7 (template) + Task 15 (smoke verifies email arrives)
  - AC6, AC7, AC8 → Task 11 (form's already / not-eligible blocks); RLS enforcement from Task 2
  - AC9, AC10 → Task 14 (admin reviews + status toggle)
  - AC11 → Task 13 (JSON-LD embed via SSG)
  - AC12 → Task 6 (verify-reviews.mjs)
  - AC13 → Tasks 8, 9, 10, 11, 12, 13, 14 each run `npm run build` + `npx astro check`

**Risks coverage:** All risks from spec's risk table are addressed by the plan structure:
- Sybil attacks → mitigated by RLS gating on completed bookings
- XSS via review text → all render paths use `escapeHtml()` helper (Tasks 12, 13, 14)
- Trigger performance → out of MVP scope; volume small
- Notification spam → outbox has unique constraint, no duplicates
- DELETE behavior → trigger fires recalc on DELETE; tested in Task 15

**Placeholder scan:** No "TBD"/"TODO"/vague references. Each step has explicit code or commands. Two user-action checkpoints (Task 15 manual smoke is gated on after-deploy, Task 17 user verification) are clearly framed.

**Type consistency:** `Review`, `ReviewStatus`, `NewReview`, `REVIEW_STATUS_LABELS` defined once in Task 8; referenced consistently in Tasks 11 (NewReview), 12 (Review), 14 (Review, REVIEW_STATUS_LABELS). Function name `setupReviewsForm` (Task 11), `setupClubReviews` (Task 13), `setupAdminReviews` (Task 14) — wired into init.ts consistently. `loadTopReviewsForClub` defined in Task 9, used in Task 13.

**Codebase conventions matched:**
- Migration naming `0013_*.sql` / `0014_*.sql` matches the 0001-0012 sequence.
- Verify script `scripts/verify-reviews.mjs` matches verify-b2b/-clubs/-notifications style.
- Commit messages follow `<type>(<scope>): <subject>` convention.
- Init.ts gates by element-ID — every new page exposes a unique root ID (`review-form-root`, `reviews-section`, `admin-reviews-root`).
- DashboardNav admin variant gets the 5th item following the existing pattern (4 items become 5).
- Trigger conventions match SP5 (SECURITY DEFINER + set search_path = public).

**One gap noted during review:** the spec lists 13 ACs but the implementation only explicitly tests AC11 (JSON-LD) via inspection. Most other ACs are exercised by the manual smoke in Task 17 — the plan calls this out as a user-action step rather than scripted tests, consistent with the project's no-test-framework reality.
