# respawn.kz Reviews & Ratings (Block 4) — Design Spec

**Date:** 2026-05-19
**Status:** Draft — awaiting user review
**Sub-project:** SP6 (Block 4 in `07 Dev Projects/almaty-gg/roadmap.md`)
**Depends on:** SP5 (Email Notifications) — extends `notifications_outbox` event taxonomy

## Goal

Let users leave star-and-text reviews for clubs they have actually visited (completed booking required), auto-publish on submit with super-admin able to hide abusive content post-hoc, and surface aggregate ratings + recent reviews on the club detail page so the Schema.org `aggregateRating` already in JSON-LD reflects real data instead of zero.

User-visible outcome: `/me` shows "Оставить отзыв" next to each completed booking the user hasn't reviewed; submitting drops a review into the club's page within seconds; the club's gold-star pill on `/clubs/<slug>/` updates immediately; club admin gets an email; super-admin gets a `/admin/reviews` triage queue.

## Scope

**In:**
- Migration `0013_reviews.sql`:
  - `public.reviews` table (id, booking_id, user_id, club_slug, rating, text, status, hidden audit fields, timestamps) with `UNIQUE(booking_id)` for one-review-per-booking.
  - RLS policies: INSERT gated on completed-booking ownership, public read for `published` rows only, super-admin update for soft-hide, owner delete.
  - Trigger `recalc_club_rating` after INSERT/UPDATE/DELETE that updates `clubs.rating` (avg) and `clubs.reviews_count` (count of published rows).
- Migration `0014_reviews_notifications.sql`:
  - Extend `notifications_outbox.event_type` CHECK to include `review_created`.
  - Trigger `notify_review_created` on `reviews` AFTER INSERT that writes outbox rows for every club_admin of the reviewed club.
  - Edge Function `templates.ts` gets a new entry for `review_created` (Russian).
- New page `/reviews/new` (Astro page with client-side script): form with star picker + textarea + submit. Reads `?booking_id=...` from URL.
- New admin page `/admin/reviews`: list of last 50 published+hidden reviews with filter, "Скрыть"/"Опубликовать" toggle, link to source booking and club.
- Edits to `/me`:
  - For each completed booking without a review: "Оставить отзыв" CTA → `/reviews/new?booking_id=<id>`.
  - For each completed booking with a review: badge "Отзыв оставлен" + "★" thumbnail.
- Edits to `/clubs/[slug]/`:
  - New section "Отзывы (N)" below equipment/pricing. Renders client-side via Supabase JS, sorted by newest, paginated 10-per-click.
  - Top-N reviews (last 5) embedded in JSON-LD as `Review` array, so Google sees real review snippets.
- New component `RatingStars.astro`: interactive (form mode) and read-only (display mode) star picker. Reuse for the form, the `/me` thumbnail badge, and the public reviews section.
- `src/lib/reviews-loader.ts`: SSG fetchers for the JSON-LD embed (last 5 published per club).
- `src/scripts/reviews-form.ts`: client logic for `/reviews/new` submit + validation.
- `src/scripts/club-reviews.ts`: client logic for the club page "Отзывы" section (fetch, render, paginate).
- `src/scripts/admin-reviews.ts`: client logic for `/admin/reviews` (load, toggle status).
- Types in `src/data/supabase-types.ts`: `Review`, `ReviewStatus`, `STATUS_LABELS_REVIEW`, etc.
- Verification script `scripts/verify-reviews.mjs` with ~10 sanity checks.

**Out (deferred):**
- Edit own review — only delete+resubmit. Eliminates the rating-manipulation attack.
- Photo attachments — out of scope for v1; can be a SP7 if user demand emerges.
- Helpful/Not helpful votes, "Top reviews" sort — only newest sort for v1.
- Sort filters on the public page (by date, rating, etc.) — newest only.
- Club admin replies to reviews — needs a B2B-side UI, out of scope for v1.
- Review reporting flow — super-admin self-monitors via `/admin/reviews` for v1.
- Star rating filter on catalog (e.g., "show only 4★+ clubs") — UI work for a separate sub-project.
- Notification to user that their review was hidden — Super-admin should explain via direct contact for v1.
- Bulk moderation actions.
- Pagination of `/admin/reviews` beyond 50 — assume small volume for MVP.
- Translations / i18n — Russian-only matching SP5 templates.
- Edit-history / soft-delete of own reviews — `DELETE` removes the row entirely. Recreating is allowed.

## Architecture

