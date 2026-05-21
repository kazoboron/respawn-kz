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
