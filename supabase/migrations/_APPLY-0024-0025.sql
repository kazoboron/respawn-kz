-- =============================================================
-- APPLY BUNDLE: 0024 + 0025 — auto-expire + customer email
-- Paste this whole file into Supabase SQL Editor → Run.
-- Safe to re-run (idempotent via IF NOT EXISTS / ON CONFLICT).
-- =============================================================

-- 0024 — auto-expire stale pending bookings
--
-- Problem: a customer creates a booking; status defaults to 'pending';
-- it sits there forever if the club admin never confirms. The customer
-- shows up to a club that doesn't know about them, or wastes a day waiting.
--
-- Solution: function `expire_stale_pending_bookings()` that marks any
-- pending booking older than 24 hours as 'cancelled' (with a notice that
-- it expired). Run it either:
--   1. From a Supabase scheduled job (cron) — recommended
--   2. Manually via SELECT expire_stale_pending_bookings();
--   3. From an Edge Function on a timer
--
-- Idempotent — safe to call multiple times. Returns affected row count.

CREATE OR REPLACE FUNCTION public.expire_stale_pending_bookings(
  ttl_hours integer DEFAULT 24
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.bookings
  SET
    status = 'cancelled',
    -- Append note so we know WHY this got cancelled, not user-initiated
    cancellation_reason = COALESCE(cancellation_reason, '') ||
      CASE WHEN cancellation_reason IS NULL OR cancellation_reason = ''
        THEN 'Авто-отмена: клуб не подтвердил бронь за ' || ttl_hours || ' ч.'
        ELSE ''
      END
  WHERE
    status = 'pending'
    AND created_at < (now() - (ttl_hours || ' hours')::interval);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Grant execute to authenticated users (so they can call it from client
-- if needed) and to service_role for cron jobs.
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_bookings(integer)
  TO authenticated, service_role;

-- ----- Add cancellation_reason column if not yet present -----
-- Older schemas may not have it; safe-add so future logic can use it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN cancellation_reason text;
  END IF;
END $$;

-- ----- Schedule it via pg_cron if extension available -----
-- pg_cron is available on Supabase Pro+. On Free tier this DO block silently
-- skips — call expire_stale_pending_bookings() manually from an Edge Function
-- or admin UI instead. The function itself is created either way.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule previous version if any (idempotent re-run)
    PERFORM cron.unschedule('expire-stale-pending-bookings')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-pending-bookings'
      );
    -- Schedule hourly: at minute 5 of every hour
    PERFORM cron.schedule(
      'expire-stale-pending-bookings',
      '5 * * * *',
      'SELECT public.expire_stale_pending_bookings(24);'
    );
  END IF;
END $$;

-- Comments for the schema docs
COMMENT ON FUNCTION public.expire_stale_pending_bookings(integer) IS
  'Marks pending bookings older than ttl_hours (default 24) as cancelled. Run hourly via pg_cron when available, otherwise call manually.';


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
-- Idempotent: if the new event_type already exists in the enum, skip.

-- Add 'booking_pending_customer' to the event_type enum if missing.
-- IF NOT EXISTS variant works in Postgres 12+ and runs as a standalone
-- statement (no transaction wrap) so Supabase SQL Editor accepts it.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'booking_pending_customer';

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