### Event flow

```
[user, club, completed booking exists]
        │
        │ user clicks "Оставить отзыв" in /me
        ▼
   /reviews/new?booking_id=X
        │
        │ client validates + submits via supabase-js
        ▼
   INSERT into public.reviews
        │ RLS check: auth.uid() = user_id AND ...
        │ valid: trigger fires
        ▼
   ┌─────────────────────────────────────┐
   │ Trigger 1: recalc_club_rating       │
   │   updates clubs.rating + .reviews_count
   ├─────────────────────────────────────┤
   │ Trigger 2: notify_review_created    │
   │   inserts outbox row per club_admin
   │   → SP5 webhook → Edge Function     │
   │   → email "Новый отзыв" to admin    │
   └─────────────────────────────────────┘
        │
        ▼
   Review visible on /clubs/<slug>/ (status='published')
   /me shows "Отзыв оставлен" badge

[abuse case]
   super-admin /admin/reviews → "Скрыть"
        │
        ▼
   UPDATE reviews SET status='hidden' ... (RLS: super_admin only)
        │ Trigger 1 fires again on UPDATE
        ▼
   clubs.rating recalculated excluding hidden rows
   Review no longer visible on /clubs/<slug>/
```

### Why client-side load for /clubs/[slug] reviews

Static-generated pages (Astro SSG) only update on rebuild. With the existing `/dashboard/club/edit` auto-rebuild deferred (see SP4 spec), reviews would lag by minutes-to-hours. Client-side fetch via `supabase-js` (anon key + RLS-filtered to `published`) keeps the latest review on screen with no rebuild needed.

Trade-off: JS required. For an esports-club booking platform, JS-disabled audience is negligible. Schema.org JSON-LD still embeds the last 5 reviews via SSG fetch for SEO crawlers (which run JS less reliably). Worst case: rebuild lag for the JSON-LD blob, but the on-page reviews are always live.

### Why one trigger function chain (not Edge Function recalc)

`clubs.rating` and `clubs.reviews_count` denormalize aggregates. Recalculating in a Postgres trigger is:
- Atomic with the review write (same transaction)
- No network round-trip
- No race conditions vs an Edge Function poll
- Trivially simple SQL (a single AVG/COUNT query)

The trigger uses `SECURITY DEFINER` so the writer (regular authenticated user) can update `clubs` despite RLS blocking direct user writes.

### Why extend SP5 outbox (instead of a separate review-notify flow)

The notifications_outbox + Edge Function + Resend pipeline shipped in SP5 already handles cross-cutting notification. Adding `review_created` is a 4-line CHECK extension + 1 new trigger + 1 template. Eliminates duplicate infrastructure.

## Data model

### Migration `0013_reviews.sql`

```sql
-- Migration 0013: reviews table + RLS + recalc trigger.

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

create index reviews_club_published_idx
  on public.reviews (club_slug, created_at desc)
  where status = 'published';

create index reviews_user_idx on public.reviews (user_id);

alter table public.reviews enable row level security;

-- INSERT: caller can only insert a review attached to their own completed booking.
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

-- SELECT public: only published reviews are world-readable.
create policy "anyone reads published reviews" on public.reviews
  for select using (status = 'published');

-- SELECT own: author sees their own review at any status.
create policy "users read own reviews" on public.reviews
  for select using (auth.uid() = user_id);

-- SELECT super-admin: full visibility.
create policy "super_admins read all reviews" on public.reviews
  for select using (is_super_admin());

-- DELETE own: author can remove their own review (frees up booking_id for re-submit).
create policy "users delete own review" on public.reviews
  for delete using (auth.uid() = user_id);

-- UPDATE super-admin: status changes only (hide/unhide + reason). Other columns immutable.
create policy "super_admins update review status" on public.reviews
  for update using (is_super_admin());

-- updated_at maintenance.
create or replace function set_reviews_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function set_reviews_updated_at();

-- Recalc clubs.rating + clubs.reviews_count after any change in reviews.
-- SECURITY DEFINER so the update to clubs bypasses RLS (a regular user could
-- not otherwise update clubs even via trigger chain).
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
  if v_slug is null then return null; end if;

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
-- trigger context executes as the function owner regardless of grants

create trigger reviews_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function recalc_club_rating();
```

### Migration `0014_reviews_notifications.sql`

