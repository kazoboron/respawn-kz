-- Migration 0015: customer reschedule of pending bookings.
-- See spec docs/superpowers/specs/2026-05-19-respawn-kz-booking-reschedule-design.md

-- ============================================================
-- 1. Extend notifications_outbox.event_type CHECK with 10th value
-- ============================================================
alter table public.notifications_outbox
  drop constraint notifications_outbox_event_type_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_event_type_check
  check (event_type in (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'review_created',
    'booking_rescheduled'
  ));

-- ============================================================
-- 2. Guard trigger — restrict customer reschedule to pending only
-- ============================================================
create or replace function check_booking_reschedule_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when no actual reschedule fields changed.
  if NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  -- Customer (owner without admin powers) can only reschedule pending.
  if auth.uid() = OLD.user_id
     and OLD.status != 'pending'
     and not exists (
       select 1 from public.club_admins
       where user_id = auth.uid() and club_slug = OLD.club_slug
     )
     and not is_super_admin() then
    raise exception 'Cannot reschedule % booking', OLD.status;
  end if;

  return NEW;
end;
$$;

revoke execute on function check_booking_reschedule_allowed()
  from public, anon, authenticated;

create trigger bookings_reschedule_guard
  before update of date, time_slot, hours on public.bookings
  for each row execute function check_booking_reschedule_allowed();

-- ============================================================
-- 3. Notify trigger — fire booking_rescheduled outbox per club_admin
-- ============================================================
create or replace function notify_booking_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_admin_email text;
  v_customer_email text;
begin
  -- Skip when no real reschedule (defense-in-depth — also caught above).
  if NEW.date = OLD.date
     and NEW.time_slot = OLD.time_slot
     and NEW.hours = OLD.hours then
    return NEW;
  end if;

  v_customer_email := get_user_email(NEW.user_id);

  v_payload := jsonb_build_object(
    'booking_id', NEW.id,
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'old_date', OLD.date::text,
    'old_time_slot', OLD.time_slot,
    'old_hours', OLD.hours,
    'new_date', NEW.date::text,
    'new_time_slot', NEW.time_slot,
    'new_hours', NEW.hours,
    'total_price', NEW.total_price,
    'customer_email', v_customer_email
  );

  for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('booking_rescheduled', 'bookings', NEW.id, v_admin_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$;

create trigger bookings_notify_rescheduled
  after update of date, time_slot, hours on public.bookings
  for each row execute function notify_booking_rescheduled();
