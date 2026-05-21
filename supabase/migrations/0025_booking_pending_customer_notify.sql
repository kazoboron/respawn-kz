-- 0025 — also email the customer when their booking is created
--
-- Existing trigger from 0012 (notify_booking_created) only inserts into
-- notifications_outbox for CLUB admins. The customer who just made the
-- booking gets nothing in their inbox — only the success modal on the page.
-- That's a UX gap: if they close the tab they have no proof their booking
-- exists.
--
-- This migration extends the trigger to also enqueue a `booking_pending_customer`
-- email to the customer's address. The Edge Function (send-notification)
-- needs a matching template — added in the same PR.
--
-- Idempotent: re-creating the CHECK constraint each run is safe.
-- The `event_type` column is `text` (not an enum), guarded by a CHECK
-- constraint named `notifications_outbox_event_type_check`. Migrations
-- 0014/0015/0017 extended this list the same way — drop & re-add.

ALTER TABLE public.notifications_outbox
  DROP CONSTRAINT IF EXISTS notifications_outbox_event_type_check;

ALTER TABLE public.notifications_outbox
  ADD CONSTRAINT notifications_outbox_event_type_check
  CHECK (event_type IN (
    'application_submitted',
    'application_approved',
    'application_rejected',
    'booking_created',
    'booking_confirmed',
    'booking_cancelled',
    'booking_completed',
    'booking_no_show',
    'booking_rescheduled',
    'review_replied',
    'booking_pending_customer'
  ));

-- Replace the trigger function to also enqueue customer-side email.
-- Preserves existing club-admin notification behavior; just adds one more
-- insert per booking for the customer.
CREATE OR REPLACE FUNCTION notify_booking_created()
RETURNS trigger AS $$
DECLARE
  v_admin_email text;
  v_customer_email text;
  v_payload jsonb;
BEGIN
  -- Build shared payload for both emails
  v_payload := jsonb_build_object(
    'club_slug', NEW.club_slug,
    'club_name', NEW.club_name,
    'date', NEW.date,
    'time_slot', NEW.time_slot,
    'hours', NEW.hours,
    'total_price', NEW.total_price,
    'customer_email', (SELECT email FROM auth.users WHERE id = NEW.user_id),
    'booking_id', NEW.id
  );

  -- 1. Notify the CUSTOMER who just booked
  SELECT email INTO v_customer_email
    FROM auth.users WHERE id = NEW.user_id;

  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    VALUES
      ('booking_pending_customer', 'bookings', NEW.id, v_customer_email, v_payload)
    ON CONFLICT (event_type, source_id, recipient_email) DO NOTHING;
  END IF;

  -- 2. Notify each CLUB admin (unchanged from previous logic)
  FOR v_admin_email IN
    SELECT u.email
    FROM public.club_owners co
    JOIN auth.users u ON u.id = co.user_id
    WHERE co.club_slug = NEW.club_slug
      AND u.email IS NOT NULL
  LOOP
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
  'Enqueues booking_pending_customer (to user) + booking_created (to each club admin) in notifications_outbox. Idempotent via UNIQUE constraint on outbox.';
