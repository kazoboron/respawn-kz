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
