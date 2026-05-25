// One-shot Edge Function: replaces the broken notify_booking_created()
// trigger with the corrected version (using get_club_admin_emails helper
// instead of the nonexistent public.club_owners table from migration 0025).
//
// Deploy once, invoke once with the project's anon-key Authorization header
// (function expects to be called by an authenticated party), then delete.
// Uses SUPABASE_DB_URL which Supabase auto-injects into Edge Functions.

import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const FIX_SQL = `
CREATE OR REPLACE FUNCTION notify_booking_created()
RETURNS trigger AS $$
DECLARE
  v_admin_email text;
  v_customer_email text;
  v_payload jsonb;
BEGIN
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

  v_customer_email := get_user_email(NEW.user_id);

  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notifications_outbox
      (event_type, source_table, source_id, recipient_email, payload)
    VALUES
      ('booking_pending_customer', 'bookings', NEW.id, v_customer_email, v_payload)
    ON CONFLICT (event_type, source_id, recipient_email) DO NOTHING;
  END IF;

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
`;

const DIAGNOSE_SQL = `SELECT prosrc FROM pg_proc WHERE proname = 'notify_booking_created' LIMIT 1`;

Deno.serve(async (req) => {
  // CORS for browser test, GET only diagnostic, POST runs the fix
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'content-type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response('', { headers });

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL missing' }), { status: 500, headers });
  }

  const client = new Client(dbUrl);
  try {
    await client.connect();
    if (req.method === 'GET') {
      const result = await client.queryObject<{ prosrc: string }>(DIAGNOSE_SQL);
      const src = result.rows[0]?.prosrc ?? '';
      return new Response(JSON.stringify({
        ok: true,
        mode: 'diagnose',
        contains_club_owners: src.includes('club_owners'),
        contains_get_club_admin_emails: src.includes('get_club_admin_emails'),
        source_preview: src.slice(0, 400),
      }), { headers });
    }
    if (req.method === 'POST') {
      await client.queryArray(FIX_SQL);
      const after = await client.queryObject<{ prosrc: string }>(DIAGNOSE_SQL);
      const src = after.rows[0]?.prosrc ?? '';
      return new Response(JSON.stringify({
        ok: true,
        mode: 'applied',
        after_contains_club_owners: src.includes('club_owners'),
        after_contains_helper: src.includes('get_club_admin_emails'),
      }), { headers });
    }
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers });
  } finally {
    try { await client.end(); } catch (_) {}
  }
});
