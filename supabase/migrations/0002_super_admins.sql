-- Migration 0002: super_admins table
-- Source of truth for super-admin role. Seeded once via service_role through Supabase Dashboard.

create table public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz default now(),
  added_by uuid references auth.users(id)
);

alter table public.super_admins enable row level security;

-- Only existing super-admins can read this table.
-- First row must be inserted via service_role (Supabase Dashboard SQL editor as postgres user).
create policy "super_admins read by super_admins" on public.super_admins
  for select using (auth.uid() in (select user_id from public.super_admins));

-- Super-admins can grant/revoke super-admin role
create policy "super_admins manage super_admins" on public.super_admins
  for all using (auth.uid() in (select user_id from public.super_admins));
