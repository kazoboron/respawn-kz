-- Migration 0004: club_applications table
-- Incoming registration requests from prospective club owners.

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

-- Any logged-in user can insert their own application
create policy "anyone inserts own application" on public.club_applications
  for insert with check (auth.uid() = applicant_user_id);

-- Applicant reads own; super-admin reads all
create policy "applicant reads own" on public.club_applications
  for select using (
    auth.uid() = applicant_user_id
    or auth.uid() in (select user_id from public.super_admins)
  );

-- Only super-admin updates (approve/reject + review_note)
create policy "super_admin updates applications" on public.club_applications
  for update using (auth.uid() in (select user_id from public.super_admins));