```sql
-- Migration 0014: extend outbox enum + notify_review_created trigger
-- Depends on 0012 (notifications_outbox) and 0013 (reviews).

-- 1. Extend event_type CHECK to include review_created
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

-- 2. Allow source_table = 'reviews' in outbox
alter table public.notifications_outbox
  drop constraint notifications_outbox_source_table_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_source_table_check
  check (source_table in ('bookings', 'club_applications', 'reviews'));

-- 3. Trigger function: notify all club_admins of the reviewed club
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
  -- Only emit on first publication. Hiding a review does NOT fire a new email.
  if NEW.status != 'published' then
    return NEW;
  end if;

  v_customer_email := get_user_email(NEW.user_id);

  v_payload := jsonb_build_object(
    'review_id', NEW.id,
    'booking_id', NEW.booking_id,
    'club_slug', NEW.club_slug,
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

## Edge Function — template addition

Edit `supabase/functions/send-notification/templates.ts`. Add to the `TEMPLATES` record:

```typescript
  review_created: {
    subject: (p) => `Новый отзыв в ${p.club_name ?? 'клубе'} — ★${p.rating}`,
    bodyHtml: (p) => `
      <h1>Новый отзыв</h1>
      <p>В твоём клубе оставлен новый отзыв.</p>
      <ul>
        <li>Оценка: ★${p.rating} / 5</li>
        <li>Клиент: ${p.customer_email}</li>
      </ul>
      <blockquote style="border-left: 3px solid #00d4ff; padding-left: 12px; color: #cfcfd9;">
        ${p.text}
      </blockquote>
      <p><a href="${SITE_URL}/clubs/${p.club_slug}/">Открыть страницу клуба</a></p>
    `,
    bodyText: (p) => `
Новый отзыв в твоём клубе.
Оценка: ${p.rating}/5
Клиент: ${p.customer_email}

«${p.text}»

Страница клуба: ${SITE_URL}/clubs/${p.club_slug}/
    `,
  },
```

The `club_name` field isn't on the review payload by default. Either:
- (a) Resolve it inside the trigger by joining `clubs` — pass into payload.
- (b) Resolve it inside Edge Function via DB query.

Choose (a): trigger already touches `clubs` via the recalc function and we pass denormalized data through outbox already.

Update the trigger to include `club_name`:

```sql
  v_payload := jsonb_build_object(
    'review_id', NEW.id,
    'booking_id', NEW.booking_id,
    'club_slug', NEW.club_slug,
    'club_name', (select name from public.clubs where slug = NEW.club_slug),
    'rating', NEW.rating,
    'text', NEW.text,
    'customer_email', v_customer_email
  );
```

## Pages

### `/me` (modify)

The booking card layout in `src/scripts/me-page.ts` gets one extra block at the bottom of each completed booking card. Pseudocode:

```typescript
function renderBookingCard(b: Booking, ownReview: Review | null): string {
  const isCompleted = b.status === 'completed';
  const hasReview = ownReview != null;

  return `
    <article class="me-booking" data-booking-id="${b.id}">
      <!-- existing main + side blocks -->
      ${isCompleted ? renderReviewFooter(b, ownReview) : ''}
    </article>
  `;
}

function renderReviewFooter(b: Booking, r: Review | null): string {
  if (r) {
    return `
      <div class="me-booking__review">
        <span class="pill pill--rating">★ ${r.rating}</span>
        <span class="me-review-excerpt">${escapeHtml(r.text.slice(0, 80))}${r.text.length > 80 ? '…' : ''}</span>
      </div>
    `;
  }
  return `
    <div class="me-booking__review">
      <a class="btn btn--sm" href="/reviews/new?booking_id=${b.id}">Оставить отзыв</a>
    </div>
  `;
}
```

We need a fetch of all the user's reviews in one query alongside the bookings query (already exists). Add:

```typescript
async function loadReviewsForBookings(bookingIds: string[]): Promise<Map<string, Review>> {
  if (bookingIds.length === 0) return new Map();
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .in('booking_id', bookingIds);
  const map = new Map<string, Review>();
  for (const r of (data ?? [])) map.set(r.booking_id, r);
  return map;
}
```

### `/reviews/new` (new page)

`src/pages/reviews/new.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---
<BaseLayout title="Оставить отзыв — respawn.kz" activeRoute="me">
  <section class="container" id="review-form-root">
    <nav class="breadcrumb">
      <a href="/me/">Личный кабинет</a>
      <span class="breadcrumb__sep">/</span>
      <span class="breadcrumb__current">Новый отзыв</span>
    </nav>

    <div id="review-loading">Загрузка…</div>
    <div id="review-form" hidden>
      <h1 id="review-title">Оставить отзыв</h1>

      <form id="review-submit-form">
        <label class="auth-field">
          <span class="auth-label">Оценка</span>
          <div id="rating-picker" data-value="0"></div>
        </label>
        <label class="auth-field">
          <span class="auth-label">Комментарий (от 10 символов)</span>
          <textarea name="text" class="auth-input" required minlength="10" maxlength="1000" rows="6"></textarea>
        </label>
        <div class="review-form__counter"><span id="char-count">0</span>/1000</div>
        <button type="submit" class="btn btn--primary btn--large">Опубликовать</button>
        <div class="auth-error" id="review-error" hidden></div>
      </form>
    </div>
    <div id="review-already" hidden>
      <p>На эту бронь отзыв уже оставлен.</p>
      <a href="/me/" class="btn btn--ghost">Вернуться в кабинет</a>
    </div>
  </section>

  <script>
    import { setupReviewForm } from '../../scripts/reviews-form';
    setupReviewForm();
  </script>
