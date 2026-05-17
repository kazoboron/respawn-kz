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
