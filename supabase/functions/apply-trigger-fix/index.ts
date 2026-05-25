// One-shot: replace broken notify_booking_created() trigger.
// Returns both before/after + env diagnostic in a single POST response.

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

// Wildcard headers — must cover all supabase-js auto-injected headers
// (authorization, apikey, content-type, x-client-info, x-supabase-api-version)
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
  'content-type': 'application/json',
};

function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: cors });

  const env = {
    has_SUPABASE_DB_URL: !!Deno.env.get('SUPABASE_DB_URL'),
    has_SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  };

  if (req.method !== 'POST') {
    return j({ ok: false, error: 'POST only', env }, 405);
  }

  let Client: typeof import('https://deno.land/x/postgres@v0.19.3/mod.ts').Client;
  try {
    ({ Client } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts'));
  } catch (e) {
    return j({ ok: false, stage: 'import', error: String(e), env }, 500);
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    return j({ ok: false, stage: 'env', error: 'SUPABASE_DB_URL missing', env }, 500);
  }

  const client = new Client(dbUrl);
  try {
    await client.connect();

    const before = await client.queryObject<{ prosrc: string }>(
      "SELECT prosrc FROM pg_proc WHERE proname = 'notify_booking_created' LIMIT 1"
    );
    const beforeSrc = before.rows[0]?.prosrc ?? '';

    await client.queryArray(FIX_SQL);

    const after = await client.queryObject<{ prosrc: string }>(
      "SELECT prosrc FROM pg_proc WHERE proname = 'notify_booking_created' LIMIT 1"
    );
    const afterSrc = after.rows[0]?.prosrc ?? '';

    return j({
      ok: true,
      before: {
        contains_club_owners: beforeSrc.includes('club_owners'),
        contains_helper: beforeSrc.includes('get_club_admin_emails'),
      },
      after: {
        contains_club_owners: afterSrc.includes('club_owners'),
        contains_helper: afterSrc.includes('get_club_admin_emails'),
        preview: afterSrc.slice(0, 300),
      },
    });
  } catch (e) {
    return j({ ok: false, stage: 'db', error: e instanceof Error ? e.message : String(e), env }, 500);
  } finally {
    try { await client.end(); } catch (_) {}
  }
});
