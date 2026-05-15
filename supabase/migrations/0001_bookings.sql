-- Migration 0001: create bookings table with RLS

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  club_slug text not null,
  club_name text not null,
  city_id text not null,
  date date not null,
  time_slot text not null,
  hours int not null check (hours > 0 and hours <= 12),
  price_per_hour int not null check (price_per_hour > 0),
  total_price int not null check (total_price > 0),
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz default now()
);

create index bookings_user_id_idx on public.bookings (user_id, created_at desc);

alter table public.bookings enable row level security;

create policy "users read own bookings" on public.bookings
  for select using (auth.uid() = user_id);

create policy "users insert own bookings" on public.bookings
  for insert with check (auth.uid() = user_id);

create policy "users update own bookings" on public.bookings
  for update using (auth.uid() = user_id);
