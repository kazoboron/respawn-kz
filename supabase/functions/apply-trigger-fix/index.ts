// One-shot Edge Function: replaces the broken notify_booking_created()
// trigger. Uses pg from the standard library instead of deno-postgres
// to avoid third-party import failures.

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

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });

  // Diagnostic — what env vars are visible?
  const env = {
    has_SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
    has_SUPABASE_ANON_KEY: !!Deno.env.get('SUPABASE_ANON_KEY'),
    has_SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    has_SUPABASE_DB_URL: !!Deno.env.get('SUPABASE_DB_URL'),
  };

  if (req.method === 'GET') {
    return json({ ok: true, mode: 'echo', env });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Use GET (diagnose) or POST (apply)' }, 405);
  }

  // Lazy import deno-postgres only on POST so GET still works for diagnosis
  // even if the import fails. Wrap import in try/catch so we get a useful
  // error JSON instead of a CORS-less fetch failure.
  let Client: typeof import('https://deno.land/x/postgres@v0.19.3/mod.ts').Client;
  try {
    ({ Client } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts'));
  } catch (e) {
    return json({ ok: false, error: 'postgres import failed', detail: String(e), env }, 500);
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    return json({ ok: false, error: 'SUPABASE_DB_URL not set in function env', env }, 500);
  }

  const client = new Client(dbUrl);
  try {
    await client.connect();
    await client.queryArray(FIX_SQL);
    const result = await client.queryObject<{ prosrc: string }>(
      "SELECT prosrc FROM pg_proc WHERE proname = 'notify_booking_created' LIMIT 1"
    );
    const src = result.rows[0]?.prosrc ?? '';
    return json({
      ok: true,
      mode: 'applied',
      after_contains_club_owners: src.includes('club_owners'),
      after_contains_helper: src.includes('get_club_admin_emails'),
      source_preview: src.slice(0, 300),
    });
  } catch (e) {
    return json({ ok: false, error: 'DB error', detail: e instanceof Error ? e.message : String(e), env }, 500);
  } finally {
    try { await client.end(); } catch (_) {}
  }
});
