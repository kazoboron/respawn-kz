-- Migration 0012: notifications_outbox table + email-lookup helpers + 4 triggers
-- on bookings and club_applications. See spec
-- docs/superpowers/specs/2026-05-18-respawn-kz-email-notifications-design.md

-- ============================================================
-- 1. Outbox table
-- ============================================================
create table public.notifications_outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show'
  )),
  source_table text not null check (source_table in ('bookings', 'club_applications')),
  source_id uuid not null,
  recipient_email text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,
  resend_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (event_type, source_id, recipient_email)
);

create index notifications_outbox_status_created_idx
  on public.notifications_outbox (status, created_at);

create index notifications_outbox_source_idx
  on public.notifications_outbox (source_table, source_id);

-- ============================================================
-- 2. RLS — super_admins read only; service_role writes via bypass
-- ============================================================
alter table public.notifications_outbox enable row level security;

create policy "super_admins read outbox" on public.notifications_outbox
  for select using (is_super_admin());

-- ============================================================
-- 3. Email-lookup helpers (SECURITY DEFINER bypasses RLS on auth.users)
-- ============================================================
create or replace function get_user_email(p_user_id uuid)
returns text as $$
  select email from auth.users where id = p_user_id;
$$ language sql security definer stable;

create or replace function get_club_admin_emails(p_club_slug text)
returns table (email text) as $$
  select u.email
  from public.club_admins ca
  join auth.users u on u.id = ca.user_id
  where ca.club_slug = p_club_slug;
$$ language sql security definer stable;

create or replace function get_super_admin_emails()
returns table (email text) as $$
  select u.email
  from public.super_admins sa
  join auth.users u on u.id = sa.user_id;
$$ language sql security definer stable;

-- ============================================================
-- 4. RPC for Edge Function to update outbox rows atomically
-- ============================================================
create or replace function update_outbox_result(
  p_id uuid,
  p_status text,
  p_error text,
  p_resend_message_id text
) returns void as $$
  update public.notifications_outbox
  set status = p_status,
      attempts = attempts + 1,
      last_error = p_error,
      resend_message_id = coalesce(p_resend_message_id, resend_message_id),
      sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id;
$$ language sql security definer;
