-- =====================================================================
-- ONE-SHOT APPLY: B2B Cabinet (migrations 0002-0006 + first super_admin)
-- =====================================================================
-- Copy this entire file into Supabase Dashboard SQL Editor and Run.
--
-- WARNING: This is idempotent ONLY in the sense that re-running will fail
-- safely (CREATE TABLE will error if tables exist). Run ONCE.
--
-- Project: qfuhtvtietnldeqklxdo
-- Dashboard: https://app.supabase.com/project/qfuhtvtietnldeqklxdo/sql/new
-- =====================================================================


-- =====================================================================
-- 0002: super_admins
-- =====================================================================

create table public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz default now(),
  added_by uuid references auth.users(id)
);

alter table public.super_admins enable row level security;

create policy "super_admins read by super_admins" on public.super_admins
  for select using (auth.uid() in (select user_id from public.super_admins));

create policy "super_admins manage super_admins" on public.super_admins
  for all using (auth.uid() in (select user_id from public.super_admins));


-- =====================================================================
-- 0003: club_admins
-- =====================================================================

create table public.club_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  club_slug text not null,
  created_at timestamptz default now(),
  granted_by uuid references auth.users(id),
  unique (user_id, club_slug)
);

create index club_admins_user_id_idx on public.club_admins (user_id);
create index club_admins_slug_idx on public.club_admins (club_slug);

alter table public.club_admins enable row level security;

create policy "club_admins read own" on public.club_admins
  for select using (
    auth.uid() = user_id
    or auth.uid() in (select user_id from public.super_admins)
  );

create policy "super_admin manages club_admins" on public.club_admins
  for all using (auth.uid() in (select user_id from public.super_admins));


-- =====================================================================
-- 0004: club_applications
-- =====================================================================

create table public.club_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid references auth.users(id) on delete set null,
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  club_name text not null,
  city text not null,
  district text,
  address text not null,
  working_hours text,
  equipment_note text,
  photo_url text,
  description text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz default now()
);

create index club_applications_status_idx on public.club_applications (status, created_at desc);
create index club_applications_user_idx on public.club_applications (applicant_user_id);

alter table public.club_applications enable row level security;

create policy "anyone inserts own application" on public.club_applications
  for insert with check (auth.uid() = applicant_user_id);

create policy "applicant reads own" on public.club_applications
  for select using (
    auth.uid() = applicant_user_id
    or auth.uid() in (select user_id from public.super_admins)
  );

create policy "super_admin updates applications" on public.club_applications
  for update using (auth.uid() in (select user_id from public.super_admins));


-- =====================================================================
-- 0005: bookings status enum expand + RLS
-- =====================================================================

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

alter table public.bookings add column status_changed_at timestamptz default now();
alter table public.bookings add column status_changed_by uuid references auth.users(id);

create policy "club_admins read club bookings" on public.bookings
  for select using (
    exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = bookings.club_slug
    )
  );

create policy "club_admins update club bookings" on public.bookings
  for update using (
    exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = bookings.club_slug
    )
  );

create policy "super_admins read all bookings" on public.bookings
  for select using (auth.uid() in (select user_id from public.super_admins));

create policy "super_admins update all bookings" on public.bookings
  for update using (auth.uid() in (select user_id from public.super_admins));


-- =====================================================================
-- 0006: bookings status transition trigger
-- =====================================================================

create or replace function check_booking_status_transition()
returns trigger as $$
begin
  if OLD.status in ('cancelled', 'completed', 'no_show')
     and NEW.status != OLD.status then
    raise exception 'Cannot change booking from terminal status %', OLD.status;
  end if;

  if auth.uid() = OLD.user_id
     and NEW.status != OLD.status
     and NEW.status != 'cancelled' then
    if not exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = OLD.club_slug
    ) and not exists (
      select 1 from public.super_admins where user_id = auth.uid()
    ) then
      raise exception 'Customers can only cancel own bookings';
    end if;
  end if;

  if auth.uid() = OLD.user_id
     and NEW.status = 'cancelled'
     and OLD.date < current_date then
    if not exists (
      select 1 from public.club_admins
      where user_id = auth.uid() and club_slug = OLD.club_slug
    ) and not exists (
      select 1 from public.super_admins where user_id = auth.uid()
    ) then
      raise exception 'Cannot cancel bookings from past dates';
    end if;
  end if;

  NEW.status_changed_at := now();
  NEW.status_changed_by := auth.uid();

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_status_transition_check
  before update of status on public.bookings
  for each row execute function check_booking_status_transition();


-- =====================================================================
-- SEED: first super_admin (auto-resolves UID by email)
-- =====================================================================
-- Uses zhandos397@gmail.com from project memory.
-- If the email doesn't match an auth.users row, the SELECT returns 0 rows
-- and INSERT does nothing — make sure you're registered first.

insert into public.super_admins (user_id)
select id from auth.users where email = 'zhandos397@gmail.com'
on conflict (user_id) do nothing;


-- =====================================================================
-- VERIFY: should return 1 row showing your email
-- =====================================================================

select sa.user_id, u.email, sa.added_at
from public.super_admins sa
join auth.users u on u.id = sa.user_id;
