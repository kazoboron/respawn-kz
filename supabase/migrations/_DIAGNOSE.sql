-- Diagnostic for respawn.kz email pipeline
-- Run in Supabase SQL Editor → Run. Read the 4 result sets below.

-- 1. WHO are the super-admins (who receives application_submitted emails)
SELECT
  '1. super_admins'  AS section,
  u.email,
  u.id              AS user_id,
  u.created_at      AS user_created,
  sa.created_at     AS made_admin_at
FROM public.super_admins sa
JOIN auth.users u ON u.id = sa.user_id
ORDER BY sa.created_at;

-- 2. Last 10 outbox entries — did our trigger ever fire? Did the function process them?
SELECT
  '2. outbox_last_10' AS section,
  event_type,
  recipient_email,
  status,             -- 'pending' = trigger inserted, function hasn't processed yet
                      -- 'sent'    = function delivered to Resend
                      -- 'failed'  = function tried and failed
  attempts,
  last_error,
  resend_message_id,
  created_at,
  sent_at
FROM public.notifications_outbox
ORDER BY created_at DESC
LIMIT 10;

-- 3. How many are stuck pending? (function not deployed / not triggered / Resend down)
SELECT
  '3. outbox_pending_count' AS section,
  status,
  COUNT(*) AS n,
  MIN(created_at) AS oldest_in_status
FROM public.notifications_outbox
GROUP BY status
ORDER BY status;

-- 4. Club admins per club — which clubs would actually receive booking_created emails
SELECT
  '4. club_admins' AS section,
  co.club_slug,
  c.name AS club_name,
  u.email AS admin_email
FROM public.club_owners co
JOIN auth.users u ON u.id = co.user_id
LEFT JOIN public.clubs c ON c.slug = co.club_slug
ORDER BY co.club_slug, u.email;
