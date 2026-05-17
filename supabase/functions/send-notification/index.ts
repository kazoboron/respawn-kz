// Edge Function: send-notification
// Invoked by Database Webhook on INSERT into public.notifications_outbox.
// Sends an email via Resend, then updates the row status via RPC.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4';
import { renderTemplate } from './templates.ts';
import type { OutboxRow, WebhookPayload } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@mail.respawn.kz';
const FROM_NAME = 'respawn.kz';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'notifications_outbox') {
    return new Response('Ignored', { status: 200 });
  }

  const row = payload.record;

  if (row.status !== 'pending') {
    return new Response('Already processed', { status: 200 });
  }

  const rendered = renderTemplate(row.event_type, row.payload);
  if (!rendered) {
    await markFailed(row.id, `Unknown event_type: ${row.event_type}`);
    return new Response('Unknown event_type', { status: 422 });
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: row.recipient_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'X-Entity-Ref-ID': row.id,
        },
      },
      {
        idempotencyKey: row.id,
      },
    );

    if (error) {
      await markFailed(row.id, `Resend error: ${error.message}`);
      return new Response('Resend rejected', { status: 422 });
    }

    await markSent(row.id, data?.id);
    return new Response('OK', { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await incrementAttempts(row.id, msg);
    return new Response(`Transient error: ${msg}`, { status: 503 });
  }
});

async function markSent(id: string, resendMessageId: string | undefined) {
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'sent',
    p_error: null,
    p_resend_message_id: resendMessageId ?? null,
  });
}

async function markFailed(id: string, error: string) {
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'failed',
    p_error: error.slice(0, 1000),
    p_resend_message_id: null,
  });
}

async function incrementAttempts(id: string, error: string) {
  await supabase.rpc('update_outbox_result', {
    p_id: id,
    p_status: 'pending',
    p_error: error.slice(0, 1000),
    p_resend_message_id: null,
  });
}
