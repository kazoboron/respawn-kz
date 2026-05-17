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

-- ============================================================
-- 5. Add assigned_slug to club_applications (needed by application_approved trigger)
-- ============================================================
alter table public.club_applications
  add column if not exists assigned_slug text;

-- ============================================================
-- 6. Replace approve_club_application RPC to also stamp assigned_slug
-- ============================================================
create or replace function approve_club_application(
  p_application_id uuid,
  p_club_slug text,
  p_review_note text default null
) returns text
language plpgsql
security invoker
as $$
declare v_app club_applications;
begin
  if not exists (select 1 from super_admins where user_id = auth.uid()) then
    raise exception 'Only super-admins can approve';
  end if;

  select * into v_app from club_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_app.status != 'pending' then
    raise exception 'Application already %', v_app.status;
  end if;

  insert into clubs (
    slug, name, city, district, address, phone, price_per_hour,
    working_hours, description, gradient, initial, is_published
  ) values (
    p_club_slug, v_app.club_name, v_app.city, v_app.district, v_app.address,
    v_app.applicant_phone, 1000,
    '{}'::jsonb,
    v_app.description,
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    upper(left(v_app.club_name, 1)),
    false
  );

  if v_app.applicant_user_id is not null then
    insert into club_admins (user_id, club_slug, granted_by)
    values (v_app.applicant_user_id, p_club_slug, auth.uid());
  end if;

  update club_applications set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_review_note,
    assigned_slug = p_club_slug
  where id = p_application_id;

  return p_club_slug;
end;
$$;

-- ============================================================
-- 7. Trigger: bookings AFTER INSERT → booking_created → emails to club admins
-- ============================================================
create or replace function notify_booking_created()
returns trigger as $$
declare
  v_payload jsonb;
  v_admin_email text;
begin
  v_payload := jsonb_build_object(
    'booking_id', NEW.id,
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'date', NEW.date::text,
    'time_slot', NEW.time_slot,
    'hours', NEW.hours,
    'total_price', NEW.total_price,
    'customer_email', get_user_email(NEW.user_id)
  );

  for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('booking_created', 'bookings', NEW.id, v_admin_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_notify_created
  after insert on public.bookings
  for each row execute function notify_booking_created();

-- ============================================================
-- 8. Trigger: bookings AFTER UPDATE OF status → booking_confirmed/cancelled/completed/no_show
-- Recipient = the party who did NOT initiate the change (status_changed_by vs user_id)
-- ============================================================
create or replace function notify_booking_status_change()
returns trigger as $$
declare
  v_event_type text;
  v_recipient_type text;
  v_payload jsonb;
  v_customer_email text;
  v_admin_email text;
begin
  if NEW.status = OLD.status then
    return NEW;
  end if;

  v_event_type := 'booking_' || NEW.status;
  v_customer_email := get_user_email(NEW.user_id);

  if NEW.status_changed_by = NEW.user_id then
    v_recipient_type := 'club_admins';
  else
    v_recipient_type := 'customer';
  end if;

  v_payload := jsonb_build_object(
    'booking_id', NEW.id,
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'date', NEW.date::text,
    'time_slot', NEW.time_slot,
    'hours', NEW.hours,
    'total_price', NEW.total_price,
    'old_status', OLD.status,
    'new_status', NEW.status,
    'customer_email', v_customer_email
  );

  if v_recipient_type = 'customer' then
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      (v_event_type, 'bookings', NEW.id, v_customer_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  else
    for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
      insert into public.notifications_outbox
        (event_type, source_table, source_id, recipient_email, payload)
      values
        (v_event_type, 'bookings', NEW.id, v_admin_email, v_payload)
      on conflict (event_type, source_id, recipient_email) do nothing;
    end loop;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger bookings_notify_status_change
  after update of status on public.bookings
  for each row execute function notify_booking_status_change();

-- ============================================================
-- 9. Trigger: club_applications AFTER INSERT → application_submitted → super_admins
-- ============================================================
create or replace function notify_application_submitted()
returns trigger as $$
declare
  v_payload jsonb;
  v_super_email text;
begin
  v_payload := jsonb_build_object(
    'application_id', NEW.id,
    'applicant_email', NEW.applicant_email,
    'applicant_name', NEW.applicant_name,
    'applicant_phone', NEW.applicant_phone,
    'club_name', NEW.club_name,
    'city', NEW.city,
    'address', NEW.address,
    'description', NEW.description
  );

  for v_super_email in select email from get_super_admin_emails() loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('application_submitted', 'club_applications', NEW.id, v_super_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger applications_notify_submitted
  after insert on public.club_applications
  for each row execute function notify_application_submitted();

-- ============================================================
-- 10. Trigger: club_applications AFTER UPDATE OF status → application_approved/rejected
-- ============================================================
create or replace function notify_application_status_change()
returns trigger as $$
declare
  v_event_type text;
  v_payload jsonb;
begin
  if NEW.status = OLD.status then
    return NEW;
  end if;
  if NEW.status not in ('approved', 'rejected') then
    return NEW;
  end if;

  v_event_type := 'application_' || NEW.status;

  v_payload := jsonb_build_object(
    'application_id', NEW.id,
    'applicant_email', NEW.applicant_email,
    'applicant_name', NEW.applicant_name,
    'club_name', NEW.club_name,
    'club_slug', NEW.assigned_slug,
    'review_note', NEW.review_note,
    'new_status', NEW.status
  );

  insert into public.notifications_outbox
    (event_type, source_table, source_id, recipient_email, payload)
  values
    (v_event_type, 'club_applications', NEW.id, NEW.applicant_email, v_payload)
  on conflict (event_type, source_id, recipient_email) do nothing;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger applications_notify_status_change
  after update of status on public.club_applications
  for each row execute function notify_application_status_change();
