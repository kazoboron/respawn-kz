-- 0026 — fix wrong table name in notify_booking_created
--
-- Bug: migration 0025 replaced notify_booking_created() with code that
-- referenced `public.club_owners` — but that table doesn't exist. The
-- correct table is `public.club_admins` (created in 0003), wrapped by
-- the helper `get_club_admin_emails(slug)` (defined in 0012).
--
-- Every booking INSERT raised:
--   ERROR 42P01: relation "public.club_owners" does not exist
--
-- This migration rewrites the trigger function to use the existing
-- helpers — same behavior as 0025 (customer email + admin emails), but
-- with the correct underlying tables.

CREATE OR REPLACE FUNCTION notify_booking_created()
RETURNS trigger AS $$
DECLARE
  v_admin_email text;
  v_customer_email text;
  v_payload jsonb;
BEGIN
  -- Shared payload for both emails
  v_payload := jsonb_build_object(
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'date', NEW.date::text,
    'time_slot', NEW.time_slot,
    'hours', NEW.hours,
    'total_price', NEW.total_price,
    'customer_email', get_user_email(NEW.user_id),
    'booking_id', NEW.id
  );

  -- 1. Notify the CUSTOMER who just booked
  v_customer_email := get_user_email(NEW.user_id);

  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    VALUES
      ('booking_pending_customer', 'bookings', NEW.id, v_customer_email, v_payload)
    ON CONFLICT (event_type, source_id, recipient_email) DO NOTHING;
  END IF;

  -- 2. Notify each CLUB admin via the helper from 0012
  FOR v_admin_email IN SELECT email FROM get_club_admin_emails(NEW.club_slug) LOOP
    INSERT INTO public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    VALUES
      ('booking_created', 'bookings', NEW.id, v_admin_email, v_payload)
    ON CONFLICT (event_type, source_id, recipient_email) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION notify_booking_created() IS
  'Enqueues booking_pending_customer (to user) + booking_created (to each club admin) in notifications_outbox. Uses helpers from 0012. Fixed in 0026 — 0025 had wrong table name (club_owners) which doesnt exist.';