</BaseLayout>
```

`src/scripts/reviews-form.ts` is responsible for:
1. `requireLogin()` via route-guards.
2. Read `booking_id` from query string.
3. Fetch the booking, verify it's the user's own + status='completed'. If not → redirect to `/me`.
4. Fetch existing review with `booking_id`. If present → show "already" block.
5. Render interactive star picker (5 buttons, hover highlights).
6. On submit: validate + INSERT into `reviews` via supabase-js. RLS does the heavy lifting.
7. On success: redirect to `/me`.
8. On error: render friendly Russian text (translate common error codes).

### `/clubs/[slug]/` (modify)

Add a new section between similar-clubs and the page footer:

```astro
<section class="club-section" id="reviews-section">
  <h2 class="club-section__title">Отзывы</h2>
  <div id="reviews-list">Загрузка отзывов…</div>
  <button id="reviews-load-more" class="btn btn--ghost" hidden>Показать ещё</button>
  <div id="reviews-empty" hidden>Пока отзывов нет. Будь первым после посещения!</div>
</section>

<script define:vars={{ slug: club.slug }}>
  // wire setupClubReviews(slug) on DOMContentLoaded
</script>
```

`src/scripts/club-reviews.ts`:

```typescript
const PAGE_SIZE = 10;

export async function setupClubReviews(slug: string): Promise<void> {
  const listEl = document.getElementById('reviews-list');
  if (!listEl) return;

  let offset = 0;
  async function loadPage() {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, text, created_at, user_id')
      .eq('club_slug', slug)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { /* render error */ return; }
    // we also need email for masking; fetch via RPC (see below) or skip
    // For MVP: show only date + rating + text. Identity = anonymous.
    if (offset === 0 && (data?.length ?? 0) === 0) {
      // show empty state
    }
    appendReviewCards(data ?? []);
    offset += PAGE_SIZE;
    toggleLoadMore((data?.length ?? 0) === PAGE_SIZE);
  }

  document.getElementById('reviews-load-more')?.addEventListener('click', loadPage);
  await loadPage();
}
```

**Identity display:** since RLS won't return other users' emails (auth.users only readable by owner), reviews are shown as anonymous with date only. Acceptable trade-off — most B2C sites do anonymous. If we want masked emails later, a SECURITY DEFINER RPC `get_review_authors(p_review_ids uuid[])` can return masked emails for a list of reviews.

### `/admin/reviews/` (new page)

`src/pages/admin/reviews.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import DashboardNav from '../../components/DashboardNav.astro';
---
<BaseLayout title="Модерация отзывов — respawn.kz" activeRoute="admin">
  <DashboardNav role="super_admin" active="reviews" />
  <section class="container">
    <h1>Модерация отзывов</h1>
    <div class="admin-filter">
      <label><input type="radio" name="status-filter" value="all" checked> Все</label>
      <label><input type="radio" name="status-filter" value="published"> Опубликованы</label>
      <label><input type="radio" name="status-filter" value="hidden"> Скрыты</label>
    </div>
    <div id="reviews-table">Загрузка…</div>
  </section>

  <script>
    import { setupAdminReviews } from '../../scripts/admin-reviews';
    setupAdminReviews();
  </script>
