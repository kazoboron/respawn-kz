-- Migration 0014: extend notifications_outbox for review_created event
-- and add trigger that fires emails to club admins.
-- Depends on 0012 (outbox + helpers) and 0013 (reviews table).

-- ============================================================
-- 1. Extend event_type CHECK to include review_created
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
    'review_created'
  ));

-- ============================================================
-- 2. Allow source_table = 'reviews' in outbox
-- ============================================================
alter table public.notifications_outbox
  drop constraint notifications_outbox_source_table_check;
alter table public.notifications_outbox
  add constraint notifications_outbox_source_table_check
  check (source_table in ('bookings', 'club_applications', 'reviews'));

-- ============================================================
-- 3. notify_review_created trigger function
-- ============================================================
create or replace function notify_review_created()
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
  -- Defensive: emit only when first inserted as published.
  if NEW.status != 'published' then
    return NEW;
  end if;

  v_customer_email := get_user_email(NEW.user_id);

  v_payload := jsonb_build_object(
    'review_id', NEW.id,
    'booking_id', NEW.booking_id,
    'club_slug', NEW.club_slug,
    'club_name', (select name from public.clubs where slug = NEW.club_slug),
    'rating', NEW.rating,
    'text', NEW.text,
    'customer_email', v_customer_email
  );

  for v_admin_email in select email from get_club_admin_emails(NEW.club_slug) loop
    insert into public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    values
      ('review_created', 'reviews', NEW.id, v_admin_email, v_payload)
    on conflict (event_type, source_id, recipient_email) do nothing;
  end loop;

  return NEW;
end;
$$;

create trigger reviews_notify_created
  after insert on public.reviews
  for each row execute function notify_review_created();
