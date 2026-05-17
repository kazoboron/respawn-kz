-- Migration 0010: Fix infinite recursion in super_admins RLS
--
-- The original super_admins policies used a self-referential subselect:
--   auth.uid() in (select user_id from public.super_admins)
--
-- When clubs RLS also references super_admins, Postgres evaluates ALL
-- applicable policies causing infinite recursion even for anon users.
--
-- Fix: create a SECURITY DEFINER helper that reads super_admins bypassing
-- RLS, then rewrite all policies across all affected tables to use it.

-- ─────────────────────────────────────────────────────────────────────
-- 1. SECURITY DEFINER helper (runs as owner, bypasses RLS on super_admins)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.super_admins where user_id = auth.uid()
  );
$$;

grant execute on function public.is_super_admin() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 2. super_admins table
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "super_admins read by super_admins" on public.super_admins;
drop policy if exists "super_admins manage super_admins"  on public.super_admins;

create policy "super_admins read by super_admins" on public.super_admins
  for select using (public.is_super_admin());

create policy "super_admins manage super_admins" on public.super_admins
  for all using (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 3. clubs table
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "super_admins read all clubs" on public.clubs;
drop policy if exists "super_admins manage clubs"   on public.clubs;

create policy "super_admins read all clubs" on public.clubs
  for select using (public.is_super_admin());

create policy "super_admins manage clubs" on public.clubs
  for all using (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 4. club_admins table
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "club_admins read own"         on public.club_admins;
drop policy if exists "super_admin manages club_admins" on public.club_admins;

create policy "club_admins read own" on public.club_admins
  for select using (
    auth.uid() = user_id
    or public.is_super_admin()
  );

create policy "super_admin manages club_admins" on public.club_admins
  for all using (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 5. club_applications table
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "applicant reads own"          on public.club_applications;
drop policy if exists "super_admin updates applications" on public.club_applications;

create policy "applicant reads own" on public.club_applications
  for select using (
    auth.uid() = applicant_user_id
    or public.is_super_admin()
  );

create policy "super_admin updates applications" on public.club_applications
  for update using (public.is_super_admin());