</BaseLayout>
```

`src/scripts/admin-reviews.ts`:
1. `requireSuperAdmin()`.
2. Load latest 50 reviews JOIN clubs (for club_name).
3. Render a table: rating | excerpt | club | date | user_id-prefix | status | actions.
4. Action "Скрыть" → prompt for reason → UPDATE status='hidden' + hidden_reason + hidden_by + hidden_at.
5. Action "Опубликовать" (for hidden) → UPDATE status='published' + clear hidden_*.

### `RatingStars.astro` component

`src/components/RatingStars.astro`:

```astro
---
interface Props {
  value: number;        // 0..5; can be float for display (e.g., 3.7)
  interactive?: boolean; // form mode adds buttons with data-rating-value
  size?: 'sm' | 'md' | 'lg';
}
const { value, interactive = false, size = 'md' } = Astro.props;
const cls = `rating-stars rating-stars--${size}` + (interactive ? ' rating-stars--interactive' : '');
---
<div class={cls} data-value={value}>
  {[1, 2, 3, 4, 5].map((n) => (
    interactive
      ? <button type="button" class="rating-stars__btn" data-rating-value={n} aria-label={`Поставить ${n}`}>★</button>
      : <span class={`rating-stars__star ${n <= value ? 'is-filled' : ''}`}>★</span>
  ))}
</div>
```

CSS adds neon-cyan filled stars + grey empty.

## Types

Add to `src/data/supabase-types.ts`:

```typescript
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

export type NewReview = Omit<Review, 'id' | 'status' | 'hidden_by' | 'hidden_at' | 'hidden_reason' | 'created_at' | 'updated_at'>;

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  published: 'Опубликован',
  hidden: 'Скрыт',
};
```

## SSG side: JSON-LD enhancement

`src/lib/reviews-loader.ts`:

```typescript
import { supabase } from './supabase';
import type { Review } from '../data/supabase-types';

