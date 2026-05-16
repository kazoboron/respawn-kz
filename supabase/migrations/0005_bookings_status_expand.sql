-- Migration 0005: extend bookings status enum and add audit fields
-- Adds 'completed' and 'no_show' statuses. Adds club_admin and super_admin RLS policies.

-- Replace status CHECK constraint with extended enum
alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- Audit columns: who and when last changed the status
alter table public.bookings add column status_changed_at timestamptz default now();
alter table public.bookings add column status_changed_by uuid references auth.users(id);

-- Club admin reads/updates bookings of their club
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

-- Super-admin full access to bookings
create policy "super_admins read all bookings" on public.bookings
  for select using (auth.uid() in (select user_id from public.super_admins));

create policy "super_admins update all bookings" on public.bookings
  for update using (auth.uid() in (select user_id from public.super_admins));
