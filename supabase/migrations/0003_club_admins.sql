-- Migration 0003: club_admins table
-- Maps users to clubs they manage. One user can administrate multiple clubs.

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

-- Club admin reads only own rows; super-admin reads all
create policy "club_admins read own" on public.club_admins
  for select using (
    auth.uid() = user_id
    or auth.uid() in (select user_id from public.super_admins)
  );

-- Only super-admin can insert/update/delete (grants/revokes ownership)
create policy "super_admin manages club_admins" on public.club_admins
  for all using (auth.uid() in (select user_id from public.super_admins));