export async function loadTopReviewsForClub(slug: string, limit = 5): Promise<Pick<Review, 'rating' | 'text' | 'created_at'>[]> {
  const { data } = await supabase
    .from('reviews')
    .select('rating, text, created_at')
    .eq('club_slug', slug)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
```

In `src/pages/clubs/[slug].astro`, extend the JSON-LD:

```javascript
const reviews = await loadTopReviewsForClub(club.slug, 5);
// ...
review: reviews.map((r) => ({
  '@type': 'Review',
  reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
  reviewBody: r.text,
  datePublished: r.created_at,
})),
```

This makes Google's rich result eligible for "review snippets" alongside the existing `aggregateRating`.

## Verification script

`scripts/verify-reviews.mjs` (10 checks):

1. `reviews` table exists.
2. `reviews_club_published_idx` partial index exists.
3. `reviews_user_idx` exists.
4. `UNIQUE(booking_id)` constraint exists.
5. `rating` CHECK constraint enforces 1..5.
6. `text` CHECK constraint enforces 10..1000 length.
7. RLS enabled + 6 policies exist (insert/select-published/select-own/select-super/delete-own/update-super).
8. `recalc_club_rating` function exists.
9. `reviews_recalc_rating` trigger exists.
10. `reviews_notify_created` trigger exists (migration 0014).
11. `notifications_outbox.event_type` CHECK contains `review_created`.
12. `notifications_outbox.source_table` CHECK contains `reviews`.

## Failure handling

| Scenario | Behavior |
|---|---|
| User submits review for someone else's booking | RLS INSERT rejected; client shows generic "Не удалось сохранить — попробуй ещё раз". |
| User submits review for a non-completed booking | Same as above. |
| Network error on submit | Form button re-enables; error message visible; no data loss. |
| Race: club admin marks booking completed AFTER review attempt | First attempt fails; user retries; succeeds. |
| Review text contains malicious HTML | Stored as-is (no escape at write); rendered with `escapeHtml()` at display. Anonymous identity = no XSS surface in display name. |
| `recalc_club_rating` errors (e.g., clubs row gone) | Trigger raises; review write rolls back. Acceptable: data integrity preserved. |
| Concurrent reviews for same club | trigger uses transactional read (`select avg`); minor stale-window between concurrent writes acceptable; eventually consistent within milliseconds. |
| Super-admin tries to hide a review while user is browsing | User sees the cached version until next page load. Acceptable. |
| Review deletion → recalc fires | Yes, AFTER DELETE trigger runs; clubs.rating drops accordingly. |

## Observability

- `notifications_outbox` for review-created emails: queryable by event_type.
- `reviews` queryable from `/admin/reviews` UI or SQL editor for moderation backlog.
- Pre-existing Edge Function logs cover email delivery.

## Acceptance criteria

1. **AC1:** User with a `bookings.status='completed'` row sees "Оставить отзыв" on `/me` next to that booking.
2. **AC2:** Clicking the CTA opens `/reviews/new?booking_id=X` where the form is enabled.
3. **AC3:** Submitting with rating=4 and text "Хорошее место, посоветую" succeeds and redirects to `/me`. The CTA is now replaced by "★ 4" badge + excerpt.
4. **AC4:** Within ~5 seconds, the email "Новый отзыв в <club> — ★4" arrives at every club_admin of the reviewed club.
5. **AC5:** Refreshing `/clubs/<slug>/` shows the review at the top of the "Отзывы" section; the gold-star pill at the top reflects the new average.
6. **AC6:** Attempting to submit a second review for the same booking via the form (e.g., manual URL revisit) shows "Отзыв уже оставлен" block instead of the form.
7. **AC7:** Attempting an INSERT via API for someone else's booking is RLS-rejected (returns 4xx; no row created).
8. **AC8:** Attempting an INSERT for a `bookings.status='pending'` booking is RLS-rejected.
9. **AC9:** Super-admin opens `/admin/reviews`, sees the new review, clicks "Скрыть" with reason "Спам". Review disappears from public page within next reload; `clubs.rating` recalculates without it.
10. **AC10:** Super-admin can re-publish a hidden review; rating recalculates again.
11. **AC11:** SSG-built `/clubs/<slug>/` has JSON-LD `review` array with up to 5 most-recent published reviews (visible via `view-source:`).
12. **AC12:** `scripts/verify-reviews.mjs` returns "12/12 checks passed".
13. **AC13:** `npm run build` succeeds; no TS errors via `npx astro check`.

**Note:** The DELETE policy for own reviews is set up (RLS allows it), but no UI button is exposed in v1. Users who want to retract a review contact support, or a future iteration adds the button. This keeps the v1 surface area tight.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sybil attack (fake bookings → fake reviews) | Bookings require auth + a real club_admin to mark `completed`. Friction is high enough for MVP. Future: rate-limit reviews per user, captcha on signup. |
| RLS bug in INSERT policy lets user review wrong booking | Acceptance tests AC7/AC8 catch this. Code review the INSERT policy carefully. |
| Trigger `recalc_club_rating` slow on high-volume clubs | Currently expected volume ≪100 reviews per club. AVG/COUNT is O(n) but n is small. Re-evaluate if any club passes 1000+ reviews. |
| User edits review to manipulate rating | Edits not allowed in MVP — only delete + re-create. The new review is treated as a fresh submission and recalc runs. |
| XSS via review text | Server stores raw; renderer must escape. `escapeHtml()` helper used in all 3 render paths (form preview, /clubs page, /admin). Also: don't put text into `<a href="...">` or HTML attribute contexts. |
| User abuses delete-then-resubmit | They can do this. Each review is a new audit row; admin can spot pattern. Acceptable for MVP. |
| Notification spam: club admin gets emails for every review | At MVP scale this is fine — reviews are infrequent. If it becomes a problem, batch into a daily digest (out of scope). |
| Schema.org Review snippets affect SEO before quality reviews exist | We embed only published reviews; super-admin can hide if needed. |

## Migration sequence

1. Write & commit `0013_reviews.sql`.
2. Apply 0013 via `DATABASE_URL=... node scripts/apply-sql.mjs supabase/migrations/0013_reviews.sql`.
3. Run `verify-reviews.mjs` partial check (skip 0014-dependent checks).
4. Write & commit `0014_reviews_notifications.sql`.
5. Apply 0014.
6. Run full `verify-reviews.mjs`. All 12 checks pass.
7. Update Edge Function: add `review_created` to `templates.ts`, redeploy via `supabase functions deploy send-notification`.
8. Add types in `supabase-types.ts`. Add components, pages, scripts.
9. `npm run build` + `npx astro check` → 0 errors.
10. Smoke: manually create a completed booking via super-admin path, log in as the customer, submit review, verify email arrives, verify rating updates.
11. Merge feature branch → main, `npm run deploy`.
12. Post-deploy smoke: open `/clubs/cyberzone/`, leave a test review, verify everything.
13. Update HANDOFF.md + Obsidian decisions/journal.

## Open items (none requiring user action up-front)

All design decisions are settled. The user-action items are smoke tests after deploy (manually leave a review via `/me`).
